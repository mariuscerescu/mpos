from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from shared.utils.jwt import create_token, decode_token
from shared.utils.security import hash_secret, verify_secret

from .config import get_settings

settings = get_settings()


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str


def hash_password(raw_password: str) -> str:
    return hash_secret(raw_password)


def verify_password(raw_password: str, hashed_password: str) -> bool:
    return verify_secret(raw_password, hashed_password)


def generate_tokens(user_id: str) -> TokenPair:
    access = create_token(
        subject=user_id,
        secret_key=settings.jwt_secret_key,
        algorithm="HS256",
        ttl_seconds=settings.access_token_ttl_seconds,
        scope="access",
    )
    refresh = create_token(
        subject=user_id,
        secret_key=settings.jwt_secret_key,
        algorithm="HS256",
        ttl_seconds=settings.refresh_token_ttl_seconds,
        scope="refresh",
        extra_claims={"nonce": datetime.now(timezone.utc).timestamp()},
    )
    return TokenPair(access_token=access, refresh_token=refresh)


def decode_refresh_token(token: str) -> str:
    payload = decode_token(token=token, secret_key=settings.jwt_secret_key, algorithm="HS256")
    scope = payload.get("scope")
    if scope != "refresh":
        raise ValueError("invalid scope")
    return str(payload.get("sub"))


def verify_refresh_token(raw_refresh_token: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    return verify_secret(raw_refresh_token, stored_hash)
