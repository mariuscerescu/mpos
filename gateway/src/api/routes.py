from __future__ import annotations

from collections.abc import AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from ..clients.document_client import DocumentServiceClient
from ..clients.user_client import UserServiceClient
from ..config import get_settings
from ..core.auth import get_current_user_id
from ..schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from ..schemas.document import DocumentMetadata, DocumentUploadResponse
from ..schemas.user import UserProfile

settings = get_settings()
router = APIRouter()


async def get_user_client() -> AsyncGenerator[UserServiceClient, None]:
    client = UserServiceClient(settings.user_service_url)
    try:
        yield client
    finally:
        await client.close()


async def get_document_client() -> AsyncGenerator[DocumentServiceClient, None]:
    client = DocumentServiceClient(settings.document_service_url)
    try:
        yield client
    finally:
        await client.close()


@router.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    """Return service health status."""
    return {"status": "ok"}


@router.post("/auth/register", response_model=UserProfile, status_code=status.HTTP_201_CREATED, tags=["auth"])
async def register_user(
    payload: RegisterRequest,
    client: UserServiceClient = Depends(get_user_client),
) -> UserProfile:
    try:
        data = await client.register(payload.model_dump())
        return UserProfile.model_validate(data)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.post("/auth/login", response_model=TokenPair, tags=["auth"])
async def login_user(
    payload: LoginRequest,
    client: UserServiceClient = Depends(get_user_client),
) -> TokenPair:
    try:
        data = await client.login(payload.model_dump())
        return TokenPair.model_validate(data)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.post("/auth/refresh", response_model=TokenPair, tags=["auth"])
async def refresh_token(
    payload: RefreshRequest,
    client: UserServiceClient = Depends(get_user_client),
) -> TokenPair:
    try:
        data = await client.refresh(payload.model_dump())
        return TokenPair.model_validate(data)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.get("/documents", response_model=list[DocumentMetadata], tags=["documents"])
async def list_documents(
    user_id: str = Depends(get_current_user_id),
    client: DocumentServiceClient = Depends(get_document_client),
) -> list[DocumentMetadata]:
    try:
        data = await client.list_documents(user_id)
        return [DocumentMetadata.model_validate(item) for item in data]
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.post("/documents", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED, tags=["documents"])
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    client: DocumentServiceClient = Depends(get_document_client),
) -> DocumentUploadResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty file")
    try:
        data = await client.upload_document(
            user_id,
            filename=file.filename or "upload",
            content_type=file.content_type or "application/octet-stream",
            content=content,
        )
        return DocumentUploadResponse(document=DocumentMetadata.model_validate(data))
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.get("/documents/{document_id}", response_model=DocumentMetadata, tags=["documents"])
async def get_document(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
    client: DocumentServiceClient = Depends(get_document_client),
) -> DocumentMetadata:
    try:
        data = await client.get_document(user_id, document_id)
        return DocumentMetadata.model_validate(data)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["documents"],
    response_class=Response,
)
async def delete_document(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
    client: DocumentServiceClient = Depends(get_document_client),
) -> Response:
    try:
        await client.delete_document(user_id, document_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/documents/{document_id}/process", response_model=DocumentMetadata, tags=["documents"])
async def requeue_document(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
    client: DocumentServiceClient = Depends(get_document_client),
) -> DocumentMetadata:
    try:
        data = await client.requeue_document(user_id, document_id)
        return DocumentMetadata.model_validate(data)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc


@router.get("/documents/{document_id}/binary", response_class=Response, tags=["documents"])
async def get_document_binary(
    document_id: str,
    variant: str = "original",
    user_id: str = Depends(get_current_user_id),
    client: DocumentServiceClient = Depends(get_document_client),
) -> Response:
    try:
        content = await client.get_document_binary(document_id, variant)
        media_type = "image/png" if variant == "preprocessed" else "application/octet-stream"
        return Response(content=content, media_type=media_type)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
