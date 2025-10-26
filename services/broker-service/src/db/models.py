from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class QueueItem(Base):
    __tablename__ = "queue_items"
    __table_args__ = {"schema": "broker"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    topic = Column(String(64), nullable=False, index=True)
    payload = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    available_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    claimed_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def claim(self, visibility_timeout_seconds: int) -> None:
        self.status = "processing"
        now = datetime.utcnow()
        self.claimed_until = now + timedelta(seconds=visibility_timeout_seconds)
        self.updated_at = now
        self.attempts += 1

    def mark_pending(self, *, delay_seconds: int = 0) -> None:
        now = datetime.utcnow()
        self.status = "pending"
        self.claimed_until = None
        self.available_at = now + timedelta(seconds=delay_seconds)
        self.updated_at = now
