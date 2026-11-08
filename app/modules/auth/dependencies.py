from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.tokens import decode_access_token
from app.db.session import get_session
from app.modules.users.models import User

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="AccessToken",
)


def authentication_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    if credentials is None:
        raise authentication_error()

    try:
        user_id = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        raise authentication_error() from exc

    user = session.get(User, user_id)

    if user is None or not user.is_active:
        raise authentication_error()

    return user


def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    return user