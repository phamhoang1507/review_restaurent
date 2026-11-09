from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

MAX_BIGINT = 9223372036854775807
MAX_INTEGER = 2147483647

PlaceName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]

PlaceAddress = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
]

PlaceDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=10000),
]


class PlaceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    district_id: int = Field(ge=1, le=MAX_BIGINT)
    name: PlaceName
    address: PlaceAddress
    description: PlaceDescription
    min_price: int = Field(ge=0, le=MAX_INTEGER)
    max_price: int = Field(ge=0, le=MAX_INTEGER)

    @model_validator(mode="after")
    def validate_price_range(self) -> Self:
        if self.max_price < self.min_price:
            raise ValueError("max_price must be greater than or equal to min_price")

        return self


class PlaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    district_id: int | None = Field(default=None, ge=1, le=MAX_BIGINT)
    name: PlaceName | None = None
    address: PlaceAddress | None = None
    description: PlaceDescription | None = None
    min_price: int | None = Field(default=None, ge=0, le=MAX_INTEGER)
    max_price: int | None = Field(default=None, ge=0, le=MAX_INTEGER)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_update(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field is required")

        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")

        if (
            self.min_price is not None
            and self.max_price is not None
            and self.max_price < self.min_price
        ):
            raise ValueError("max_price must be greater than or equal to min_price")

        return self


class PlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    district_id: int
    created_by: int
    name: str
    address: str
    description: str
    min_price: int
    max_price: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    rating: float | None = None
    review_count: int = 0


class PlaceCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_at: AwareDatetime
    id: int = Field(ge=1, le=MAX_BIGINT)


class PlaceListResponse(BaseModel):
    items: list[PlaceResponse]
    next_cursor: str | None