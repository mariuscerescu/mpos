import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "ocr-service")
    broker_service_url: str = os.getenv("BROKER_SERVICE_URL", "http://broker-service:8003")
    document_service_url: str = os.getenv("DOCUMENT_SERVICE_URL", "http://document-service:8002")
    queue_topic: str = os.getenv("QUEUE_TOPIC", "ocr_extract")
    model_name: str = os.getenv("OCR_MODEL_NAME", "microsoft/trocr-small-printed")


def get_settings() -> Settings:
    return Settings()
