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


@lru_cache
def get_storage_settings() -> StorageSettings:
    return StorageSettings()