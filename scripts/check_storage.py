from contextlib import closing
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import urlopen
from uuid import uuid4

from app.core.storage_config import get_storage_settings
from app.services.init_storage import ensure_bucket
from app.services.storage import create_s3_client


def main() -> None:
    settings = get_storage_settings()
    key = f"verification/{uuid4().hex}.txt"
    payload = b"LocalSpot private storage verification"

    with closing(create_s3_client()) as client:
        ensure_bucket(client)
        ensure_bucket(client)
        print("PASS: bucket initialization can run repeatedly")

        try:
            client.put_object(
                Bucket=settings.s3_bucket,
                Key=key,
                Body=payload,
                ContentType="text/plain",
            )
            print("PASS: object upload")

            unsigned_url = (
                f"{settings.s3_endpoint_url.rstrip('/')}/"
                f"{settings.s3_bucket}/{quote(key, safe='/')}"
            )

            try:
                with urlopen(unsigned_url, timeout=10):
                    raise AssertionError("Anonymous object access succeeded")
            except HTTPError as exc:
                assert exc.code == 403, (
                    f"Unexpected anonymous status: {exc.code}"
                )

            print("PASS: anonymous access rejected")

            signed_url = client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": settings.s3_bucket,
                    "Key": key,
                },
                ExpiresIn=60,
            )

            with urlopen(signed_url, timeout=10) as response:
                assert response.read() == payload

            print("PASS: signed object read")

            with closing(create_s3_client(public=True)) as public_client:
                public_url = public_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": settings.s3_bucket,
                        "Key": key,
                    },
                    ExpiresIn=settings.s3_presigned_ttl_seconds,
                )

                assert urlsplit(public_url).netloc == urlsplit(
                    settings.s3_public_endpoint_url
                ).netloc

            print("PASS: browser URL uses configured endpoint")
        finally:
            client.delete_object(
                Bucket=settings.s3_bucket,
                Key=key,
            )

        try:
            client.head_object(
                Bucket=settings.s3_bucket,
                Key=key,
            )
        except client.exceptions.ClientError as exc:
            assert exc.response["ResponseMetadata"]["HTTPStatusCode"] == 404
        else:
            raise AssertionError("Test object was not deleted")

        print("PASS: test object removed")


if __name__ == "__main__":
    main()