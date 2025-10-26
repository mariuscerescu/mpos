import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "image-preprocessing-service")
    broker_service_url: str = os.getenv("BROKER_SERVICE_URL", "http://broker-service:8003")
    document_service_url: str = os.getenv("DOCUMENT_SERVICE_URL", "http://document-service:8002")
    queue_topic: str = os.getenv("QUEUE_TOPIC", "image_preprocess")


def get_settings() -> Settings:
    return Settings()
