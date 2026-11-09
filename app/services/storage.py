import boto3
from botocore.config import Config

from app.core.storage_config import get_storage_settings


def create_s3_client(*, public: bool = False):
    settings = get_storage_settings()

    endpoint = (
        settings.s3_public_endpoint_url
        if public
        else settings.s3_endpoint_url
    )

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
        region_name=settings.s3_region,
        config=Config(
            signature_version="s3v4",
            connect_timeout=3,
            read_timeout=3,
            retries={"max_attempts": 0},
            s3={"addressing_style": "path"},
        ),
    )