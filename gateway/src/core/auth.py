from __future__ import annotations

from fastapi import Depends, HTTPException, Header, status

from shared.utils.jwt import decode_token

from ..config import get_settings

settings = get_settings()


def extract_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing authorization header")
    try:
        scheme, token = authorization.split(" ", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid authorization header") from exc
    if scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid authentication scheme")
    return token


def get_current_user_id(authorization: str | None = Header(default=None, alias="Authorization")) -> str:
    token = extract_token(authorization)
    try:
        payload = decode_token(token=token, secret_key=settings.jwt_secret_key, algorithm="HS256")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc
    if payload.get("scope") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token scope")
    return str(payload.get("sub"))
