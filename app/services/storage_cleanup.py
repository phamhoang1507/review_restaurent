import logging
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.storage_config import get_storage_settings
from app.modules.reviews.models import ReviewImage
from app.services.models import StorageDeletionJob

logger = logging.getLogger(__name__)

MAX_ERROR_LENGTH = 2000
BASE_RETRY_SECONDS = 5
MAX_RETRY_SECONDS = 3600


def enqueue_storage_deletion(
    session: Session,
    storage_key: str,
) -> None:
    session.execute(
        insert(StorageDeletionJob)
        .values(storage_key=storage_key)
        .on_conflict_do_nothing(
            index_elements=["storage_key"]
        )
    )


def enqueue_storage_deletions(
    session: Session,
    storage_keys: Iterable[str],
) -> None:
    for storage_key in dict.fromkeys(storage_keys):
        enqueue_storage_deletion(
            session,
            storage_key,
        )


def process_locked_deletion_job(
    session: Session,
    client,
    job: StorageDeletionJob,
) -> bool:
    try:
        client.delete_object(
            Bucket=get_storage_settings().s3_bucket,
            Key=job.storage_key,
        )
    except (BotoCoreError, ClientError) as exc:
        job.attempts += 1
        job.last_error = (
            f"{type(exc).__name__}: {exc}"
        )[:MAX_ERROR_LENGTH]

        delay_seconds = min(
            MAX_RETRY_SECONDS,
            BASE_RETRY_SECONDS
            * (2 ** min(job.attempts - 1, 10)),
        )

        job.next_attempt_at = (
            datetime.now(UTC)
            + timedelta(seconds=delay_seconds)
        )

        session.commit()

        logger.warning(
            "Storage deletion failed for job %s (attempt %s)",
            job.id,
            job.attempts,
        )

        return False

    session.delete(job)
    session.commit()

    return True


def process_storage_deletion_keys(
    session: Session,
    client,
    storage_keys: Iterable[str],
) -> tuple[int, int]:
    deleted = 0
    failed = 0

    for storage_key in dict.fromkeys(storage_keys):
        job = session.scalar(
            select(StorageDeletionJob)
            .where(
                StorageDeletionJob.storage_key
                == storage_key
            )
            .with_for_update(skip_locked=True)
        )

        if job is None:
            continue

        if process_locked_deletion_job(
            session,
            client,
            job,
        ):
            deleted += 1
        else:
            failed += 1

    return deleted, failed


def process_storage_deletion_jobs(
    session: Session,
    client,
    *,
    limit: int,
) -> tuple[int, int]:
    deleted = 0
    failed = 0

    for _ in range(limit):
        job = session.scalar(
            select(StorageDeletionJob)
            .where(
                StorageDeletionJob.next_attempt_at
                <= func.now()
            )
            .order_by(
                StorageDeletionJob.next_attempt_at,
                StorageDeletionJob.id,
            )
            .with_for_update(skip_locked=True)
            .limit(1)
        )

        if job is None:
            break

        if process_locked_deletion_job(
            session,
            client,
            job,
        ):
            deleted += 1
        else:
            failed += 1

    return deleted, failed


def enqueue_stale_pending_uploads(
    session: Session,
    *,
    limit: int,
) -> int:
    cutoff = datetime.now(UTC) - timedelta(
        seconds=(
            get_storage_settings()
            .image_pending_ttl_seconds
        )
    )

    removed = 0

    for _ in range(limit):
        image = session.scalar(
            select(ReviewImage)
            .where(
                ReviewImage.status == "pending",
                ReviewImage.created_at < cutoff,
            )
            .order_by(
                ReviewImage.created_at,
                ReviewImage.id,
            )
            .with_for_update(skip_locked=True)
            .limit(1)
        )

        if image is None:
            break

        enqueue_storage_deletion(
            session,
            image.storage_key,
        )

        session.delete(image)
        session.commit()

        removed += 1

    return removed


def process_storage_deletion_keys_best_effort(
    session: Session,
    client,
    storage_keys: Iterable[str],
) -> None:
    try:
        process_storage_deletion_keys(
            session,
            client,
            storage_keys,
        )
    except Exception:
        session.rollback()

        logger.exception(
            "Immediate storage cleanup could not be completed"
        )