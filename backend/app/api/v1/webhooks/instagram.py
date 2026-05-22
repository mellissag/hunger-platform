"""Instagram Messaging API webhook (Meta)."""

from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse

from app.config import get_settings
from app.services.instagram import is_instagram_configured
from app.services.instagram_queue import enqueue_process_instagram_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/instagram", tags=["webhooks-instagram"])


@router.get("", response_class=PlainTextResponse)
async def instagram_verify(
    hub_mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    hub_verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    hub_challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> PlainTextResponse:
    settings = get_settings()
    expected = (settings.instagram_webhook_verify_token or "").strip()
    if not hub_mode or hub_mode != "subscribe":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid mode")
    if not expected or hub_verify_token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verify token")
    if hub_challenge is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing challenge")
    return PlainTextResponse(content=hub_challenge, status_code=status.HTTP_200_OK)


@router.get("/status")
async def instagram_webhook_status() -> dict[str, object]:
    """Quick check that Instagram env vars are loaded (no secrets returned)."""
    cfg = get_settings()
    return {
        "configured": is_instagram_configured(cfg),
        "account_id_set": bool((cfg.instagram_account_id or "").strip()),
        "token_set": bool((cfg.instagram_page_access_token or "").strip()),
        "verify_token_set": bool((cfg.instagram_webhook_verify_token or "").strip()),
    }


@router.post("")
async def instagram_events(request: Request) -> dict[str, bool]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    payload = body if isinstance(body, dict) else {}
    logger.info(
        "instagram webhook POST object=%s entries=%s",
        payload.get("object") if isinstance(payload, dict) else None,
        len(payload.get("entry") or []) if isinstance(payload, dict) else 0,
    )
    settings = get_settings()
    if settings.redis_url:
        await enqueue_process_instagram_webhook(payload)
    else:
        logger.warning("REDIS_URL unset — processing Instagram webhook inline")
        from app.db.base import get_async_session_factory
        from app.workers.instagram_tasks import process_instagram_webhook

        ctx: dict[str, object] = {"db": get_async_session_factory(), "bot": None}
        if settings.telegram_bot_token:
            from app.bot import build_bot

            ctx["bot"] = build_bot(settings.telegram_bot_token)
        await process_instagram_webhook(ctx, json.dumps(payload))
    return {"ok": True}
