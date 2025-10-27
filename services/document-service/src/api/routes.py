from __future__ import annotations

import base64
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..clients.broker_client import BrokerClient
from ..core.config import get_settings
from ..db.session import get_session
from ..repositories import documents as documents_repo
from ..schemas.document import (
    BinaryPayload,
    BinaryVariant,
    DocumentRead,
    FailurePayload,
    OCRTextPayload,
    ProcessDocumentsRequest,
    StatusUpdatePayload,
)
from shared.schemas.events import DocumentEvent, DocumentEventType

settings = get_settings()
router = APIRouter()


async def get_owner_id(x_user_id: Optional[str] = Header(default=None)) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing user context")
    return x_user_id


async def get_broker_client() -> AsyncGenerator[BrokerClient, None]:
    client = BrokerClient(settings.broker_service_url)
    try:
        yield client
    finally:
        await client.close()


async def _publish_event(
    broker: BrokerClient,
    *,
    event_type: DocumentEventType,
    document_id: str,
    owner_id: str,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    event = DocumentEvent(
        event_type=event_type,
        document_id=document_id,
        owner_id=owner_id,
        timestamp=datetime.utcnow(),
        payload=payload,
    )
    await broker.enqueue("document_events", event.model_dump(mode="json"))


@router.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED, tags=["documents"])
async def upload_document(
    file: UploadFile = File(...),
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> DocumentRead:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty file")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file too large")

    try:
        document = await documents_repo.create_document(
            session,
            owner_id=owner_id,
            filename=file.filename or "upload",
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(content),
        )
        await documents_repo.store_binary(
            session,
            document_id=str(document.id),
            variant="original",
            content=content,
        )
        # Documentul este doar încărcat, nu trimis la procesare
        document.status = "uploaded"
        await session.commit()
        return DocumentRead.model_validate(document)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(status_code=500, detail="failed to upload document") from exc


@router.get("/documents", response_model=list[DocumentRead], tags=["documents"])
async def list_documents(
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
) -> list[DocumentRead]:
    items = await documents_repo.list_documents(session, owner_id)
    return [DocumentRead.model_validate(item) for item in items]


async def _get_owned_document_or_404(
    session: AsyncSession,
    *,
    document_id: str,
    owner_id: str,
) -> DocumentRead:
    document = await documents_repo.get_document(session, document_id)
    if document is None or document.owner_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
    return DocumentRead.model_validate(document)


@router.get("/documents/{document_id}", response_model=DocumentRead, tags=["documents"])
async def get_document(
    document_id: str,
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
) -> DocumentRead:
    return await _get_owned_document_or_404(session, document_id=document_id, owner_id=owner_id)


# Return an explicit empty response for delete semantics.
@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["documents"],
    response_class=Response,
)
async def delete_document(
    document_id: str,
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _get_owned_document_or_404(session, document_id=document_id, owner_id=owner_id)
    await documents_repo.delete_document(session, document_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/documents/{document_id}/process", response_model=DocumentRead, tags=["documents"])
async def requeue_document(
    document_id: str,
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> DocumentRead:
    document = await documents_repo.get_document(session, document_id)
    if document is None or document.owner_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    try:
        document.status = "queued_preprocessing"
        document.error_message = None
        document.ocr_text = None
        await session.flush()

        await _publish_event(
            broker,
            event_type="document_uploaded",
            document_id=str(document.id),
            owner_id=owner_id,
            payload={"reason": "manual_requeue"},
        )
        await session.commit()
        await session.refresh(document)
        return DocumentRead.model_validate(document)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(status_code=500, detail="failed to requeue document") from exc


@router.post("/documents/process-batch", status_code=status.HTTP_202_ACCEPTED, tags=["documents"])
async def process_batch_documents(
    payload: ProcessDocumentsRequest,
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> dict[str, Any]:
    processed_ids = []
    errors = {}

    for doc_id in payload.document_ids:
        document_id_str = str(doc_id)
        document = await documents_repo.get_document(session, document_id_str)

        if document is None or document.owner_id != owner_id:
            errors[document_id_str] = "Document not found or access denied"
            continue

        try:
            document.status = "queued_preprocessing"
            document.error_message = None
            await session.flush()

            await _publish_event(
                broker,
                event_type="document_uploaded",
                document_id=document_id_str,
                owner_id=owner_id,
                payload={"reason": "batch_processing_request"},
            )
            processed_ids.append(document_id_str)
        except Exception as exc:  # noqa: BLE001
            errors[document_id_str] = f"Failed to queue: {exc}"

    if not processed_ids and errors:
        await session.rollback()
        raise HTTPException(status_code=400, detail={"message": "No documents could be queued.", "errors": errors})

    await session.commit()
    return {"message": "Batch processing started", "processed_ids": processed_ids, "errors": errors}


@router.post("/documents/process-batch-ocr", status_code=status.HTTP_202_ACCEPTED, tags=["documents"])
async def process_batch_ocr(
    payload: ProcessDocumentsRequest,
    owner_id: str = Depends(get_owner_id),
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> dict[str, Any]:
    processed_ids = []
    errors = {}

    for doc_id in payload.document_ids:
        document_id_str = str(doc_id)
        document = await documents_repo.get_document(session, document_id_str)

        if document is None or document.owner_id != owner_id:
            errors[document_id_str] = "Document not found or access denied"
            continue

        # Verifică dacă documentul a fost deja preprocesant
        if document.status not in ["queued_ocr", "ocr", "completed", "failed"]:
            errors[document_id_str] = "Document must be preprocessed first"
            continue

        try:
            document.status = "queued_ocr"
            document.error_message = None
            await session.flush()

            await _publish_event(
                broker,
                event_type="document_preprocessed",
                document_id=document_id_str,
                owner_id=owner_id,
                payload={"reason": "batch_ocr_request"},
            )
            processed_ids.append(document_id_str)
        except Exception as exc:  # noqa: BLE001
            errors[document_id_str] = f"Failed to queue: {exc}"

    if not processed_ids and errors:
        await session.rollback()
        raise HTTPException(status_code=400, detail={"message": "No documents could be queued for OCR.", "errors": errors})

    await session.commit()
    return {"message": "Batch OCR started", "processed_ids": processed_ids, "errors": errors}


def _decode_base64(data_base64: str) -> bytes:
    try:
        return base64.b64decode(data_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid base64 payload") from exc


@router.get(
    "/internal/documents/{document_id}/binary",
    response_class=Response,
    tags=["internal"],
)
async def get_binary(
    document_id: str,
    variant: BinaryVariant = "original",
    session: AsyncSession = Depends(get_session),
) -> Response:
    record = await documents_repo.get_binary(session, document_id=document_id, variant=variant)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="binary not found")
    media_type = "application/octet-stream" if variant != "preprocessed" else "image/png"
    return Response(content=record.content, media_type=media_type)


@router.post(
    "/internal/documents/{document_id}/binary",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["internal"],
    response_class=Response,
)
async def upload_variant(
    document_id: str,
    payload: BinaryPayload,
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> Response:
    document = await documents_repo.get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    try:
        content = _decode_base64(payload.data_base64)
        await documents_repo.store_binary(
            session,
            document_id=document_id,
            variant=payload.variant,
            content=content,
        )

        if payload.variant == "preprocessed":
            document.status = "queued_ocr"
            document.error_message = None
            await session.flush()
            await _publish_event(
                broker,
                event_type="document_preprocessed",
                document_id=document_id,
                owner_id=document.owner_id,
                payload={"variant": payload.variant},
            )

        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(status_code=500, detail="failed to store binary variant") from exc


@router.post(
    "/internal/documents/{document_id}/status",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["internal"],
    response_class=Response,
)
async def update_document_status(
    document_id: str,
    payload: StatusUpdatePayload,
    session: AsyncSession = Depends(get_session),
) -> Response:
    document = await documents_repo.get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    try:
        await documents_repo.update_status(
            session,
            document_id=document_id,
            status=payload.status,
            error_message=payload.error_message,
            ocr_text=payload.ocr_text,
        )
        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(status_code=500, detail="failed to update document status") from exc


@router.post(
    "/internal/documents/{document_id}/ocr-text",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["internal"],
    response_class=Response,
)
async def upload_ocr_text(
    document_id: str,
    payload: OCRTextPayload,
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> Response:
    document = await documents_repo.get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    try:
        document.status = "completed"
        document.ocr_text = payload.text
        document.error_message = None
        await session.flush()
        await _publish_event(
            broker,
            event_type="document_ocr_completed",
            document_id=document_id,
            owner_id=document.owner_id,
            payload={
                "characters": len(payload.text),
                "preview": payload.text[:200],
            },
        )
        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(status_code=500, detail="failed to persist OCR text") from exc


@router.post(
    "/internal/documents/{document_id}/fail",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["internal"],
    response_class=Response,
)
async def mark_document_failed(
    document_id: str,
    payload: FailurePayload,
    session: AsyncSession = Depends(get_session),
    broker: BrokerClient = Depends(get_broker_client),
) -> Response:
    document = await documents_repo.get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    try:
        document.status = "failed"
        document.error_message = payload.error_message
        await session.flush()
        await _publish_event(
            broker,
            event_type="document_failed",
            document_id=document_id,
            owner_id=document.owner_id,
            payload={"error_message": payload.error_message},
        )
        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(status_code=500, detail="failed to mark document as failed") from exc
