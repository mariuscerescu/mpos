import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "broker-service")
    postgres_dsn: str = os.getenv("POSTGRES_DSN", "postgresql+asyncpg://ocr_admin:ocr_admin@postgres:5432/ocr_platform")
    visibility_timeout_seconds: int = int(os.getenv("VISIBILITY_TIMEOUT_SECONDS", "120"))
    job_lease_seconds: int = int(os.getenv("JOB_LEASE_SECONDS", "60"))
    cleanup_interval_seconds: int = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "30"))
    definitions_path: Path = Path(os.getenv("BROKER_DEFINITIONS_PATH", "/app/definitions.json"))

    def load_topic_definitions(self) -> dict[str, Any]:
        if not self.definitions_path.exists():
            return {}
        with self.definitions_path.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
        topics = {item["name"]: item for item in data.get("topics", [])}
        return topics


def get_settings() -> Settings:
    return Settings()
