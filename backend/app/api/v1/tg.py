"""Telegram webhook."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.config import get_settings

router = APIRouter(prefix="/tg", tags=["telegram"])


@router.post("/webhook/{secret}")
async def telegram_webhook(
    request: Request,
    secret: str,
    x_telegram_bot_api_secret_token: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    settings = get_settings()
    if not settings.telegram_webhook_secret or secret != settings.telegram_webhook_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid secret")
    if (
        settings.telegram_webhook_secret
        and x_telegram_bot_api_secret_token
        and x_telegram_bot_api_secret_token != settings.telegram_webhook_secret
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid secret token")

    dp = getattr(request.app.state, "dp", None)
    bot = getattr(request.app.state, "bot", None)
    if dp is None or bot is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot not configured")

    body = await request.json()
    await dp.feed_webhook_update(bot, body)
    return {"ok": True}
