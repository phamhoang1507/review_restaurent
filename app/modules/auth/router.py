from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.auth_config import get_auth_settings
from app.core.tokens import create_access_token
from app.db.session import get_session
from app.modules.auth.csrf import require_trusted_origin
from app.modules.auth.rate_limit import (
    limit_login,
    limit_logout,
    limit_refresh,
    limit_registration,
)
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.modules.auth.service import authenticate_user, register_user
from app.modules.auth.sessions import (
    create_auth_session,
    invalid_refresh_token,
    revoke_auth_session,
    rotate_auth_session,
)
from app.modules.users.schemas import UserResponse

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

REFRESH_COOKIE_PATH = "/api/v1/auth"


def prevent_caching(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

def set_refresh_cookie(
    response: Response,
    token: str,
    expires_at: datetime,
) -> None:
    settings = get_auth_settings()

    if expires_at.tzinfo is None or expires_at.utcoffset() is None:
        raise ValueError("Refresh expiration must be timezone-aware")

    expires_at_utc = expires_at.astimezone(UTC)

    remaining_seconds = max(
        0,
        int((expires_at_utc - datetime.now(UTC)).total_seconds()),
    )

    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        max_age=remaining_seconds,
        expires=expires_at_utc,
        path=REFRESH_COOKIE_PATH,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="lax",
    )

def delete_refresh_cookie(response: Response) -> None:
    settings = get_auth_settings()

    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=REFRESH_COOKIE_PATH,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limit_registration)],
)
def register(
    data: RegisterRequest,
    session: Annotated[Session, Depends(get_session)],
) -> UserResponse:
    user = register_user(session, data)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[
        Depends(require_trusted_origin),
        Depends(limit_login),
    ],
)
def login(
    data: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    user = authenticate_user(session, data)
    access_token, expires_in = create_access_token(user.id)
    refresh_token, expires_at = create_auth_session(session, user.id)

    set_refresh_cookie(response, refresh_token, expires_at)
    prevent_caching(response)

    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[
        Depends(require_trusted_origin),
        Depends(limit_refresh),
    ],
)
def refresh(
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    settings = get_auth_settings()
    raw_token = request.cookies.get(settings.refresh_cookie_name)

    if not raw_token:
        raise invalid_refresh_token()

    user, replacement, expires_at = rotate_auth_session(
        session,
        raw_token,
    )

    access_token, expires_in = create_access_token(user.id)

    set_refresh_cookie(response, replacement, expires_at)
    prevent_caching(response)

    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_trusted_origin),
        Depends(limit_logout),
    ],
)
def logout(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    settings = get_auth_settings()

    revoke_auth_session(
        session,
        request.cookies.get(settings.refresh_cookie_name),
    )

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    delete_refresh_cookie(response)
    prevent_caching(response)

    return response