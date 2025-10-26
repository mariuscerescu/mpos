from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from shared.utils.broker import AsyncBrokerClient

from .core.config import get_settings
from .pipelines.ocr import run_ocr

logger = logging.getLogger("ocr-service")
logging.basicConfig(level=logging.INFO)

settings = get_settings()


async def fetch_preprocessed(client: httpx.AsyncClient, document_id: str) -> bytes:
    response = await client.get(
        f"/api/internal/documents/{document_id}/binary",
        params={"variant": "preprocessed"},
    )
    response.raise_for_status()
    return response.content


async def upload_ocr_text(client: httpx.AsyncClient, document_id: str, text: str) -> None:
    response = await client.post(
        f"/api/internal/documents/{document_id}/ocr-text",
        json={"text": text},
    )
    response.raise_for_status()


async def update_status(client: httpx.AsyncClient, document_id: str, status_value: str) -> None:
    response = await client.post(
        f"/api/internal/documents/{document_id}/status",
        json={"status": status_value},
    )
    response.raise_for_status()


async def mark_failed(client: httpx.AsyncClient, document_id: str, message: str) -> None:
    response = await client.post(
        f"/api/internal/documents/{document_id}/fail",
        json={"error_message": message},
    )
    response.raise_for_status()


async def process_job(
    broker: AsyncBrokerClient,
    doc_client: httpx.AsyncClient,
    job: dict[str, Any],
) -> None:
    item_id = job["id"]
    payload = job.get("payload", {})
    document_id = payload.get("document_id")
    if not document_id:
        logger.error("Job %s missing document_id", item_id)
        await broker.fail(item_id)
        return

    try:
        logger.info("Running OCR for document %s", document_id)
        try:
            await update_status(doc_client, document_id, "ocr")
        except Exception:  # noqa: BLE001
            logger.exception("Failed to mark document %s as OCR in-progress", document_id)
        image_bytes = await fetch_preprocessed(doc_client, document_id)
        text = run_ocr(image_bytes)
        await upload_ocr_text(doc_client, document_id, text)
        await broker.ack(item_id)
        logger.info("Document %s OCR completed", document_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to run OCR for document %s", document_id)
        await broker.fail(item_id)
        try:
            await mark_failed(doc_client, document_id, str(exc))
        except Exception:  # noqa: BLE001
            logger.exception("Failed to mark document %s as failed", document_id)


async def run_worker() -> None:
    broker = AsyncBrokerClient(settings.broker_service_url)
    async with httpx.AsyncClient(base_url=settings.document_service_url, timeout=60.0) as doc_client:
        try:
            while True:
                job = await broker.claim(settings.queue_topic)
                if job is None:
                    await asyncio.sleep(1.0)
                    continue
                await process_job(broker, doc_client, job)
        finally:
            await broker.close()


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
