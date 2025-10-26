from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

DocumentEventType = Literal[
    "document_uploaded",
    "document_preprocessed",
    "document_ocr_completed",
    "document_failed",
]


class DocumentEvent(BaseModel):
    event_type: DocumentEventType
    document_id: str
    owner_id: str
    timestamp: datetime
    payload: Optional[dict] = None
