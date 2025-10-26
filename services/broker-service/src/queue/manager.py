from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db.models import QueueItem

settings = get_settings()


async def enqueue(session: AsyncSession, topic: str, payload: str) -> QueueItem:
    item = QueueItem(topic=topic, payload=payload)
    session.add(item)
    await session.flush()
    return item


async def claim(session: AsyncSession, topic: str) -> Optional[QueueItem]:
    now = datetime.utcnow()
    stmt = (
        select(QueueItem)
        .where(QueueItem.topic == topic)
        .where(QueueItem.status == "pending")
        .where(QueueItem.available_at <= now)
        .order_by(QueueItem.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    result = await session.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        return None
    item.claim(settings.visibility_timeout_seconds)
    return item


async def get_item(session: AsyncSession, item_id: str) -> Optional[QueueItem]:
    stmt = select(QueueItem).where(QueueItem.id == item_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def ack(session: AsyncSession, item_id: str) -> bool:
    item = await get_item(session, item_id)
    if item is None:
        return False
    await session.delete(item)
    return True


async def fail(session: AsyncSession, item_id: str, *, retry_delay_seconds: int) -> bool:
    item = await get_item(session, item_id)
    if item is None:
        return False
    item.mark_pending(delay_seconds=retry_delay_seconds)
    return True
