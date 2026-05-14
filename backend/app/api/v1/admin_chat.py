"""Admin Chat API — REST + WebSocket для real-time чата с клиентами через бота."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

import aiofiles
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import FSInputFile
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import decode_access_token, parse_access_payload
from app.core.user_page_permissions import page_perm
from app.deps import get_db, get_redis, get_telegram_bot, require_roles
from app.models.booking import Booking
from app.models.chat import Chat, ChatTag, ChatTagAssignment
from app.models.chat_message import ChatMessage, ChatChannel, MessageDirection, MessageType
from app.models.client import Client
from app.models.enums import UserRole
from app.models.user import User
from app.services.whatsapp import is_whatsapp_configured, send_whatsapp_text_message
from app.utils.phone_digits import digits_only
from app.schemas.chat_admin import (
    ChatNoteUpdate,
    ChatTagAssign,
    ChatTagCreate,
    ChatTagOut,
    ChatTagSummary,
)

router = APIRouter(prefix="/admin/chats", tags=["admin-chat"])
tags_router = APIRouter(prefix="/admin/chat-tags", tags=["admin-chat-tags"])

_UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "./data/uploads"))
_CHAT_MEDIA_DIR = _UPLOAD_DIR / "chat"


def _ensure_media_dir() -> None:
    _CHAT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def _media_url(path: str | None) -> str | None:
    """Convert absolute file path to /media/... URL."""
    if not path:
        return None
    p = Path(path)
    try:
        rel = p.relative_to(_UPLOAD_DIR)
        return f"/media/{rel}"
    except ValueError:
        return f"/media/chat/{p.name}"


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatListItem(BaseModel):
    client_id: UUID
    tg_user_id: int | None
    first_name: str | None
    last_name: str | None
    last_message: str | None
    last_message_at: str | None
    last_message_channel: str | None = None
    unread_count: int
    note: str | None = None
    tags: list[ChatTagSummary] = []
    can_reply_telegram: bool = False
    can_reply_whatsapp: bool = False

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: UUID
    client_id: UUID
    direction: str
    message_type: str
    text: str | None
    media_path: str | None
    tg_message_id: int | None
    channel: str = "telegram"
    is_read: bool
    created_at: str

    model_config = {"from_attributes": True}


class SendTextPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    channel: Literal["telegram", "whatsapp"] = "telegram"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _msg_to_out(m: ChatMessage) -> MessageOut:
    return MessageOut(
        id=m.id,
        client_id=m.client_id,
        direction=m.direction.value,
        message_type=m.message_type.value,
        text=m.text,
        media_path=_media_url(m.media_path),
        tg_message_id=m.tg_message_id,
        channel=m.channel.value,
        is_read=m.is_read,
        created_at=m.created_at.isoformat(),
    )


async def _publish(redis, event: str, payload: dict) -> None:
    if redis is None:
        return
    payload["_event"] = event
    await redis.publish(f"chat:{event}", json.dumps(payload))


# ── List of chats ─────────────────────────────────────────────────────────────

async def _get_or_create_chat(db: AsyncSession, client_id: UUID) -> Chat:
    """Lazily create a ``chat`` row on first metadata mutation."""
    existing = await db.execute(select(Chat).where(Chat.client_id == client_id))
    chat = existing.scalar_one_or_none()
    if chat is not None:
        return chat
    # Validate the client exists before creating the chat row.
    client = await db.get(Client, client_id)
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    chat = Chat(client_id=client_id)
    db.add(chat)
    await db.flush()
    return chat


@router.get("", response_model=list[ChatListItem])
async def list_chats(
    user: User = Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)),
    db: AsyncSession = Depends(get_db),
):
    """Список клиентов с диалогами, сортированных по последнему сообщению."""
    settings = get_settings()
    wa_ok = is_whatsapp_configured(settings)
    last_at_subq = (
        select(
            ChatMessage.client_id,
            func.max(ChatMessage.created_at).label("last_at"),
        )
        .group_by(ChatMessage.client_id)
        .subquery()
    )
    unread_subq = (
        select(
            ChatMessage.client_id,
            func.count(ChatMessage.id).label("unread"),
        )
        .where(
            ChatMessage.direction == MessageDirection.inbound,
            ChatMessage.is_read.is_(False),
        )
        .group_by(ChatMessage.client_id)
        .subquery()
    )

    stmt = (
        select(Client, last_at_subq.c.last_at, unread_subq.c.unread, Chat)
        .join(last_at_subq, last_at_subq.c.client_id == Client.id)
        .outerjoin(unread_subq, unread_subq.c.client_id == Client.id)
        .outerjoin(Chat, Chat.client_id == Client.id)
        .where((Chat.is_deleted.is_(False)) | (Chat.id.is_(None)))
    )
    if user.role == UserRole.master and user.master_id and not page_perm(user, "chats", "view_all"):
        own_clients = select(Booking.client_id).where(Booking.master_id == user.master_id).distinct()
        stmt = stmt.where(Client.id.in_(own_clients))
    stmt = stmt.order_by(last_at_subq.c.last_at.desc())

    rows = await db.execute(stmt)

    # Pre-fetch tag assignments in bulk to avoid N+1.
    client_rows = list(rows)
    chat_ids = [chat.id for _, _, _, chat in client_rows if chat is not None]
    tags_by_chat: dict[UUID, list[ChatTagSummary]] = {}
    if chat_ids:
        tag_rows = await db.execute(
            select(ChatTagAssignment.chat_id, ChatTag)
            .join(ChatTag, ChatTag.id == ChatTagAssignment.tag_id)
            .where(ChatTagAssignment.chat_id.in_(chat_ids))
            .order_by(ChatTag.is_default.desc(), ChatTag.name.asc())
        )
        for chat_id, tag in tag_rows:
            tags_by_chat.setdefault(chat_id, []).append(
                ChatTagSummary.model_validate(tag)
            )

    result: list[ChatListItem] = []
    for client, last_at, unread, chat in client_rows:
        last_msg_row = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.client_id == client.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last = last_msg_row.scalar_one_or_none()
        preview = last.text if last and last.text else (f"[{last.message_type.value}]" if last else None)
        wa_digits = digits_only(client.whatsapp_phone or client.phone or "")
        result.append(
            ChatListItem(
                client_id=client.id,
                tg_user_id=client.tg_user_id,
                first_name=client.first_name,
                last_name=client.last_name,
                last_message=preview,
                last_message_at=last_at.isoformat() if last_at else None,
                last_message_channel=last.channel.value if last else None,
                unread_count=unread or 0,
                note=chat.note if chat else None,
                tags=tags_by_chat.get(chat.id, []) if chat else [],
                can_reply_telegram=bool(client.tg_user_id),
                can_reply_whatsapp=bool(wa_ok and wa_digits),
            )
        )
    return result


# ── Message history ───────────────────────────────────────────────────────────

@router.get("/{client_id}/messages", response_model=list[MessageOut])
async def get_messages(
    client_id: UUID,
    limit: int = 50,
    before_id: UUID | None = None,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)),
    db: AsyncSession = Depends(get_db),
):
    q = select(ChatMessage).where(ChatMessage.client_id == client_id)
    if before_id:
        pivot = await db.get(ChatMessage, before_id)
        if pivot:
            q = q.where(ChatMessage.created_at < pivot.created_at)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    rows = await db.execute(q)
    msgs = list(reversed(rows.scalars().all()))
    return [_msg_to_out(m) for m in msgs]


# ── Mark as read ──────────────────────────────────────────────────────────────

@router.post("/{client_id}/read")
async def mark_read(
    client_id: UUID,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    await db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.client_id == client_id,
            ChatMessage.direction == MessageDirection.inbound,
            ChatMessage.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    await _publish(redis, "read", {"client_id": str(client_id)})
    return {"ok": True}


# ── Send text ─────────────────────────────────────────────────────────────────

@router.post("/{client_id}/send/text")
async def send_text(
    client_id: UUID,
    payload: SendTextPayload,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    bot=Depends(get_telegram_bot),
):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    settings = get_settings()

    if payload.channel == "whatsapp":
        if not is_whatsapp_configured(settings):
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "WhatsApp is not configured",
            )
        wa_digits = digits_only(client.whatsapp_phone or client.phone or "")
        if not wa_digits:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Client has no phone number for WhatsApp",
            )
        _wa_id, cm = await send_whatsapp_text_message(
            db=db,
            to_phone_digits=wa_digits,
            text=payload.text,
            client_id=client_id,
            settings=settings,
        )
        if cm is None:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "WhatsApp send failed",
            )
        await db.commit()
        await db.refresh(cm)
        await _publish(redis, "new_message", {
            "id": str(cm.id),
            "client_id": str(client_id),
            "direction": "outbound",
            "message_type": "text",
            "text": payload.text,
            "media_path": None,
            "tg_message_id": None,
            "channel": ChatChannel.whatsapp.value,
            "is_read": True,
            "created_at": cm.created_at.isoformat(),
        })
        return {"ok": True, "message_id": str(cm.id)}

    if not client.tg_user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Client has no Telegram account")

    tg_msg = await bot.send_message(chat_id=client.tg_user_id, text=payload.text)

    msg = ChatMessage(
        client_id=client_id,
        direction=MessageDirection.outbound,
        message_type=MessageType.text,
        text=payload.text,
        tg_message_id=tg_msg.message_id,
        channel=ChatChannel.telegram,
        is_read=True,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    await _publish(redis, "new_message", {
        "id": str(msg.id),
        "client_id": str(client_id),
        "direction": "outbound",
        "message_type": "text",
        "text": payload.text,
        "media_path": None,
        "tg_message_id": tg_msg.message_id,
        "channel": ChatChannel.telegram.value,
        "is_read": True,
        "created_at": msg.created_at.isoformat(),
    })
    return {"ok": True, "message_id": str(msg.id)}


# ── Send media ────────────────────────────────────────────────────────────────

@router.post("/{client_id}/send/media")
async def send_media(
    client_id: UUID,
    file: UploadFile = File(...),
    caption: str | None = Form(None),
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    bot=Depends(get_telegram_bot),
):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    if not client.tg_user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Client has no Telegram account")

    _ensure_media_dir()
    content_type = (file.content_type or "").lower()
    safe_name = (file.filename or "file").replace("/", "_")
    dest = _CHAT_MEDIA_DIR / f"{client_id}_{safe_name}"

    def _ext_image(name: str) -> bool:
        return Path(name).suffix.lower() in {
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".webp",
            ".heic",
            ".bmp",
        }

    async with aiofiles.open(str(dest), "wb") as f:
        await f.write(await file.read())

    path_str = str(dest)
    chat_id = int(client.tg_user_id)

    try:
        if content_type.startswith("image/") or _ext_image(safe_name):
            msg_type = MessageType.photo
            tg_msg = await bot.send_photo(
                chat_id=chat_id,
                photo=FSInputFile(path_str),
                caption=caption,
            )
        elif content_type.startswith("video/"):
            msg_type = MessageType.video
            tg_msg = await bot.send_video(
                chat_id=chat_id,
                video=FSInputFile(path_str),
                caption=caption,
            )
        elif content_type.startswith("audio/") or safe_name.endswith(".ogg"):
            msg_type = MessageType.voice
            tg_msg = await bot.send_voice(chat_id=chat_id, voice=FSInputFile(path_str))
        else:
            msg_type = MessageType.document
            tg_msg = await bot.send_document(
                chat_id=chat_id,
                document=FSInputFile(path_str),
                caption=caption,
            )
    except TelegramForbiddenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Клиент заблокировал бота — отправка невозможна",
        ) from None
    except TelegramBadRequest as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ошибка Telegram: {e}",
        ) from e

    tg_message_id = getattr(tg_msg, "message_id", None)
    media_path = str(dest)

    msg = ChatMessage(
        client_id=client_id,
        direction=MessageDirection.outbound,
        message_type=msg_type,
        text=caption,
        media_path=media_path,
        tg_message_id=tg_message_id,
        channel=ChatChannel.telegram,
        is_read=True,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    await _publish(redis, "new_message", {
        "id": str(msg.id),
        "client_id": str(client_id),
        "direction": "outbound",
        "message_type": msg_type.value,
        "text": caption,
        "media_path": _media_url(media_path),
        "tg_message_id": tg_message_id,
        "channel": ChatChannel.telegram.value,
        "is_read": True,
        "created_at": msg.created_at.isoformat(),
    })
    return {"ok": True, "message_id": str(msg.id)}


# ── Chat metadata: note + soft delete ─────────────────────────────────────────


@router.patch("/{client_id}/note")
async def update_chat_note(
    client_id: UUID,
    payload: ChatNoteUpdate,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception)),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_or_create_chat(db, client_id)
    chat.note = payload.note
    await db.commit()
    return {"ok": True, "note": chat.note}


@router.delete("/{client_id}")
async def soft_delete_chat(
    client_id: UUID,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete — the chat row stays, just hidden from the admin list."""
    chat = await _get_or_create_chat(db, client_id)
    chat.is_deleted = True
    await db.commit()
    return {"ok": True}


# ── Chat tag assignment (per chat) ────────────────────────────────────────────


@router.post(
    "/{client_id}/tags",
    response_model=list[ChatTagSummary],
)
async def assign_tag_to_chat(
    client_id: UUID,
    payload: ChatTagAssign,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception)),
    db: AsyncSession = Depends(get_db),
):
    tag = await db.get(ChatTag, payload.tag_id)
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")

    chat = await _get_or_create_chat(db, client_id)
    existing = await db.execute(
        select(ChatTagAssignment).where(
            ChatTagAssignment.chat_id == chat.id,
            ChatTagAssignment.tag_id == tag.id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(ChatTagAssignment(chat_id=chat.id, tag_id=tag.id))
        await db.commit()

    return await _chat_tags_summary(db, chat.id)


@router.delete(
    "/{client_id}/tags/{tag_id}",
    response_model=list[ChatTagSummary],
)
async def unassign_tag_from_chat(
    client_id: UUID,
    tag_id: UUID,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception)),
    db: AsyncSession = Depends(get_db),
):
    chat_q = await db.execute(select(Chat).where(Chat.client_id == client_id))
    chat = chat_q.scalar_one_or_none()
    if chat is None:
        return []
    await db.execute(
        delete(ChatTagAssignment).where(
            ChatTagAssignment.chat_id == chat.id,
            ChatTagAssignment.tag_id == tag_id,
        )
    )
    await db.commit()
    return await _chat_tags_summary(db, chat.id)


async def _chat_tags_summary(db: AsyncSession, chat_id: UUID) -> list[ChatTagSummary]:
    rows = await db.execute(
        select(ChatTag)
        .join(ChatTagAssignment, ChatTagAssignment.tag_id == ChatTag.id)
        .where(ChatTagAssignment.chat_id == chat_id)
        .order_by(ChatTag.is_default.desc(), ChatTag.name.asc())
    )
    return [ChatTagSummary.model_validate(t) for t in rows.scalars().all()]


# ── Global tag dictionary ─────────────────────────────────────────────────────


@tags_router.get("", response_model=list[ChatTagOut])
async def list_chat_tags(
    _user=Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(ChatTag).order_by(ChatTag.is_default.desc(), ChatTag.name.asc())
    )
    return [ChatTagOut.model_validate(t) for t in rows.scalars().all()]


@tags_router.post("", response_model=ChatTagOut, status_code=status.HTTP_201_CREATED)
async def create_chat_tag(
    payload: ChatTagCreate,
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(ChatTag).where(func.lower(ChatTag.name) == payload.name.lower())
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tag with this name already exists")

    tag = ChatTag(
        name=payload.name,
        color=payload.color,
        is_default=False,
        created_by=user.id,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return ChatTagOut.model_validate(tag)


@tags_router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_tag(
    tag_id: UUID,
    _user=Depends(require_roles(UserRole.owner, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    tag = await db.get(ChatTag, tag_id)
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    if tag.is_default:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "System tags cannot be deleted"
        )
    await db.delete(tag)
    await db.commit()
    return None


# ── WebSocket connection manager ──────────────────────────────────────────────

class _Manager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws) if hasattr(self._connections, "discard") else (
            self._connections.remove(ws) if ws in self._connections else None
        )

    async def broadcast(self, data: str) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self._connections:
                self._connections.remove(ws)


_manager = _Manager()


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws")
async def chat_ws(
    websocket: WebSocket,
    token: str | None = None,
    redis=Depends(get_redis),
):
    """
    WebSocket для real-time обновлений чата.
    Аутентификация через query-параметр ?token=<jwt>.
    """
    # Validate JWT token
    if not token:
        await websocket.close(code=4001)
        return
    try:
        payload = decode_access_token(token)
        parse_access_payload(payload)
    except Exception:
        await websocket.close(code=4001)
        return

    await _manager.connect(websocket)

    if redis is None:
        # No Redis — just keep the connection alive, no events
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            _manager.disconnect(websocket)
        return

    pubsub = redis.pubsub()
    await pubsub.subscribe("chat:new_message", "chat:read")

    async def _listen() -> None:
        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            data = raw["data"]
            if isinstance(data, bytes):
                data = data.decode()
            await _manager.broadcast(data)

    listen_task = asyncio.create_task(_listen())

    try:
        while True:
            await websocket.receive_text()  # keep-alive pings
    except WebSocketDisconnect:
        pass
    finally:
        _manager.disconnect(websocket)
        listen_task.cancel()
        await pubsub.unsubscribe("chat:new_message", "chat:read")
        await pubsub.aclose()
