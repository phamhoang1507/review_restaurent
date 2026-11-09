from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.places.models import Place
from app.modules.reviews.models import Review
from app.modules.reviews.pagination import decode_cursor, encode_cursor
from app.modules.reviews.schemas import (
    ReviewCreate,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdate,
)
from app.modules.users.models import User


def serialize_review(
    review: Review,
    author_name: str,
) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        user_id=review.user_id,
        place_id=review.place_id,
        author_name=author_name,
        content=review.content,
        space_rating=review.space_rating,
        food_drink_rating=review.food_drink_rating,
        value_rating=review.value_rating,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def require_active_place(
    session: Session,
    place_id: int,
    *,
    lock: bool = False,
) -> Place:
    statement = select(Place).where(
        Place.id == place_id,
        Place.is_active.is_(True),
    )

    if lock:
        statement = statement.with_for_update()

    place = session.scalar(statement)

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Place not found",
        )

    return place


def create_review(
    session: Session,
    place_id: int,
    data: ReviewCreate,
    user: User,
) -> ReviewResponse:
    require_active_place(session, place_id, lock=True)

    review = Review(
        place_id=place_id,
        user_id=user.id,
        **data.model_dump(),
    )

    session.add(review)

    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()

        diagnostic = getattr(exc.orig, "diag", None)

        if (
            getattr(diagnostic, "constraint_name", None)
            == "uq_reviews_user_id_place_id"
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already reviewed this place",
            ) from exc

        raise

    return serialize_review(review, user.display_name)


def list_reviews(
    session: Session,
    place_id: int,
    *,
    limit: int,
    cursor: str | None,
) -> ReviewListResponse:
    require_active_place(session, place_id)

    statement = (
        select(Review, User.display_name)
        .join(User, User.id == Review.user_id)
        .where(Review.place_id == place_id)
    )

    if cursor:
        position = decode_cursor(cursor)

        statement = statement.where(
            or_(
                Review.created_at < position.created_at,
                and_(
                    Review.created_at == position.created_at,
                    Review.id < position.id,
                ),
            )
        )

    statement = statement.order_by(
        Review.created_at.desc(),
        Review.id.desc(),
    ).limit(limit + 1)

    rows = session.execute(statement).all()
    has_more = len(rows) > limit
    items = rows[:limit]

    return ReviewListResponse(
        items=[
            serialize_review(review, author_name)
            for review, author_name in items
        ],
        next_cursor=encode_cursor(items[-1][0]) if has_more else None,
    )


def lock_review(session: Session, review_id: int) -> Review:
    review = session.scalar(
        select(Review)
        .where(Review.id == review_id)
        .with_for_update()
    )

    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    return review


def update_review(
    session: Session,
    review_id: int,
    data: ReviewUpdate,
    user: User,
) -> ReviewResponse:
    review = lock_review(session, review_id)

    if review.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own review",
        )

    require_active_place(session, review.place_id)

    for field_name, value in data.model_dump(exclude_unset=True).items():
        setattr(review, field_name, value)

    session.commit()

    return serialize_review(review, user.display_name)


def delete_review(
    session: Session,
    review_id: int,
    user: User,
) -> None:
    review = lock_review(session, review_id)

    if review.user_id != user.id and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete this review",
        )

    session.delete(review)
    session.commit()