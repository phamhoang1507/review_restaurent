import base64
import binascii

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.modules.reviews.models import Review
from app.modules.reviews.schemas import ReviewCursor


def encode_cursor(review: Review) -> str:
    payload = ReviewCursor(
        created_at=review.created_at,
        id=review.id,
    ).model_dump_json()

    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(value: str) -> ReviewCursor:
    try:
        padded = value + "=" * (-len(value) % 4)

        decoded = base64.b64decode(
            padded,
            altchars=b"-_",
            validate=True,
        )

        return ReviewCursor.model_validate_json(decoded)
    except (ValueError, binascii.Error, ValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid pagination cursor",
        ) from exc