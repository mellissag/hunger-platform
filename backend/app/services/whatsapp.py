"""WhatsApp Cloud API client (Meta Graph)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.models.chat_message import ChatChannel, ChatMessage, MessageDirection, MessageType
from app.models.whatsapp_message import WhatsAppMessage, WhatsAppMsgDirection, WhatsAppMsgStatus
from app.utils.phone_digits import digits_only

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v25.0"


def whatsapp_graph_messages_url(settings: Settings) -> str:
    pid = (settings.whatsapp_phone_number_id or "").strip()
    return f"https://graph.facebook.com/{GRAPH_API_VERSION}/{pid}/messages"


def is_whatsapp_configured(settings: Settings | None = None) -> bool:
    cfg = settings or get_settings()
    return bool(
        (cfg.whatsapp_token or "").strip()
        and (cfg.whatsapp_phone_number_id or "").strip()
    )


async def _post_messages_json(settings: Settings, body: dict[str, Any]) -> dict[str, Any]:
    url = whatsapp_graph_messages_url(settings)
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_token}",
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
            "WhatsApp Graph API error status=%s body=%s",
            resp.status_code,
            data,
        )
        resp.raise_for_status()
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected WhatsApp API response")
    return data


def _extract_sent_wa_id(result: dict[str, Any]) -> str | None:
    msgs = result.get("messages")
    if isinstance(msgs, list) and msgs:
        mid = msgs[0].get("id") if isinstance(msgs[0], dict) else None
        if isinstance(mid, str):
            return mid
    return None


async def send_whatsapp_text_message(
    *,
    db: AsyncSession,
    to_phone_digits: str,
    text: str,
    client_id: UUID | None,
    settings: Settings | None = None,
) -> tuple[str | None, ChatMessage | None]:
    """Send a session text message; persist outbound rows. Returns (wa_message_id, chat_message)."""
    cfg = settings or get_settings()
    if not is_whatsapp_configured(cfg):
        logger.info("WhatsApp send skipped: not configured")
        return None, None
    to_clean = digits_only(to_phone_digits)
    if not to_clean or not text.strip():
        return None, None
    body = {
        "messaging_product": "whatsapp",
        "to": to_clean,
        "type": "text",
        "text": {"body": text},
    }
    result = await _post_messages_json(cfg, body)
    wa_id = _extract_sent_wa_id(result)
    if not wa_id:
        logger.warning("WhatsApp send: missing message id in response %s", result)
        return None, None

    wm = WhatsAppMessage(
        client_id=client_id,
        direction=WhatsAppMsgDirection.OUT,
        text=text,
        wa_message_id=wa_id,
        status=WhatsAppMsgStatus.sent,
        phone_number=to_clean,
    )
    db.add(wm)
    cm_out: ChatMessage | None = None
    if client_id is not None:
        cm_out = ChatMessage(
            client_id=client_id,
            direction=MessageDirection.outbound,
            message_type=MessageType.text,
            text=text,
            channel=ChatChannel.whatsapp,
            is_read=True,
        )
        db.add(cm_out)
    await db.flush()
    return wa_id, cm_out


async def send_whatsapp_template_message(
    *,
    db: AsyncSession,
    to_phone_digits: str,
    template_name: str,
    language_code: str,
    body_parameters: list[str],
    client_id: UUID | None,
    transcript_text: str | None = None,
    settings: Settings | None = None,
) -> tuple[str | None, ChatMessage | None]:
    """Send an approved template; persist outbound WhatsApp + chat rows."""
    cfg = settings or get_settings()
    if not is_whatsapp_configured(cfg):
        return None, None
    to_clean = digits_only(to_phone_digits)
    if not to_clean or not template_name.strip():
        return None, None
    lang = (language_code or "en").replace("_", "-").split("-")[0].lower()
    if len(lang) != 2:
        lang = "en"
    components: list[dict[str, Any]] = []
    if body_parameters:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in body_parameters],
            }
        )
    body = {
        "messaging_product": "whatsapp",
        "to": to_clean,
        "type": "template",
        "template": {
            "name": template_name.strip(),
            "language": {"code": lang},
            "components": components,
        },
    }
    result = await _post_messages_json(cfg, body)
    wa_id = _extract_sent_wa_id(result)
    if not wa_id:
        return None, None
    preview = " ".join(str(p) for p in body_parameters[:6])
    wm = WhatsAppMessage(
        client_id=client_id,
        direction=WhatsAppMsgDirection.OUT,
        text=(transcript_text or preview)[:2048] or None,
        wa_message_id=wa_id,
        status=WhatsAppMsgStatus.sent,
        phone_number=to_clean,
    )
    db.add(wm)
    cm_out: ChatMessage | None = None
    if client_id is not None:
        cm_out = ChatMessage(
            client_id=client_id,
            direction=MessageDirection.outbound,
            message_type=MessageType.text,
            text=transcript_text if transcript_text is not None else (preview[:4096] or f"[template:{template_name}]"),
            channel=ChatChannel.whatsapp,
            is_read=True,
        )
        db.add(cm_out)
    await db.flush()
    return wa_id, cm_out
