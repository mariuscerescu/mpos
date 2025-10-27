import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "ocr-service")
    broker_service_url: str = os.getenv("BROKER_SERVICE_URL", "http://broker-service:8003")
    document_service_url: str = os.getenv("DOCUMENT_SERVICE_URL", "http://document-service:8002")
    queue_topic: str = os.getenv("QUEUE_TOPIC", "ocr_extract")
    # Tesseract configurare
    tesseract_lang: str = os.getenv("TESSERACT_LANG", "eng")
    tesseract_psm: str = os.getenv("TESSERACT_PSM", "6")  # Page segmentation mode
    tesseract_oem: str = os.getenv("TESSERACT_OEM", "3")  # OCR Engine mode


def get_settings() -> Settings:
    return Settings()
