from typing import Annotated

from fastapi import Depends, Request

from app.core.storage_config import get_storage_settings
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.rate_limit import enforce_rate_limit
from app.modules.users.models import User


def get_image_upload_user(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    settings = get_storage_settings()

    enforce_rate_limit(
        request,
        scope="upload",
        limit=settings.image_upload_rate_limit,
        identifier=f"user:{user.id}",
        namespace="review-images",
        window_seconds=settings.image_upload_rate_window_seconds,
        unavailable_detail="Image upload temporarily unavailable",
    )

    return user