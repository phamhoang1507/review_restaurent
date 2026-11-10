import hashlib
import logging

from fastapi import HTTPException, Request, status
from redis.exceptions import RedisError

from app.core.auth_config import get_auth_settings

logger = logging.getLogger(__name__)

RATE_LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])

if count == 1 or ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end

return {count, ttl}
"""


def enforce_rate_limit(
    request: Request,
    *,
    scope: str,
    limit: int,
    identifier: str | None = None,
    namespace: str = "auth",
    window_seconds: int | None = None,
    unavailable_detail: str = "Authentication temporarily unavailable",
) -> None:
    settings = get_auth_settings()
    client_host = request.client.host if request.client else "unknown"
    identity = identifier if identifier is not None else client_host
    identity_hash = hashlib.sha256(identity.encode()).hexdigest()
    key = f"localspot:rate-limit:{namespace}:{scope}:{identity_hash}"
    window = window_seconds or settings.auth_rate_window_seconds

    try:
        count, ttl = request.app.state.redis.eval(
            RATE_LIMIT_SCRIPT,
            1,
            key,
            window,
        )
    except RedisError as exc:
        logger.warning("Auth rate limiter unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=unavailable_detail,
            headers={"Retry-After": "5"},
        ) from exc

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests",
            headers={"Retry-After": str(max(1, int(ttl)))},
        )


def limit_login(request: Request) -> None:
    enforce_rate_limit(
        request,
        scope="login",
        limit=get_auth_settings().login_rate_limit,
    )


def limit_registration(request: Request) -> None:
    enforce_rate_limit(
        request,
        scope="register",
        limit=get_auth_settings().register_rate_limit,
    )


def limit_refresh(request: Request) -> None:
    enforce_rate_limit(
        request,
        scope="refresh",
        limit=get_auth_settings().refresh_rate_limit,
    )


def limit_logout(request: Request) -> None:
    enforce_rate_limit(
        request,
        scope="logout",
        limit=get_auth_settings().refresh_rate_limit,
    )
