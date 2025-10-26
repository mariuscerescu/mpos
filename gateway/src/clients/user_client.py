from __future__ import annotations

from typing import Any

import httpx


class UserServiceClient:
    def __init__(self, base_url: str, *, timeout: float = 10.0) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def close(self) -> None:
        await self._client.aclose()

    async def health(self) -> dict[str, Any]:
        response = await self._client.get("/health")
        response.raise_for_status()
        return response.json()

    async def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post("/auth/register", json=payload)
        response.raise_for_status()
        return response.json()

    async def login(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post("/auth/login", json=payload)
        response.raise_for_status()
        return response.json()

    async def refresh(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post("/auth/refresh", json=payload)
        response.raise_for_status()
        return response.json()
