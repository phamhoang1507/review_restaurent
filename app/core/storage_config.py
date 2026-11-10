from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class StorageSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    s3_endpoint_url: str = "http://minio:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "us-east-1"

    s3_access_key: str = Field(min_length=3)
    s3_secret_key: SecretStr = Field(min_length=8)

    s3_bucket: str = Field(
        default="localspot-reviews",
        pattern=r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$",
    )

    s3_presigned_ttl_seconds: int = Field(
        default=300,
        ge=60,
        le=3600,
    )

    image_upload_max_bytes: int = Field(
        default=10 * 1024 * 1024,
        ge=1024,
        le=50 * 1024 * 1024,
    )

    image_max_pixels: int = Field(
        default=20_000_000,
        ge=1,
        le=100_000_000,
    )

    image_max_dimension: int = Field(
        default=2048,
        ge=256,
        le=8192,
    )

    image_webp_quality: int = Field(
        default=82,
        ge=50,
        le=95,
    )

    image_upload_rate_limit: int = Field(
        default=20,
        ge=1,
        le=1000,
    )

    image_upload_rate_window_seconds: int = Field(
        default=60,
        ge=1,
        le=3600,
    )

    image_processing_concurrency: int = Field(
        default=2,
        ge=1,
        le=16,
    )

    image_pending_ttl_seconds: int = Field(
        default=900,
        ge=60,
        le=86400,
    )

    storage_cleanup_interval_seconds: int = Field(
        default=60,
        ge=10,
        le=3600,
    )


@lru_cache
def get_storage_settings() -> StorageSettings:
    return StorageSettings()