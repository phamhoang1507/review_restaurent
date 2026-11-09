import base64
import binascii

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.modules.places.models import Place
from app.modules.places.schemas import PlaceCursor


def encode_cursor(place: Place) -> str:
    payload = PlaceCursor(
        created_at=place.created_at,
        id=place.id,
    ).model_dump_json()

    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(value: str) -> PlaceCursor:
    try:
        padded = value + "=" * (-len(value) % 4)

        decoded = base64.b64decode(
            padded,
            altchars=b"-_",
            validate=True,
        )

        return PlaceCursor.model_validate_json(decoded)
    except (ValueError, binascii.Error, ValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid pagination cursor",
        ) from exc