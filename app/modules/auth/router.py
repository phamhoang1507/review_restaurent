from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.tokens import create_access_token
from app.db.session import get_session
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.modules.auth.service import authenticate_user, register_user
from app.modules.users.schemas import UserResponse
from app.modules.auth.rate_limit import limit_login, limit_registration

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
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
    dependencies=[Depends(limit_login)],
)
def login(
    data: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    user = authenticate_user(session, data)
    token, expires_in = create_access_token(user.id)

    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
    )