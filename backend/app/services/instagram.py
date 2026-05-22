"""Instagram Messaging API client (graph.instagram.com)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.config import Settings, get_settings
from app.models.chat_message import ChatChannel, ChatMessage, MessageDirection, MessageType
from app.models.client import Client
from app.models.enums import ClientSource
from app.models.instagram_message import InstagramMessage, InstagramMsgDirection
from app.services.chat_threads import ensure_client_chat_row
from app.services.whatsapp import publish_chat_new_message_redis

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"


def instagram_messages_url(settings: Settings) -> str:
    ig_id = (settings.instagram_account_id or "").strip()
    return f"https://graph.instagram.com/{GRAPH_API_VERSION}/{ig_id}/messages"


async def get_or_create_client_for_instagram_user(
    db: AsyncSession,
    instagram_user_id: str,
) -> Client:
    ig_id = instagram_user_id.strip()
    existing = await db.scalar(
        select(Client).where(Client.instagram_user_id == ig_id).limit(1)
    )
    if existing is not None:
        return existing
    c = Client(
        instagram_user_id=ig_id,
        first_name="Instagram",
        lang="en",
        source=ClientSource.bot,
    )
    db.add(c)
    await db.flush()
    return c


def is_instagram_configured(settings: Settings | None = None) -> bool:
    cfg = settings or get_settings()
    return bool(
        (cfg.instagram_page_access_token or "").strip()
        and (cfg.instagram_account_id or "").strip()
    )


async def _post_instagram_json(settings: Settings, body: dict[str, Any]) -> dict[str, Any]:
    url = instagram_messages_url(settings)
    headers = {
        "Authorization": f"Bearer {settings.instagram_page_access_token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(url, headers=headers, json=body)
    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        data = {"raw": resp.text}
    if resp.status_code >= 400:
        logger.warning(
            "Instagram Graph API error status=%s body=%s",
            resp.status_code,
            data,
        )
        resp.raise_for_status()
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Instagram API response")
    return data


def _extract_sent_ig_id(result: dict[str, Any]) -> str | None:
    mid = result.get("message_id") or result.get("id")
    if isinstance(mid, str):
        return mid
    return None


async def persist_instagram_inbound_chat_message(
    db: AsyncSession,
    *,
    client_id: UUID,
    text: str,
    redis: Any | None = None,
) -> ChatMessage:
    await ensure_client_chat_row(db, client_id)
    cm = ChatMessage(
        client_id=client_id,
        direction=MessageDirection.inbound,
        message_type=MessageType.text,
        text=text,
        channel=ChatChannel.instagram,
        is_read=False,
    )
    db.add(cm)
    await db.flush()
    if redis is not None:
        try:
            await publish_chat_new_message_redis(
                redis,
                {
                    "id": str(cm.id),
                    "client_id": str(client_id),
                    "direction": "inbound",
                    "message_type": "text",
                    "text": text,
                    "media_path": None,
                    "tg_message_id": None,
                    "is_read": False,
                    "created_at": cm.created_at.isoformat(),
                    "channel": ChatChannel.instagram.value,
                },
            )
        except Exception:  # noqa: BLE001
            logger.exception("redis publish inbound ig chat failed client=%s", client_id)
    return cm


async def send_instagram_text_message(
    *,
    db: AsyncSession,
    to_instagram_user_id: str,
    text: str,
    client_id: UUID | None,
    settings: Settings | None = None,
) -> tuple[str | None, ChatMessage | None]:
    """Send a text DM; persist outbound rows."""
    cfg = settings or get_settings()
    if not is_instagram_configured(cfg):
        logger.info("Instagram send skipped: not configured")
        return None, None
    recipient = (to_instagram_user_id or "").strip()
    if not recipient or not text.strip():
        return None, None
    body = {
        "recipient": {"id": recipient},
        "message": {"text": text[:1000]},
    }
    result = await _post_instagram_json(cfg, body)
    ig_mid = _extract_sent_ig_id(result)
    if not ig_mid:
        logger.warning("Instagram send: missing message id in response %s", result)
        return None, None

    im = InstagramMessage(
        client_id=client_id,
        direction=InstagramMsgDirection.OUT,
        text=text,
        ig_message_id=ig_mid,
        instagram_user_id=recipient,
    )
    db.add(im)
    cm_out: ChatMessage | None = None
    if client_id is not None:
        cm_out = ChatMessage(
            client_id=client_id,
            direction=MessageDirection.outbound,
            message_type=MessageType.text,
            text=text,
            channel=ChatChannel.instagram,
            is_read=True,
        )
        db.add(cm_out)
    await db.flush()
    return ig_mid, cm_out
