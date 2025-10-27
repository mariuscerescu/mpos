from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

DocumentStatus = Literal[
    "uploaded",
    "queued_preprocessing",
    "preprocessing",
    "queued_ocr",
    "ocr",
    "completed",
    "failed",
]


class DocumentMetadata(BaseModel):
    id: str
    owner_id: str
    filename: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None
    ocr_text: Optional[str] = None


class DocumentUploadResponse(BaseModel):
    document: DocumentMetadata


class ProcessDocumentsRequest(BaseModel):
    document_ids: list[str]
