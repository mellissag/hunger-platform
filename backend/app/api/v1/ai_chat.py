"""Эндпоинты AI: тест-чат, диалоги, флаг плохого ответа."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.core.exceptions import AIUnavailableError, NotFoundError
from app.deps import get_db, get_redis_optional, require_roles
from app.models.ai_chat import AIConversation, AIMessage
from app.models.client import Client
from app.models.enums import AIMessageRole, UserRole
from app.models.user import User
from app.schemas.ai_api import (
    AIConversationDetailOut,
    AIConversationOut,
    AIMessageOut,
    FlagMessageResponse,
    TestChatRequest,
    TestChatResponse,
    TranslateCollectionLocale,
    TranslateRequest,
    TranslateResponse,
)
from app.schemas.common import PaginatedResponse
from google.genai.errors import ClientError as GenAIClientError

from app.services.ai_service import AIService

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
    from fastapi import HTTPException

    svc = AIService(db, redis)
    try:
        answer, cited = await svc.test_ask_admin(body.question, body.lang)
        return TestChatResponse(answer=answer, cited_chunk_ids=cited)
    except GenAIClientError as e:
        status = getattr(e, "status_code", None) or 500
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            raise HTTPException(
                status_code=429,
                detail="Превышен лимит запросов к Gemini API. Подождите немного и попробуйте снова. "
                       "Для производственного использования включите платный тариф на ai.google.dev",
            ) from e
        raise HTTPException(status_code=int(status), detail=msg) from e
    except AIUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/translate", response_model=TranslateResponse)
async def post_translate(
    body: TranslateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_AI_STAFF))],
    redis: Annotated[Redis | None, Depends(get_redis_optional)],
) -> TranslateResponse:
    svc = AIService(db, redis)
    try:
        if (body.content_type or "plain") == "collection":
            out_blocks = await svc.translate_collection_admin(
                source_lang=body.source_lang,
                title=body.title or "",
                tags=body.tags or "",
                button_text=body.button_text or "",
            )
            return TranslateResponse(
                collection={k: TranslateCollectionLocale(**v) for k, v in out_blocks.items()},
            )
        out = await svc.translate_admin(
            text=(body.text or "").strip(),
            source_lang=body.source_lang,
            target_langs=body.target_langs,
        )
        return TranslateResponse(
            en=out.get("en", ""),
            ru=out.get("ru", ""),
            uk=out.get("uk", ""),
            bg=out.get("bg", ""),
            collection=None,
        )
    except GenAIClientError as e:
        status = getattr(e, "status_code", None) or 500
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            raise HTTPException(
                status_code=429,
                detail="Превышен лимит запросов к Gemini API. Подождите немного и попробуйте снова.",
            ) from e
        raise HTTPException(status_code=int(status), detail=msg) from e
    except AIUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=str(e.response.text or e.response.reason_phrase or "Upstream AI error"),
        ) from e


@router.get("/conversations", response_model=PaginatedResponse[AIConversationOut])
async def list_ai_conversations(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_AI_STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    client_id: UUID | None = None,
) -> PaginatedResponse[AIConversationOut]:
    count_stmt = select(func.count(AIConversation.id)).join(Client, Client.id == AIConversation.client_id)
    stmt = select(AIConversation, Client).join(Client, Client.id == AIConversation.client_id)
    if client_id is not None:
        count_stmt = count_stmt.where(AIConversation.client_id == client_id)
        stmt = stmt.where(AIConversation.client_id == client_id)
    total = (await db.execute(count_stmt)).scalar_one()
    offset = (page - 1) * page_size
    stmt = stmt.order_by(AIConversation.started_at.desc()).offset(offset).limit(page_size)
    rows = (await db.execute(stmt)).all()

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


@router.get("/conversations/{conv_id}", response_model=AIConversationDetailOut)
async def get_ai_conversation(
    conv_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_AI_STAFF))],
) -> AIConversationDetailOut:
    conv = await db.get(AIConversation, conv_id)
    if conv is None:
        raise NotFoundError("Conversation not found")
    cl = await db.get(Client, conv.client_id)
    if cl is None:
        raise NotFoundError("Client not found")
    msgs = (
        (
            await db.execute(
                select(AIMessage)
                .where(AIMessage.conversation_id == conv_id)
                .order_by(AIMessage.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    mout = [
        AIMessageOut(
            id=m.id,
            role=m.role.value if isinstance(m.role, AIMessageRole) else str(m.role),
            content=m.content,
            created_at=m.created_at,
            cited_chunks=list(m.cited_chunks) if m.cited_chunks else None,
            flagged_negative=m.flagged_negative,
        )
        for m in msgs
    ]
    return AIConversationDetailOut(
        id=conv.id,
        client_id=conv.client_id,
        client_name=_client_label(cl),
        started_at=conv.started_at,
        ended_at=conv.ended_at,
        lang=conv.lang,
        token_in=conv.token_in,
        token_out=conv.token_out,
        last_message_preview=msgs[-1].content[:200] if msgs else None,
        messages=mout,
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
