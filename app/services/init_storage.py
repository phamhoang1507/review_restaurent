from contextlib import closing
import time

from botocore.exceptions import (
    ClientError,
    ConnectionClosedError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
)

from app.core.storage_config import get_storage_settings
from app.services.storage import create_s3_client

TRANSIENT_ERRORS = (
    ConnectionClosedError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
)


def ensure_bucket(client) -> None:
    settings = get_storage_settings()

    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as exc:
        code = str(exc.response["Error"]["Code"])

        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise

        options = {"Bucket": settings.s3_bucket}

        if settings.s3_region != "us-east-1":
            options["CreateBucketConfiguration"] = {
                "LocationConstraint": settings.s3_region,
            }

        try:
            client.create_bucket(**options)
        except ClientError as create_error:
            create_code = str(create_error.response["Error"]["Code"])

            if create_code != "BucketAlreadyOwnedByYou":
                raise

    # This bucket is dedicated to LocalSpot and must not allow anonymous access.
    client.delete_bucket_policy(Bucket=settings.s3_bucket)


def main() -> None:
    with closing(create_s3_client()) as client:
        for attempt in range(1, 31):
            try:
                ensure_bucket(client)
                print("Private LocalSpot storage bucket is ready.", flush=True)
                return
            except TRANSIENT_ERRORS:
                if attempt == 30:
                    raise

                print(
                    f"Storage is not reachable yet; retry {attempt}/30.",
                    flush=True,
                )
                time.sleep(1)
            except ClientError as exc:
                status_code = exc.response["ResponseMetadata"]["HTTPStatusCode"]

                if status_code < 500 or attempt == 30:
                    raise

                print(
                    f"Storage returned a temporary error; retry {attempt}/30.",
                    flush=True,
                )
                time.sleep(1)


if __name__ == "__main__":
    main()