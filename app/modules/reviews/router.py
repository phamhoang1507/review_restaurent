from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.modules.auth.dependencies import get_current_user
from app.modules.reviews.schemas import (
    MAX_BIGINT,
    ReviewCreate,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdate,
)
from app.modules.reviews.service import (
    create_review,
    delete_review,
    list_reviews,
    update_review,
)
from app.modules.users.models import User

router = APIRouter(tags=["reviews"])


@router.get(
    "/places/{place_id}/reviews",
    response_model=ReviewListResponse,
)
def read_reviews(
    place_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(min_length=1, max_length=512)] = None,
) -> ReviewListResponse:
    return list_reviews(
        session,
        place_id,
        limit=limit,
        cursor=cursor,
    )


@router.post(
    "/places/{place_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_review(
    place_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    data: ReviewCreate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReviewResponse:
    return create_review(session, place_id, data, user)


@router.patch(
    "/reviews/{review_id}",
    response_model=ReviewResponse,
)
def edit_review(
    review_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    data: ReviewUpdate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReviewResponse:
    return update_review(session, review_id, data, user)


@router.delete(
    "/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_review(
    review_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    delete_review(session, review_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)