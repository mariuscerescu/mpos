import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "user-service")
    postgres_dsn: str = os.getenv("POSTGRES_DSN", "postgresql+asyncpg://ocr_admin:ocr_admin@postgres:5432/ocr_platform")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me")
    access_token_ttl_seconds: int = int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "900"))
    refresh_token_ttl_seconds: int = int(os.getenv("REFRESH_TOKEN_TTL_SECONDS", "604800"))


def get_settings() -> Settings:
    return Settings()
