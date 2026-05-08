"""Сохранение входящих сообщений клиентов в chat_message + Redis pub/sub."""

from __future__ import annotations

import json
import os
from pathlib import Path

from aiogram import Bot, F, Router
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_redis_optional
from app.models.chat_message import ChatMessage, MessageDirection, MessageType
from app.models.client import Client

router = Router(name="chat_inbound")

_UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "./data/uploads"))
CHAT_MEDIA_DIR = _UPLOAD_DIR / "chat"


def _ensure_media_dir() -> None:
    CHAT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)


async def _download(bot: Bot, file_id: str, dest: Path) -> None:
    if dest.exists():
        return
    file = await bot.get_file(file_id)
    await bot.download_file(file.file_path, destination=str(dest))


async def _persist(
    db: AsyncSession,
    client: Client,
    direction: MessageDirection,
    msg_type: MessageType,
    text: str | None,
    tg_file_id: str | None,
    media_path: str | None,
    tg_message_id: int | None,
) -> ChatMessage:
    msg = ChatMessage(
        client_id=client.id,
        direction=direction,
        message_type=msg_type,
        text=text,
        tg_file_id=tg_file_id,
        media_path=media_path,
        tg_message_id=tg_message_id,
        is_read=False,
    )
    db.add(msg)
    await db.flush()

    redis = get_redis_optional()
    if redis is not None:
        payload = {
            "id": str(msg.id),
            "client_id": str(client.id),
            "direction": direction.value,
            "message_type": msg_type.value,
            "text": text,
            "media_path": f"chat/{Path(media_path).name}" if media_path else None,
            "tg_message_id": tg_message_id,
            "is_read": False,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        await redis.publish("chat:new_message", json.dumps(payload))

    return msg


# ── Text ──────────────────────────────────────────────────────────────────────

@router.message(F.text & ~F.text.startswith("/"))
async def handle_text(message: Message, db: AsyncSession, tg_client: Client) -> None:
    if tg_client is None:
        return
    await _persist(
        db, tg_client,
        MessageDirection.inbound, MessageType.text,
        text=message.text,
        tg_file_id=None, media_path=None,
        tg_message_id=message.message_id,
    )


# ── Photo ─────────────────────────────────────────────────────────────────────

@router.message(F.photo)
async def handle_photo(message: Message, bot: Bot, db: AsyncSession, tg_client: Client) -> None:
    if tg_client is None:
        return
    _ensure_media_dir()
    photo = message.photo[-1]
    dest = CHAT_MEDIA_DIR / f"{photo.file_id}.jpg"
    await _download(bot, photo.file_id, dest)
    await _persist(
        db, tg_client,
        MessageDirection.inbound, MessageType.photo,
        text=message.caption,
        tg_file_id=photo.file_id, media_path=str(dest),
        tg_message_id=message.message_id,
    )


# ── Video ─────────────────────────────────────────────────────────────────────

@router.message(F.video)
async def handle_video(message: Message, bot: Bot, db: AsyncSession, tg_client: Client) -> None:
    if tg_client is None:
        return
    _ensure_media_dir()
    video = message.video
    dest = CHAT_MEDIA_DIR / f"{video.file_id}.mp4"
    await _download(bot, video.file_id, dest)
    await _persist(
        db, tg_client,
        MessageDirection.inbound, MessageType.video,
        text=message.caption,
        tg_file_id=video.file_id, media_path=str(dest),
        tg_message_id=message.message_id,
    )


# ── Voice ─────────────────────────────────────────────────────────────────────

@router.message(F.voice)
async def handle_voice(message: Message, bot: Bot, db: AsyncSession, tg_client: Client) -> None:
    if tg_client is None:
        return
    _ensure_media_dir()
    voice = message.voice
    dest = CHAT_MEDIA_DIR / f"{voice.file_id}.ogg"
    await _download(bot, voice.file_id, dest)
    await _persist(
        db, tg_client,
        MessageDirection.inbound, MessageType.voice,
        text=None,
        tg_file_id=voice.file_id, media_path=str(dest),
        tg_message_id=message.message_id,
    )


# ── Document ──────────────────────────────────────────────────────────────────

@router.message(F.document)
async def handle_document(message: Message, bot: Bot, db: AsyncSession, tg_client: Client) -> None:
    if tg_client is None:
        return
    _ensure_media_dir()
    doc = message.document
    safe_name = (doc.file_name or doc.file_id).replace("/", "_")
    dest = CHAT_MEDIA_DIR / f"{doc.file_id}_{safe_name}"
    await _download(bot, doc.file_id, dest)
    await _persist(
        db, tg_client,
        MessageDirection.inbound, MessageType.document,
        text=message.caption,
        tg_file_id=doc.file_id, media_path=str(dest),
        tg_message_id=message.message_id,
    )
