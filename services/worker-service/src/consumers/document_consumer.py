from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict

from shared.schemas.events import DocumentEvent, DocumentEventType
from shared.utils.broker import AsyncBrokerClient

from ..core.config import Settings
from ..publishers.ocr_publisher import publish_ocr_task

logger = logging.getLogger(__name__)


Handler = Callable[[DocumentEvent], Awaitable[None]]


class DocumentConsumer:
    """Handle document lifecycle events and dispatch next-step jobs."""

    def __init__(self, broker: AsyncBrokerClient, *, settings: Settings) -> None:
        self._broker = broker
        self._settings = settings
        self._handlers: Dict[DocumentEventType, Handler] = {
            "document_uploaded": self._handle_document_uploaded,
            "document_preprocessed": self._handle_document_preprocessed,
            "document_ocr_completed": self._handle_document_completed,
            "document_failed": self._handle_document_failed,
        }

    async def handle(self, payload: dict[str, Any]) -> None:
        event = DocumentEvent.model_validate(payload)
        handler = self._handlers.get(event.event_type)
        if handler is None:
            logger.warning("No handler registered for event '%s'", event.event_type)
            return
        await handler(event)

    async def _handle_document_uploaded(self, event: DocumentEvent) -> None:
        logger.info("Enqueueing preprocessing job for document %s", event.document_id)
        job_id = await self._broker.enqueue(
            self._settings.preprocess_topic,
            {
                "document_id": event.document_id,
                "owner_id": event.owner_id,
            },
        )
        logger.debug("Queued preprocessing item %s", job_id)

    async def _handle_document_preprocessed(self, event: DocumentEvent) -> None:
        logger.info("Enqueueing OCR job for document %s", event.document_id)
        job_id = await publish_ocr_task(
            self._broker,
            {
                "document_id": event.document_id,
                "owner_id": event.owner_id,
            },
            topic=self._settings.ocr_topic,
        )
        logger.debug("Queued OCR item %s", job_id)

    async def _handle_document_completed(self, event: DocumentEvent) -> None:
        logger.info("Document %s OCR completed", event.document_id)

    async def _handle_document_failed(self, event: DocumentEvent) -> None:
        logger.error(
            "Document %s failed to process: %s",
            event.document_id,
            (event.payload or {}).get("error_message", "unknown error"),
        )
