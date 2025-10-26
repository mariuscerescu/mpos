from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db.session import get_session
from ..queue import manager

router = APIRouter()
settings = get_settings()


def get_topic_definition(topic: str) -> dict[str, Any]:
    definitions = settings.load_topic_definitions()
    return definitions.get(topic, {"max_retries": 5, "retry_delay_seconds": 30})


@router.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/enqueue/{topic}", tags=["queue"])
async def enqueue_topic(
    topic: str,
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    data = json.dumps(payload)
    item = await manager.enqueue(session, topic, data)
    await session.commit()
    return {"id": str(item.id), "topic": item.topic}


@router.post("/claim/{topic}", tags=["queue"])
async def claim_topic(topic: str, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    item = await manager.claim(session, topic)
    if item is None:
        await session.commit()
        raise HTTPException(status_code=404, detail="no messages")
    await session.commit()
    return {
        "id": str(item.id),
        "topic": item.topic,
        "payload": json.loads(item.payload),
        "attempts": item.attempts,
    }


@router.post("/ack/{item_id}", tags=["queue"])
async def ack_item(item_id: str, session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    success = await manager.ack(session, item_id)
    await session.commit()
    if not success:
        raise HTTPException(status_code=404, detail="item not found")
    return {"status": "acknowledged"}


@router.post("/fail/{item_id}", tags=["queue"])
async def fail_item(item_id: str, session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    item = await manager.get_item(session, item_id)
    if item is None:
        await session.commit()
        raise HTTPException(status_code=404, detail="item not found")

    definition = get_topic_definition(item.topic)
    success = await manager.fail(session, item_id, retry_delay_seconds=definition.get("retry_delay_seconds", 30))
    await session.commit()
    return {"status": "requeued"}
