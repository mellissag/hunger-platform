"""Перечисления домена (PostgreSQL ENUM + Python Enum)."""

from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    master = "master"
    reception = "reception"


class ThemePreset(str, enum.Enum):
    premium_light = "premium_light"
    premium_dark = "premium_dark"


class LateCancellationPolicy(str, enum.Enum):
    no_cancel = "no_cancel"
    fine = "fine"
    blacklist = "blacklist"


class SlotType(str, enum.Enum):
    working = "working"
    vacation = "vacation"
    sick = "sick"
    block = "block"
    break_ = "break"  # DB value "break"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled_by_client = "cancelled_by_client"
    cancelled_by_salon = "cancelled_by_salon"
    no_show = "no_show"


class PrepaymentStatus(str, enum.Enum):
    none = "none"
    required = "required"
    paid = "paid"
    refunded = "refunded"
    failed = "failed"


class BroadcastStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    sending = "sending"
    sent = "sent"
    failed = "failed"


class BroadcastRecipientStatus(str, enum.Enum):
    sent = "sent"
    delivered = "delivered"
    failed = "failed"


class KBSourceType(str, enum.Enum):
    file = "file"
    url = "url"
    manual = "manual"


class ClientSource(str, enum.Enum):
    bot = "bot"
    manual = "manual"


class BookingCreatedVia(str, enum.Enum):
    bot = "bot"
    admin = "admin"
    mini_app = "mini_app"
    manual = "manual"
    broadcast = "broadcast"


class AIMessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"
