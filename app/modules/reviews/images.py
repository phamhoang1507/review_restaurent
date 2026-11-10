import logging
from collections.abc import Iterable
from threading import BoundedSemaphore
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.storage_config import get_storage_settings
from app.modules.places.models import Place
from app.modules.reviews.models import Review, ReviewImage
from app.modules.reviews.schemas import ReviewImageResponse
from app.modules.users.models import User
from app.services.images import process_upload_image
from app.services.storage_cleanup import (
    enqueue_storage_deletion,
    process_storage_deletion_keys_best_effort,
)

logger = logging.getLogger(__name__)

MAX_REVIEW_IMAGES = 5

IMAGE_PROCESSING_SLOTS = BoundedSemaphore(
    get_storage_settings().image_processing_concurrency
)


def serialize_review_image(
    image: ReviewImage,
    public_client,
) -> ReviewImageResponse:
    settings = get_storage_settings()

    url = public_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": image.storage_key,
        },
        ExpiresIn=settings.s3_presigned_ttl_seconds,
    )

    return ReviewImageResponse(
        id=image.id,
        review_id=image.review_id,
        url=url,
        url_expires_in=(
            settings.s3_presigned_ttl_seconds
        ),
        mime_type=image.mime_type,
        size_bytes=image.size_bytes,
        width=image.width,
        height=image.height,
        position=image.position,
        created_at=image.created_at,
    )


def load_review_images(
    session: Session,
    review_ids: Iterable[int],
    public_client,
) -> dict[int, list[ReviewImageResponse]]:
    unique_ids = list(
        dict.fromkeys(review_ids)
    )

    if not unique_ids:
        return {}

    images = session.scalars(
        select(ReviewImage)
        .where(
            ReviewImage.review_id.in_(unique_ids),
            ReviewImage.status == "ready",
        )
        .order_by(
            ReviewImage.review_id,
            ReviewImage.position,
        )
    ).all()

    result: dict[
        int,
        list[ReviewImageResponse],
    ] = {
        review_id: []
        for review_id in unique_ids
    }

    for image in images:
        result[image.review_id].append(
            serialize_review_image(
                image,
                public_client,
            )
        )

    return result


def require_review_owner(
    session: Session,
    review_id: int,
    user_id: int,
) -> None:
    row = session.execute(
        select(
            Review.user_id,
            Place.is_active,
        )
        .join(
            Place,
            Place.id == Review.place_id,
        )
        .where(
            Review.id == review_id
        )
    ).one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    owner_id, place_is_active = row

    if owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can only add images "
                "to your own review"
            ),
        )

    if not place_is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Place not found",
        )


def lock_owned_review(
    session: Session,
    review_id: int,
    user_id: int,
) -> Review:
    row = session.execute(
        select(Review, Place)
        .join(
            Place,
            Place.id == Review.place_id,
        )
        .where(
            Review.id == review_id
        )
        .with_for_update(of=Review)
    ).one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    review, place = row

    if review.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can only add images "
                "to your own review"
            ),
        )

    if not place.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Place not found",
        )

    return review


def abandon_pending_upload(
    session: Session,
    client,
    image_id: int,
    storage_key: str,
) -> None:
    try:
        session.rollback()

        image = session.scalar(
            select(ReviewImage)
            .where(
                ReviewImage.id == image_id,
                ReviewImage.status == "pending",
            )
            .with_for_update()
        )

        enqueue_storage_deletion(
            session,
            storage_key,
        )

        if image is not None:
            session.delete(image)

        session.commit()
    except SQLAlchemyError:
        session.rollback()

        logger.exception(
            "Could not persist cleanup "
            "for an incomplete upload"
        )

        return

    process_storage_deletion_keys_best_effort(
        session,
        client,
        [storage_key],
    )


def upload_review_image(
    session: Session,
    storage_client,
    public_client,
    review_id: int,
    upload: UploadFile,
    user: User,
) -> ReviewImageResponse:
    user_id = user.id

    require_review_owner(
        session,
        review_id,
        user_id,
    )

    existing_count = session.scalar(
        select(
            func.count(ReviewImage.id)
        ).where(
            ReviewImage.review_id == review_id
        )
    )

    if existing_count >= MAX_REVIEW_IMAGES:
        session.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A review can contain "
                "at most 5 images"
            ),
        )

    session.rollback()

    if not IMAGE_PROCESSING_SLOTS.acquire(
        timeout=5
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image processing is at capacity",
            headers={
                "Retry-After": "1",
            },
        )

    try:
        processed = process_upload_image(upload)
    finally:
        IMAGE_PROCESSING_SLOTS.release()

    lock_owned_review(
        session,
        review_id,
        user_id,
    )

    existing_positions = set(
        session.scalars(
            select(
                ReviewImage.position
            ).where(
                ReviewImage.review_id
                == review_id
            )
        )
    )

    available_position = next(
        (
            position
            for position
            in range(MAX_REVIEW_IMAGES)
            if position
            not in existing_positions
        ),
        None,
    )

    if available_position is None:
        session.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A review can contain "
                "at most 5 images"
            ),
        )

    settings = get_storage_settings()

    storage_key = (
        f"reviews/{review_id}/"
        f"{uuid4().hex}.webp"
    )

    image = ReviewImage(
        review_id=review_id,
        storage_key=storage_key,
        mime_type=processed.mime_type,
        size_bytes=len(processed.data),
        width=processed.width,
        height=processed.height,
        position=available_position,
        status="pending",
    )

    session.add(image)

    try:
        session.commit()
    except SQLAlchemyError as exc:
        session.rollback()

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image upload could not be started",
        ) from exc

    try:
        storage_client.put_object(
            Bucket=settings.s3_bucket,
            Key=storage_key,
            Body=processed.data,
            ContentLength=len(processed.data),
            ContentType=processed.mime_type,
            CacheControl="private, no-store",
        )
    except (BotoCoreError, ClientError) as exc:
        abandon_pending_upload(
            session,
            storage_client,
            image.id,
            storage_key,
        )

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Image storage is "
                "temporarily unavailable"
            ),
        ) from exc

    try:
        persisted_image = session.scalar(
            select(ReviewImage)
            .where(
                ReviewImage.id == image.id
            )
            .with_for_update()
        )

        if persisted_image is None:
            enqueue_storage_deletion(
                session,
                storage_key,
            )

            session.commit()

            process_storage_deletion_keys_best_effort(
                session,
                storage_client,
                [storage_key],
            )

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Review was removed "
                    "during the upload"
                ),
            )

        persisted_image.status = "ready"
        session.commit()
    except SQLAlchemyError as exc:
        session.rollback()

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Image upload is awaiting "
                "reconciliation"
            ),
        ) from exc

    return serialize_review_image(
        persisted_image,
        public_client,
    )


def list_public_review_images(
    session: Session,
    review_id: int,
    public_client,
) -> list[ReviewImageResponse]:
    exists = session.scalar(
        select(Review.id)
        .join(
            Place,
            Place.id == Review.place_id,
        )
        .where(
            Review.id == review_id,
            Place.is_active.is_(True),
        )
    )

    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    return load_review_images(
        session,
        [review_id],
        public_client,
    )[review_id]


def delete_review_image(
    session: Session,
    storage_client,
    image_id: int,
    user: User,
) -> None:
    review_id = session.scalar(
        select(
            ReviewImage.review_id
        ).where(
            ReviewImage.id == image_id
        )
    )

    if review_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review image not found",
        )

    review = session.scalar(
        select(Review)
        .where(
            Review.id == review_id
        )
        .with_for_update()
    )

    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review image not found",
        )

    if (
        review.user_id != user.id
        and user.role != "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You cannot delete "
                "this review image"
            ),
        )

    image = session.scalar(
        select(ReviewImage)
        .where(
            ReviewImage.id == image_id,
            ReviewImage.review_id == review.id,
        )
        .with_for_update()
    )

    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review image not found",
        )

    storage_key = image.storage_key

    enqueue_storage_deletion(
        session,
        storage_key,
    )

    session.delete(image)
    session.commit()

    process_storage_deletion_keys_best_effort(
        session,
        storage_client,
        [storage_key],
    )