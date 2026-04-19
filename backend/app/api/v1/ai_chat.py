"""Эндпоинты AI: тест-чат, диалоги, флаг плохого ответа."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.core.exceptions import AIUnavailableError, NotFoundError
from app.deps import get_db, get_redis_optional, require_roles
from app.models.ai_chat import AIConversation, AIMessage
from app.models.client import Client
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.ai_api import (
    AIConversationOut,
    FlagMessageResponse,
    TestChatRequest,
    TestChatResponse,
)
from app.schemas.common import PaginatedResponse
from app.services.ai_service import AIService, gemini_configured

router = APIRouter(prefix="/ai", tags=["ai"])

_AI_STAFF = (UserRole.owner, UserRole.admin)


def _client_label(c: Client) -> str | None:
    parts = [c.first_name or "", c.last_name or ""]
    s = " ".join(p for p in parts if p).strip()
    return s or None


@router.post("/test_chat", response_model=TestChatResponse)
async def post_test_chat(
    body: TestChatRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_AI_STAFF))],
    redis: Annotated[Redis | None, Depends(get_redis_optional)],
) -> TestChatResponse:
    if not gemini_configured():
        raise AIUnavailableError(
            "AI is not configured. Set GEMINI_API_KEY in the server environment."
        )
    svc = AIService(db, redis)
    answer, cited = await svc.test_ask_admin(body.question, body.lang)
    return TestChatResponse(answer=answer, cited_chunk_ids=cited)


@router.get("/conversations", response_model=PaginatedResponse[AIConversationOut])
async def list_ai_conversations(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_AI_STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[AIConversationOut]:
    total = (await db.execute(select(func.count()).select_from(AIConversation))).scalar_one()
    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            select(AIConversation, Client)
            .join(Client, Client.id == AIConversation.client_id)
            .order_by(AIConversation.started_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    items: list[AIConversationOut] = []
    for conv, client in rows:
        items.append(
            AIConversationOut(
                id=conv.id,
                client_id=conv.client_id,
                client_name=_client_label(client),
                started_at=conv.started_at,
                ended_at=conv.ended_at,
                lang=conv.lang,
                token_in=conv.token_in,
                token_out=conv.token_out,
                last_message_preview=None,
            )
        )
    return PaginatedResponse(
        items=items,
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


@router.post("/flag/{message_id}", response_model=FlagMessageResponse)
async def flag_ai_message(
    message_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_AI_STAFF))],
) -> FlagMessageResponse:
    msg = await db.get(AIMessage, message_id)
    if msg is None:
        raise NotFoundError("Message not found")
    msg.flagged_negative = True
    return FlagMessageResponse(ok=True)
