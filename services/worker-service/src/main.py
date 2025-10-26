from __future__ import annotations

import asyncio
import logging

from shared.utils.broker import AsyncBrokerClient

from .consumers.document_consumer import DocumentConsumer
from .core.config import get_settings

logger = logging.getLogger("worker-service")
logging.basicConfig(level=logging.INFO)


async def run_worker() -> None:
    settings = get_settings()
    broker = AsyncBrokerClient(settings.broker_service_url)
    consumer = DocumentConsumer(broker, settings=settings)

    try:
        while True:
            try:
                job = await broker.claim(settings.document_events_topic)
            except Exception as exc:  # noqa: BLE001
                if isinstance(exc, asyncio.CancelledError):  # propagate cancellations cleanly
                    raise
                logger.exception("Failed to claim document event: %s", exc)
                await asyncio.sleep(settings.poll_interval_seconds)
                continue

            if job is None:
                await asyncio.sleep(settings.poll_interval_seconds)
                continue

            item_id = job["id"]
            try:
                await consumer.handle(job["payload"])
            except Exception as exc:  # noqa: BLE001
                if isinstance(exc, asyncio.CancelledError):
                    raise
                logger.exception("Error processing event %s: %s", item_id, exc)
                try:
                    await broker.fail(item_id)
                except Exception:  # noqa: BLE001
                    logger.exception("Failed to requeue event %s", item_id)
                await asyncio.sleep(settings.poll_interval_seconds)
                continue

            try:
                await broker.ack(item_id)
            except Exception as exc:  # noqa: BLE001
                if isinstance(exc, asyncio.CancelledError):
                    raise
                logger.exception("Failed to ack event %s", item_id)

    finally:
        await broker.close()


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
