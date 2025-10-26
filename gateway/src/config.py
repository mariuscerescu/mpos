import os
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "gateway")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me")
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_seconds: int = int(os.getenv("JWT_ACCESS_TTL_SECONDS", "900"))
    jwt_refresh_ttl_seconds: int = int(os.getenv("JWT_REFRESH_TTL_SECONDS", "604800"))
    postgres_dsn: str = os.getenv("POSTGRES_DSN", "postgresql+asyncpg://ocr_admin:ocr_admin@postgres:5432/ocr_platform")
    user_service_url: str = os.getenv("USER_SERVICE_URL", "http://user-service:8001")
    document_service_url: str = os.getenv("DOCUMENT_SERVICE_URL", "http://document-service:8002")
    broker_service_url: str = os.getenv("BROKER_SERVICE_URL", "http://broker-service:8003")
    environment: Literal["dev", "prod", "test"] = os.getenv("ENVIRONMENT", "dev")


def get_settings() -> Settings:
    return Settings()
