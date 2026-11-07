from sqlalchemy import BigInteger, ForeignKey, Identity, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Province(Base):
    __tablename__ = "provinces"

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    districts: Mapped[list["District"]] = relationship(
        back_populates="province",
        passive_deletes="all",
    )


class District(Base):
    __tablename__ = "districts"

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    province_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("provinces.id", ondelete="RESTRICT"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    province: Mapped[Province] = relationship(
        back_populates="districts",
    )

    __table_args__ = (
        UniqueConstraint(
            "province_id",
            "name",
            name="uq_districts_province_id_name",
        ),
    )