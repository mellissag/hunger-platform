"""WhatsApp Business Cloud API webhook (Meta)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse

from app.config import get_settings
from app.services.whatsapp_queue import enqueue_process_whatsapp_webhook

router = APIRouter(prefix="/webhooks/whatsapp", tags=["webhooks-whatsapp"])


@router.get("", response_class=PlainTextResponse)
async def whatsapp_verify(
    hub_mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    hub_verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    hub_challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> PlainTextResponse:
    settings = get_settings()
    expected = (settings.whatsapp_verify_token or "").strip()
    if not hub_mode or hub_mode != "subscribe":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid mode")
    if not expected or hub_verify_token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verify token")
    if hub_challenge is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing challenge")
    return PlainTextResponse(content=hub_challenge, status_code=status.HTTP_200_OK)


@router.post("")
async def whatsapp_events(request: Request) -> dict[str, bool]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    await enqueue_process_whatsapp_webhook(body if isinstance(body, dict) else {})
    return {"ok": True}
