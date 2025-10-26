from __future__ import annotations

from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import Select, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Document, DocumentBinary


async def get_document(session: AsyncSession, document_id: str) -> Optional[Document]:
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_documents(session: AsyncSession, owner_id: str) -> Iterable[Document]:
    stmt: Select[Document] = select(Document).where(Document.owner_id == owner_id).order_by(Document.created_at.desc())
    result = await session.execute(stmt)
    return result.scalars().all()


async def create_document(
    session: AsyncSession,
    *,
    owner_id: str,
    filename: str,
    content_type: str,
    size_bytes: int,
) -> Document:
    doc = Document(
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        status="uploaded",
    )
    session.add(doc)
    await session.flush()
    await session.refresh(doc)
    return doc


async def store_binary(
    session: AsyncSession,
    *,
    document_id: str,
    variant: str,
    content: bytes,
) -> DocumentBinary:
    await session.execute(
        delete(DocumentBinary).where(
            DocumentBinary.document_id == document_id,
            DocumentBinary.variant == variant,
        )
    )
    record = DocumentBinary(document_id=document_id, variant=variant, content=content)
    session.add(record)
    await session.flush()
    return record


async def get_binary(session: AsyncSession, *, document_id: str, variant: str = "original") -> Optional[DocumentBinary]:
    stmt = select(DocumentBinary).where(
        DocumentBinary.document_id == document_id,
        DocumentBinary.variant == variant,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_status(
    session: AsyncSession,
    *,
    document_id: str,
    status: str,
    error_message: Optional[str] = None,
    ocr_text: Optional[str] = None,
) -> None:
    values: dict[str, object] = {
        "status": status,
        "updated_at": datetime.utcnow(),
    }
    if error_message is not None:
        values["error_message"] = error_message
    if ocr_text is not None:
        values["ocr_text"] = ocr_text
    stmt = (
        update(Document)
        .where(Document.id == document_id)
        .values(**values)
        .execution_options(synchronize_session="fetch")
    )
    await session.execute(stmt)


async def delete_document(session: AsyncSession, document_id: str) -> None:
    await session.execute(delete(DocumentBinary).where(DocumentBinary.document_id == document_id))
    await session.execute(delete(Document).where(Document.id == document_id))
