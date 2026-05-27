"""ORM-модели — импорт для регистрации в metadata и Alembic."""

from __future__ import annotations

from app.models.ai_chat import AIConversation, AIMessage
from app.models.auto_trigger import AutoTrigger, TriggerLog
from app.models.audit import AuditLog
from app.models.booking import BlacklistEntry, Booking, Review
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.catalog import MasterService, Service, ServiceCategory, ServiceCategoryLink
from app.models.chat import Chat, ChatTag, ChatTagAssignment
from app.models.chat_message import ChatMessage
from app.models.instagram_message import InstagramMessage
from app.models.whatsapp_message import WhatsAppMessage
from app.models.client import Client, ClientNote
from app.models.color_formula import ColorFormula
from app.models.daily_pick import DailyPick
from app.models.inventory import Product, ProductWriteOff, SupplyInvoice, SupplyInvoiceItem
from app.models.knowledge import KBChunk, KBDocument
from app.models.loyalty import (
    ClientStatus,
    LoyaltySettings,
    LoyaltyTransaction,
    PromoCode,
    ReferralCode,
)
from app.models.master import Master
from app.models.reports import Expense, SalaryPayment, SalarySettings
from app.models.salon import Salon, Settings
from app.models.schedule import ScheduleSlot
from app.models.stats import BotVisitStat
from app.models.user import AuthSession, User
from app.models.user_invite import UserInvite

__all__ = [
    "AIConversation",
    "AIMessage",
    "AutoTrigger",
    "AuditLog",
    "AuthSession",
    "BlacklistEntry",
    "Booking",
    "BotVisitStat",
    "Broadcast",
    "BroadcastRecipient",
    "Chat",
    "ChatMessage",
    "InstagramMessage",
    "WhatsAppMessage",
    "ChatTag",
    "ChatTagAssignment",
    "Client",
    "ClientNote",
    "ColorFormula",
    "DailyPick",
    "KBChunk",
    "KBDocument",
    "ClientStatus",
    "LoyaltySettings",
    "LoyaltyTransaction",
    "PromoCode",
    "ReferralCode",
    "Expense",
    "Master",
    "SalaryPayment",
    "SalarySettings",
    "MasterService",
    "Product",
    "ProductWriteOff",
    "SupplyInvoice",
    "SupplyInvoiceItem",
    "TriggerLog",
    "Review",
    "Salon",
    "ScheduleSlot",
    "Service",
    "ServiceCategory",
    "ServiceCategoryLink",
    "Settings",
    "User",
    "UserInvite",
]
