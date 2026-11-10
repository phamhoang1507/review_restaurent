from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Identity,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class StorageDeletionJob(TimestampMixin, Base):
    __tablename__ = "storage_deletion_jobs"

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    storage_key: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        unique=True,
    )

    attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    last_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "attempts >= 0",
            name="attempts_nonnegative",
        ),
        Index(
            "ix_storage_deletion_jobs_next_attempt_id",
            "next_attempt_at",
            "id",
        ),
    )