from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt

from app.core.auth_config import get_auth_settings


def create_access_token(user_id: int) -> tuple[str, int]:
    settings = get_auth_settings()
    now = datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_minutes)

    payload = {
        "sub": str(user_id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + lifetime,
        "jti": str(uuid4()),
        "token_type": "access",
    }

    token = jwt.encode(
        payload,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> int:
    settings = get_auth_settings()

    payload = jwt.decode(
        token,
        settings.jwt_secret_key.get_secret_value(),
        algorithms=[settings.jwt_algorithm],
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        options={
            "require": [
                "sub",
                "iss",
                "aud",
                "iat",
                "exp",
                "jti",
                "token_type",
            ],
        },
    )

    if payload["token_type"] != "access":
        raise jwt.InvalidTokenError("Invalid token type")

    subject = payload["sub"]

    if not isinstance(subject, str) or not subject.isascii() or not subject.isdecimal():
        raise jwt.InvalidTokenError("Invalid subject")

    user_id = int(subject)

    if not 1 <= user_id <= 9223372036854775807:
        raise jwt.InvalidTokenError("Invalid subject")

    return user_id