from __future__ import annotations

from typing import Any, Optional

import httpx


class AsyncBrokerClient:
    def __init__(self, base_url: str, *, timeout: float = 10.0) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def close(self) -> None:
        await self._client.aclose()

    async def enqueue(self, topic: str, payload: dict[str, Any]) -> str:
        response = await self._client.post(f"/api/enqueue/{topic}", json=payload)
        response.raise_for_status()
        return response.json()["id"]

    async def claim(self, topic: str) -> Optional[dict[str, Any]]:
        response = await self._client.post(f"/api/claim/{topic}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def ack(self, item_id: str) -> None:
        response = await self._client.post(f"/api/ack/{item_id}")
        response.raise_for_status()

    async def fail(self, item_id: str) -> None:
        response = await self._client.post(f"/api/fail/{item_id}")
        response.raise_for_status()
