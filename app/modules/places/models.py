from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Place(TimestampMixin, Base):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    district_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("districts.id", ondelete="RESTRICT"),
        nullable=False,
    )

    created_by: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    address: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    min_price: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    max_price: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        server_default=text("true"),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "min_price >= 0",
            name="min_price_nonnegative",
        ),
        CheckConstraint(
            "max_price >= min_price",
            name="price_range_valid",
        ),
        Index(
            "ix_places_district_created_id",
            "district_id",
            text("created_at DESC"),
            text("id DESC"),
        ),
    )