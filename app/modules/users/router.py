from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.schemas import UserResponse

router = APIRouter(
    prefix="/users",
    tags=["users"],
)


@router.get(
    "/me",
    response_model=UserResponse,
)
def read_current_user(
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    response.headers["Cache-Control"] = "no-store"
    return UserResponse.model_validate(user)