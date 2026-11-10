from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    model_validator,
)

MAX_BIGINT = 9223372036854775807

ReviewContent = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=10,
        max_length=5000,
    ),
]

Rating = Annotated[int, Field(strict=True, ge=1, le=5)]


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: ReviewContent
    space_rating: Rating
    food_drink_rating: Rating
    value_rating: Rating


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: ReviewContent | None = None
    space_rating: Rating | None = None
    food_drink_rating: Rating | None = None
    value_rating: Rating | None = None

    @model_validator(mode="after")
    def validate_update(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field is required")

        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")

        return self

class ReviewImageResponse(BaseModel):
    id: int
    review_id: int
    url: str
    url_expires_in: int
    mime_type: str
    size_bytes: int
    width: int
    height: int
    position: int
    created_at: datetime

class ReviewResponse(BaseModel):
    id: int
    user_id: int
    place_id: int
    author_name: str
    content: str
    space_rating: int
    food_drink_rating: int
    value_rating: int
    created_at: datetime
    updated_at: datetime
    images: list[ReviewImageResponse] = Field(
        default_factory=list
    )

    @computed_field
    @property
    def overall_rating(self) -> float:
        return round(
            (
                self.space_rating
                + self.food_drink_rating
                + self.value_rating
            ) / 3,
            2,
        )


class ReviewCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_at: AwareDatetime
    id: int = Field(ge=1, le=MAX_BIGINT)


class ReviewListResponse(BaseModel):
    items: list[ReviewResponse]
    next_cursor: str | None