from __future__ import annotations

from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User


async def get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: int) -> Optional[User]:
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_user(session: AsyncSession, *, email: str, full_name: str, password_hash: str) -> User:
    user = User(email=email, full_name=full_name, password_hash=password_hash)
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


async def update_refresh_token_hash(session: AsyncSession, *, user_id: int, refresh_token_hash: str) -> None:
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(refresh_token_hash=refresh_token_hash)
        .execution_options(synchronize_session="fetch")
    )
    await session.execute(stmt)


async def clear_refresh_token_hash(session: AsyncSession, *, user_id: int) -> None:
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(refresh_token_hash=None)
        .execution_options(synchronize_session="fetch")
    )
    await session.execute(stmt)
