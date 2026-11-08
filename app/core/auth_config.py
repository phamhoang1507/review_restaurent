from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "localspot-api"
    jwt_audience: str = "localspot-web"

    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=7, ge=1, le=30)

    refresh_cookie_name: str = "localspot_refresh"
    refresh_cookie_secure: bool = False

    auth_rate_window_seconds: int = Field(default=60, ge=1, le=3600)
    login_rate_limit: int = Field(default=10, ge=1, le=1000)
    register_rate_limit: int = Field(default=5, ge=1, le=1000)

    refresh_rate_limit: int = Field(default=30, ge=1, le=1000)

    auth_allowed_origins: list[str] = [
        "http://localhost:8001",
        "http://localhost:5173",
    ]

@lru_cache
def get_auth_settings() -> AuthSettings:
    return AuthSettings()