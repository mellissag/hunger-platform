"""ORM-модели — импорт для регистрации в metadata и Alembic."""

from __future__ import annotations

from app.models.ai_chat import AIConversation, AIMessage
from app.models.audit import AuditLog
from app.models.booking import BlacklistEntry, Booking, Review
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client, ClientNote
from app.models.color_formula import ColorFormula
from app.models.inventory import Product, ProductWriteOff, SupplyInvoice, SupplyInvoiceItem
from app.models.knowledge import KBChunk, KBDocument
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.models.schedule import ScheduleSlot
from app.models.stats import BotVisitStat
from app.models.user import AuthSession, User
from app.models.user_invite import UserInvite

__all__ = [
    "AIConversation",
    "AIMessage",
    "AuditLog",
    "AuthSession",
    "BlacklistEntry",
    "Booking",
    "BotVisitStat",
    "Broadcast",
    "BroadcastRecipient",
    "Client",
    "ClientNote",
    "ColorFormula",
    "KBChunk",
    "KBDocument",
    "Master",
    "MasterService",
    "Product",
    "ProductWriteOff",
    "SupplyInvoice",
    "SupplyInvoiceItem",
    "Review",
    "Salon",
    "ScheduleSlot",
    "Service",
    "ServiceCategory",
    "Settings",
    "User",
    "UserInvite",
]
