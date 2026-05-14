"""ARQ: WhatsApp webhook processing and outbound booking notifications."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock

from app.config import get_settings
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.chat_message import ChatChannel, ChatMessage, MessageDirection, MessageType
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus
from app.models.master import Master
from app.models.salon import Salon
from app.models.whatsapp_message import WhatsAppMessage, WhatsAppMsgDirection, WhatsAppMsgStatus
from app.services.chat_threads import ensure_client_chat_row
from app.services.whatsapp import is_whatsapp_configured, send_whatsapp_template_message, send_whatsapp_text_message
from app.services.whatsapp_bot import get_or_create_client_for_whatsapp_phone, process_inbound_text
from app.services.whatsapp_bot_messages import wb_msg
from app.utils.datetime_utils import format_booking_datetime
from app.utils.phone_digits import digits_only
from app.workers.reminders import _reminder_body

logger = logging.getLogger(__name__)

_STATUS_MAP = {
    "sent": WhatsAppMsgStatus.sent,
    "delivered": WhatsAppMsgStatus.delivered,
    "read": WhatsAppMsgStatus.read,
    "failed": WhatsAppMsgStatus.failed,
}


def _svc_name(svc: Service | None) -> str:
    name_i18n = svc.name_i18n if svc and isinstance(svc.name_i18n, dict) else {}
    return str(name_i18n.get("ru") or name_i18n.get("en") or "—")


def _client_name(client: Client | None) -> str:
    if not client:
        return "—"
    return " ".join(x for x in (client.first_name or "", client.last_name or "") if x).strip() or "—"


def _whatsapp_target_digits(client: Client) -> str | None:
    raw = (client.whatsapp_phone or client.phone or "").strip()
    d = digits_only(raw)
    return d or None


async def _find_client_by_wa_phone(session: AsyncSession, phone_digits: str) -> Client | None:
    if not phone_digits:
        return None
    fd = func.regexp_replace(func.coalesce(Client.phone, ""), r"[^0-9]", "", "g")
    fwa = func.regexp_replace(func.coalesce(Client.whatsapp_phone, ""), r"[^0-9]", "", "g")
    return await session.scalar(
        select(Client).where(or_(fd == phone_digits, fwa == phone_digits)).limit(1)
    )


async def _client_in_whatsapp_service_window(session: AsyncSession, client_id: UUID) -> bool:
    since = clock.utc_now() - timedelta(hours=24)
    n_chat = await session.scalar(
        select(func.count())
        .select_from(ChatMessage)
        .where(
            ChatMessage.client_id == client_id,
            ChatMessage.channel == ChatChannel.whatsapp,
            ChatMessage.direction == MessageDirection.inbound,
            ChatMessage.created_at >= since,
        )
    )
    if (n_chat or 0) > 0:
        return True
    n_wa = await session.scalar(
        select(func.count())
        .select_from(WhatsAppMessage)
        .where(
            WhatsAppMessage.client_id == client_id,
            WhatsAppMessage.direction == WhatsAppMsgDirection.IN,
            WhatsAppMessage.created_at >= since,
        )
    )
    return (n_wa or 0) > 0


async def _publish_chat_new_message(redis, payload: dict[str, Any]) -> None:
    payload["_event"] = "new_message"
    await redis.publish("chat:new_message", json.dumps(payload))


async def process_whatsapp_webhook(ctx: dict[str, Any], payload_json: str) -> None:
    settings = get_settings()
    factory = ctx["db"]
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError:
        logger.warning("whatsapp webhook: invalid json")
        return
    if not isinstance(payload, dict):
        return

    redis = None
    if settings.redis_url:
        from redis.asyncio import Redis

        redis = Redis.from_url(settings.redis_url, decode_responses=True)

    try:
        async with factory() as session:
            for entry in payload.get("entry") or []:
                if not isinstance(entry, dict):
                    continue
                for change in entry.get("changes") or []:
                    if not isinstance(change, dict):
                        continue
                    value = change.get("value")
                    if not isinstance(value, dict):
                        continue
                    for st in value.get("statuses") or []:
                        if not isinstance(st, dict):
                            continue
                        wa_id = st.get("id")
                        raw_status = str(st.get("status") or "").lower()
                        mapped = _STATUS_MAP.get(raw_status)
                        if isinstance(wa_id, str) and mapped is not None:
                            await session.execute(
                                update(WhatsAppMessage)
                                .where(WhatsAppMessage.wa_message_id == wa_id)
                                .values(status=mapped)
                            )
                    for msg in value.get("messages") or []:
                        if not isinstance(msg, dict):
                            continue
                        from_raw = msg.get("from")
                        wa_mid = msg.get("id")
                        ts_raw = msg.get("timestamp")
                        msg_type = str(msg.get("type") or "")
                        text_body: str | None = None
                        if msg_type == "text" and isinstance(msg.get("text"), dict):
                            tb = msg["text"].get("body")
                            text_body = str(tb) if tb is not None else None
                        if not isinstance(from_raw, str) or not isinstance(wa_mid, str):
                            continue
                        dup = await session.scalar(
                            select(func.count())
                            .select_from(WhatsAppMessage)
                            .where(WhatsAppMessage.wa_message_id == wa_mid)
                        )
                        if dup:
                            continue
                        phone_digits = digits_only(from_raw)
                        created_at: datetime | None = None
                        if ts_raw is not None:
                            try:
                                created_at = datetime.fromtimestamp(
                                    int(str(ts_raw)), tz=timezone.utc
                                )
                            except (TypeError, ValueError, OSError):
                                created_at = None
                        client = await _find_client_by_wa_phone(session, phone_digits)
                        client_id = client.id if client else None
                        wm = WhatsAppMessage(
                            client_id=client_id,
                            direction=WhatsAppMsgDirection.IN,
                            text=text_body,
                            wa_message_id=wa_mid,
                            status=None,
                            phone_number=phone_digits,
                            created_at=created_at or clock.utc_now(),
                        )
                        session.add(wm)
                        await session.flush()
                        if isinstance(text_body, str) and text_body.strip():
                            c = await get_or_create_client_for_whatsapp_phone(session, phone_digits)
                            wm.client_id = c.id
                            # Admin /chats list is driven by chat_messages, not whatsapp_messages alone.
                            await ensure_client_chat_row(session, c.id)
                            cm = ChatMessage(
                                client_id=c.id,
                                direction=MessageDirection.inbound,
                                message_type=MessageType.text,
                                text=text_body,
                                channel=ChatChannel.whatsapp,
                                is_read=False,
                            )
                            session.add(cm)
                            await session.flush()
                            if redis is not None:
                                try:
                                    await _publish_chat_new_message(
                                        redis,
                                        {
                                            "id": str(cm.id),
                                            "client_id": str(c.id),
                                            "direction": "inbound",
                                            "message_type": "text",
                                            "text": text_body,
                                            "media_path": None,
                                            "tg_message_id": None,
                                            "is_read": False,
                                            "created_at": cm.created_at.isoformat(),
                                            "channel": ChatChannel.whatsapp.value,
                                        },
                                    )
                                except Exception:  # noqa: BLE001
                                    logger.exception("redis publish inbound wa chat failed client=%s", c.id)

                            await process_inbound_text(
                                db=session,
                                redis=redis,
                                phone_digits=phone_digits,
                                text=text_body,
                                client=c,
                                telegram_bot=ctx.get("bot"),
                            )
            await session.commit()
    finally:
        if redis is not None:
            await redis.aclose()


async def send_whatsapp_booking_reminder(ctx: dict[str, Any], booking_id: str) -> None:
    settings = get_settings()
    if not is_whatsapp_configured(settings):
        return
    factory = ctx["db"]
    async with factory() as session:
        bid = UUID(booking_id)
        row = await session.execute(
            select(Booking, Client, Service, Master)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Master, Booking.master_id == Master.id)
            .where(Booking.id == bid, Booking.status == BookingStatus.confirmed)
        )
        tup = row.one_or_none()
        if tup is None:
            return
        booking, client, service, master = tup
        salon_row = await session.execute(select(Salon).limit(1))
        salon = salon_row.scalar_one_or_none()
        to_phone = _whatsapp_target_digits(client)
        if not to_phone:
            return
        salon_tz = (salon.timezone if salon else None) or "Europe/Sofia"
        lang = (client.lang or "en").split("-")[0].lower()
        if lang not in ("en", "ru", "uk", "bg"):
            lang = "en"
        service_name = str(
            (service.name_i18n or {}).get(lang)
            or (service.name_i18n or {}).get("en")
            or "Service"
        )
        master_name = master.display_name
        starts_local = format_booking_datetime(booking.starts_at, lang, salon_tz)
        contacts = salon.contacts if salon and isinstance(salon.contacts, dict) else {}
        address = str(contacts.get("address") or "").strip() or "—"
        body = _reminder_body(
            lang,
            "24h",
            service_name=service_name,
            master_name=master_name,
            starts_local=starts_local,
        )
        full_text = f"{body}\n📍 {address}"
        in_window = await _client_in_whatsapp_service_window(session, client.id)
        try:
            if in_window:
                await send_whatsapp_text_message(
                    db=session,
                    to_phone_digits=to_phone,
                    text=full_text,
                    client_id=client.id,
                    settings=settings,
                )
            else:
                tpl = (settings.whatsapp_reminder_template_name or "").strip()
                if not tpl:
                    logger.info("whatsapp reminder skipped (no template) booking=%s", booking_id)
                else:
                    params = [
                        _client_name(client),
                        service_name,
                        master_name,
                        starts_local,
                        address,
                    ]
                    await send_whatsapp_template_message(
                        db=session,
                        to_phone_digits=to_phone,
                        template_name=tpl,
                        language_code=lang,
                        body_parameters=params,
                        client_id=client.id,
                        transcript_text=full_text,
                        settings=settings,
                    )
            await session.commit()
        except Exception:  # noqa: BLE001
            logger.exception("send_whatsapp_booking_reminder failed booking=%s", booking_id)
            await session.rollback()


async def send_whatsapp_booking_client_notice(
    ctx: dict[str, Any], booking_id: str, kind: str, reason: str = ""
) -> None:
    """Outbound WhatsApp for booking status (only ``created_via=whatsapp`` bookings)."""
    settings = get_settings()
    if not is_whatsapp_configured(settings):
        return
    factory = ctx["db"]
    async with factory() as session:
        bid = UUID(booking_id)
        row = await session.execute(
            select(Booking, Client, Service, Master)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Master, Booking.master_id == Master.id)
            .where(Booking.id == bid)
        )
        tup = row.one_or_none()
        if tup is None:
            return
        booking, client, service, master = tup
        if booking.created_via != BookingCreatedVia.whatsapp:
            return
        to_phone = _whatsapp_target_digits(client)
        if not to_phone:
            return
        salon_row = await session.execute(select(Salon).limit(1))
        salon = salon_row.scalar_one_or_none()
        salon_tz = (salon.timezone if salon else None) or "Europe/Sofia"
        lang = (client.lang or "en").split("-")[0].lower()
        if lang not in ("en", "ru", "uk", "bg"):
            lang = "en"
        when = format_booking_datetime(booking.starts_at, lang, salon_tz)
        master_name = master.display_name if master else "—"
        if kind == "confirmed":
            full_text = wb_msg("status_confirmed", lang, master=master_name, when=when)
        elif kind == "rejected":
            full_text = wb_msg("status_cancelled", lang, when=when)
            if (reason or "").strip():
                full_text = f"{full_text}\n{reason.strip()}"
        elif kind == "rescheduled":
            full_text = wb_msg("status_rescheduled", lang, when=when)
        else:
            logger.warning("unknown wa notice kind=%s booking=%s", kind, booking_id)
            return

        in_window = await _client_in_whatsapp_service_window(session, client.id)
        try:
            if in_window:
                await send_whatsapp_text_message(
                    db=session,
                    to_phone_digits=to_phone,
                    text=full_text,
                    client_id=client.id,
                    settings=settings,
                )
            else:
                tpl = (settings.whatsapp_confirmation_template_name or "").strip()
                if not tpl:
                    logger.info(
                        "whatsapp client notice skipped (no template) booking=%s kind=%s",
                        booking_id,
                        kind,
                    )
                else:
                    params = [_svc_name(service), master_name, when]
                    await send_whatsapp_template_message(
                        db=session,
                        to_phone_digits=to_phone,
                        template_name=tpl,
                        language_code=lang,
                        body_parameters=params,
                        client_id=client.id,
                        transcript_text=full_text,
                        settings=settings,
                    )
            await session.commit()
        except Exception:  # noqa: BLE001
            logger.exception(
                "send_whatsapp_booking_client_notice failed booking=%s kind=%s",
                booking_id,
                kind,
            )
            await session.rollback()


async def send_whatsapp_booking_confirmation(ctx: dict[str, Any], booking_id: str) -> None:
    """Backward-compatible ARQ entrypoint (delegates to :func:`send_whatsapp_booking_client_notice`)."""
    await send_whatsapp_booking_client_notice(ctx, booking_id, "confirmed", "")
