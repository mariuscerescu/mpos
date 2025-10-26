from fastapi import FastAPI

from .api.routes import router as api_router
from .core.config import get_settings

settings = get_settings()
app = FastAPI(title="User Service", version="0.1.0")
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}
