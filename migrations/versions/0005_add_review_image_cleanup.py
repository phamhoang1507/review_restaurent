"""Add review image bounds and durable storage cleanup.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_review_images_position_nonnegative"),
        "review_images",
        type_="check",
    )

    op.create_check_constraint(
        op.f("ck_review_images_position_range"),
        "review_images",
        "position BETWEEN 0 AND 4",
    )

    op.add_column(
        "review_images",
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'ready'"),
            nullable=False,
        ),
    )

    op.create_check_constraint(
        op.f("ck_review_images_status_allowed"),
        "review_images",
        "status IN ('pending', 'ready')",
    )

    op.create_index(
        "ix_review_images_pending_created_id",
        "review_images",
        ["created_at", "id"],
        unique=False,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.create_table(
        "storage_deletion_jobs",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(),
            nullable=False,
        ),
        sa.Column(
            "storage_key",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "attempts",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "last_error",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "attempts >= 0",
            name=op.f(
                "ck_storage_deletion_jobs_attempts_nonnegative"
            ),
        ),
        sa.PrimaryKeyConstraint(
            "id",
            name=op.f("pk_storage_deletion_jobs"),
        ),
        sa.UniqueConstraint(
            "storage_key",
            name=op.f(
                "uq_storage_deletion_jobs_storage_key"
            ),
        ),
    )

    op.create_index(
        "ix_storage_deletion_jobs_next_attempt_id",
        "storage_deletion_jobs",
        ["next_attempt_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_storage_deletion_jobs_next_attempt_id",
        table_name="storage_deletion_jobs",
    )

    op.drop_table("storage_deletion_jobs")

    op.drop_index(
        "ix_review_images_pending_created_id",
        table_name="review_images",
    )

    op.drop_constraint(
        op.f("ck_review_images_status_allowed"),
        "review_images",
        type_="check",
    )

    op.drop_column(
        "review_images",
        "status",
    )

    op.drop_constraint(
        op.f("ck_review_images_position_range"),
        "review_images",
        type_="check",
    )

    op.create_check_constraint(
        op.f("ck_review_images_position_nonnegative"),
        "review_images",
        "position >= 0",
    )