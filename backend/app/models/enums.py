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
    whatsapp = "whatsapp"
    instagram = "instagram"
    broadcast = "broadcast"
    ai_chat = "ai_chat"


class PaymentMethod(str, enum.Enum):
    unpaid = "unpaid"
    cash = "cash"
    card = "card"
    mixed = "mixed"


class ExpenseCategory(str, enum.Enum):
    rent = "rent"
    utilities = "utilities"
    supplies = "supplies"
    advertising = "advertising"
    equipment = "equipment"
    taxes = "taxes"
    software = "software"
    training = "training"
    salary_bonus = "salary_bonus"
    other = "other"


class SalaryType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"
    mixed = "mixed"


class SalaryPaymentStatus(str, enum.Enum):
    calculated = "calculated"
    paid = "paid"


class AIMessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class PromoDiscountType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"


class ReferralRewardMode(str, enum.Enum):
    both = "both"
    referrer_only = "referrer_only"
    invited_only = "invited_only"


class ReferralTrigger(str, enum.Enum):
    on_registration = "on_registration"
    on_first_visit = "on_first_visit"


class LoyaltyTransactionType(str, enum.Enum):
    earned = "earned"
    spent = "spent"
    referral_bonus = "referral_bonus"
    manual_adjustment = "manual_adjustment"
