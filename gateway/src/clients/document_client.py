from __future__ import annotations

from typing import Any

import httpx


class DocumentServiceClient:
    def __init__(self, base_url: str, *, timeout: float = 10.0) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def close(self) -> None:
        await self._client.aclose()

    async def health(self) -> dict[str, Any]:
        response = await self._client.get("/health")
        response.raise_for_status()
        return response.json()

    async def list_documents(self, user_id: str) -> list[dict[str, Any]]:
        response = await self._client.get("/documents", headers={"X-User-Id": user_id})
        response.raise_for_status()
        return response.json()

    async def get_document(self, user_id: str, document_id: str) -> dict[str, Any]:
        response = await self._client.get(f"/documents/{document_id}", headers={"X-User-Id": user_id})
        response.raise_for_status()
        return response.json()

    async def upload_document(
        self,
        user_id: str,
        *,
        filename: str,
        content_type: str,
        content: bytes,
    ) -> dict[str, Any]:
        files = {"file": (filename, content, content_type)}
        response = await self._client.post("/documents", headers={"X-User-Id": user_id}, files=files)
        response.raise_for_status()
        return response.json()

    async def delete_document(self, user_id: str, document_id: str) -> None:
        response = await self._client.delete(f"/documents/{document_id}", headers={"X-User-Id": user_id})
        response.raise_for_status()

    async def requeue_document(self, user_id: str, document_id: str) -> dict[str, Any]:
        response = await self._client.post(
            f"/documents/{document_id}/process",
            headers={"X-User-Id": user_id},
        )
        response.raise_for_status()
        return response.json()

    async def process_batch(self, user_id: str, document_ids: list[str]) -> dict[str, Any]:
        response = await self._client.post(
            "/documents/process-batch",
            headers={"X-User-Id": user_id},
            json={"document_ids": document_ids},
        )
        response.raise_for_status()
        return response.json()

    async def process_batch_ocr(self, user_id: str, document_ids: list[str]) -> dict[str, Any]:
        response = await self._client.post(
            "/documents/process-batch-ocr",
            headers={"X-User-Id": user_id},
            json={"document_ids": document_ids},
        )
        response.raise_for_status()
        return response.json()

    async def get_document_binary(self, document_id: str, variant: str = "original") -> bytes:
        response = await self._client.get(
            f"/internal/documents/{document_id}/binary",
            params={"variant": variant},
        )
        response.raise_for_status()
        return response.content
