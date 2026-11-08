from fastapi import HTTPException, Request, status

from app.core.auth_config import get_auth_settings


def require_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    allowed_origins = get_auth_settings().auth_allowed_origins

    if origin is None or origin not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Untrusted request origin",
        )