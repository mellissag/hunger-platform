"""Instagram DM bot — reuses WhatsApp booking dialog via channel context."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.services.instagram import get_or_create_client_for_instagram_user
from app.services.whatsapp_bot import (
    WhatsappInboundResult,
    _bot_channel,
    _ig_recipient_id,
    process_inbound_text,
)

logger = logging.getLogger(__name__)


async def handle_instagram_message(
    *,
    db: AsyncSession,
    redis: Any,
    instagram_user_id: str,
    text: str,
    client: Client,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    """Run shared salon bot logic with Instagram outbound transport."""
    ig_id = instagram_user_id.strip()
    ch_token = _bot_channel.set("instagram")
    ig_token = _ig_recipient_id.set(ig_id)
    try:
        return await process_inbound_text(
            db=db,
            redis=redis,
            phone_digits=f"ig:{ig_id}",
            text=text,
            client=client,
            telegram_bot=telegram_bot,
        )
    finally:
        _bot_channel.reset(ch_token)
        _ig_recipient_id.reset(ig_token)


__all__ = [
    "get_or_create_client_for_instagram_user",
    "handle_instagram_message",
]
