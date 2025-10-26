from __future__ import annotations

from typing import Any

from shared.utils.broker import AsyncBrokerClient


async def publish_ocr_task(
    broker: AsyncBrokerClient,
    payload: dict[str, Any],
    *,
    topic: str = "ocr_extract",
) -> str:
    """Publish an OCR extraction task to the broker and return the queue item id."""

    return await broker.enqueue(topic, payload)
