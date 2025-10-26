import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "worker-service")
    broker_service_url: str = os.getenv("BROKER_SERVICE_URL", "http://broker-service:8003")
    document_service_url: str = os.getenv("DOCUMENT_SERVICE_URL", "http://document-service:8002")
    poll_interval_seconds: float = float(os.getenv("POLL_INTERVAL_SECONDS", "2.0"))
    document_events_topic: str = os.getenv("DOCUMENT_EVENTS_TOPIC", "document_events")
    preprocess_topic: str = os.getenv("PREPROCESS_TOPIC", "image_preprocess")
    ocr_topic: str = os.getenv("OCR_TOPIC", "ocr_extract")


def get_settings() -> Settings:
    return Settings()
