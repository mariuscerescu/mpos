import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "document-service")
    postgres_dsn: str = os.getenv("POSTGRES_DSN", "postgresql+asyncpg://ocr_admin:ocr_admin@postgres:5432/ocr_platform")
    broker_service_url: str = os.getenv("BROKER_SERVICE_URL", "http://broker-service:8003")
    storage_backend: str = os.getenv("STORAGE_BACKEND", "postgres")
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "10"))


def get_settings() -> Settings:
    return Settings()
