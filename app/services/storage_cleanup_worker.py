import logging
import signal
from contextlib import closing
from threading import Event

from app.core.storage_config import get_storage_settings
from app.db.session import SessionLocal
from app.services.storage import create_s3_client
from app.services.storage_cleanup import (
    enqueue_stale_pending_uploads,
    process_storage_deletion_jobs,
)

logger = logging.getLogger(__name__)

BATCH_SIZE = 100


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s %(levelname)s "
            "%(name)s %(message)s"
        ),
    )

    stop = Event()

    def request_stop(_signum, _frame) -> None:
        stop.set()

    signal.signal(
        signal.SIGTERM,
        request_stop,
    )

    signal.signal(
        signal.SIGINT,
        request_stop,
    )

    interval = (
        get_storage_settings()
        .storage_cleanup_interval_seconds
    )

    with closing(create_s3_client()) as client:
        while not stop.is_set():
            try:
                with SessionLocal() as session:
                    stale_pending = (
                        enqueue_stale_pending_uploads(
                            session,
                            limit=BATCH_SIZE,
                        )
                    )

                    deleted, failed = (
                        process_storage_deletion_jobs(
                            session,
                            client,
                            limit=BATCH_SIZE,
                        )
                    )

                if stale_pending or deleted or failed:
                    logger.info(
                        "Storage cleanup batch: "
                        "stale_pending=%s, "
                        "deleted=%s, failed=%s",
                        stale_pending,
                        deleted,
                        failed,
                    )
            except Exception:
                logger.exception(
                    "Storage cleanup batch failed"
                )

            stop.wait(interval)


if __name__ == "__main__":
    main()