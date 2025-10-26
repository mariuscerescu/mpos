from __future__ import annotations

from passlib.context import CryptContext


_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_secret(raw: str) -> str:
    return _pwd_context.hash(raw)


def verify_secret(raw: str, hashed: str) -> bool:
    return _pwd_context.verify(raw, hashed)
