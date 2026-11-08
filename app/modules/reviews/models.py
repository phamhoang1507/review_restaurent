from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    place_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("places.id", ondelete="RESTRICT"),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    space_rating: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )

    food_drink_rating: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )

    value_rating: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "place_id",
            name="uq_reviews_user_id_place_id",
        ),
        CheckConstraint(
            "space_rating BETWEEN 1 AND 5",
            name="space_rating_range",
        ),
        CheckConstraint(
            "food_drink_rating BETWEEN 1 AND 5",
            name="food_drink_rating_range",
        ),
        CheckConstraint(
            "value_rating BETWEEN 1 AND 5",
            name="value_rating_range",
        ),
        Index(
            "ix_reviews_place_created_id",
            "place_id",
            text("created_at DESC"),
            text("id DESC"),
        ),
    )


class ReviewImage(Base):
    __tablename__ = "review_images"

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    review_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False,
    )

    storage_key: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    mime_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    size_bytes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    width: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    height: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    position: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "storage_key",
            name="uq_review_images_storage_key",
        ),
        UniqueConstraint(
            "review_id",
            "position",
            name="uq_review_images_review_id_position",
        ),
        CheckConstraint(
            "size_bytes > 0",
            name="size_bytes_positive",
        ),
        CheckConstraint(
            "width > 0",
            name="width_positive",
        ),
        CheckConstraint(
            "height > 0",
            name="height_positive",
        ),
        CheckConstraint(
            "position >= 0",
            name="position_nonnegative",
        ),
    )