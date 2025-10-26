from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import auth
from ..db import crud
from ..db.session import get_session
from ..schemas.user import LoginRequest, RefreshRequest, TokenPair, UserCreate, UserRead

router = APIRouter()


@router.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/register", response_model=UserRead, status_code=status.HTTP_201_CREATED, tags=["auth"])
async def register_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    existing = await crud.get_user_by_email(session, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email already registered")
    password_hash = auth.hash_password(payload.password)
    user = await crud.create_user(
        session,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=password_hash,
    )
    await session.commit()
    return UserRead.model_validate(user)


@router.post("/auth/login", response_model=TokenPair, tags=["auth"])
async def login_user(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPair:
    user = await crud.get_user_by_email(session, payload.email)
    if user is None or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    tokens = auth.generate_tokens(str(user.id))
    refresh_hash = auth.hash_password(tokens.refresh_token)
    await crud.update_refresh_token_hash(session, user_id=user.id, refresh_token_hash=refresh_hash)
    await session.commit()
    return TokenPair(access_token=tokens.access_token, refresh_token=tokens.refresh_token)


@router.post("/auth/refresh", response_model=TokenPair, tags=["auth"])
async def refresh_tokens(
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPair:
    try:
        user_id = int(auth.decode_refresh_token(payload.refresh_token))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc

    user = await crud.get_user_by_id(session, user_id)
    if user is None or not auth.verify_refresh_token(payload.refresh_token, user.refresh_token_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    tokens = auth.generate_tokens(str(user.id))
    refresh_hash = auth.hash_password(tokens.refresh_token)
    await crud.update_refresh_token_hash(session, user_id=user.id, refresh_token_hash=refresh_hash)
    await session.commit()
    return TokenPair(access_token=tokens.access_token, refresh_token=tokens.refresh_token)


# FastAPI requires an explicit empty response for 204 endpoints.
@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"], response_class=Response)
async def logout_user(
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        user_id = int(auth.decode_refresh_token(payload.refresh_token))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc

    user = await crud.get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    await crud.clear_refresh_token_hash(session, user_id=user.id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
