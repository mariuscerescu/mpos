from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

DocumentStatus = Literal[
    "uploaded",
    "queued_preprocessing",
    "preprocessing",
    "queued_ocr",
    "ocr",
    "completed",
    "failed",
]


class DocumentCreate(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    owner_id: str


class DocumentRead(BaseModel):
    id: str
    owner_id: str
    filename: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    ocr_text: Optional[str] = Field(default=None, description="OCR output if available")

    class Config:
        from_attributes = True


BinaryVariant = Literal["original", "preprocessed"]


class BinaryPayload(BaseModel):
    variant: BinaryVariant
    data_base64: str = Field(..., description="Base64 encoded binary payload")


class OCRTextPayload(BaseModel):
    text: str


class FailurePayload(BaseModel):
    error_message: str


class StatusUpdatePayload(BaseModel):
    status: DocumentStatus
    error_message: Optional[str] = None
    ocr_text: Optional[str] = None
