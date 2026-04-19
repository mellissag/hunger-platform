"""ORM-модели — импорт для регистрации в metadata и Alembic."""

from __future__ import annotations

from app.models.ai_chat import AIConversation, AIMessage
from app.models.audit import AuditLog
from app.models.booking import BlacklistEntry, Booking, Review
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client, ClientNote
from app.models.knowledge import KBChunk, KBDocument
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.models.schedule import ScheduleSlot
from app.models.stats import BotVisitStat
from app.models.user import AuthSession, User

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
    "KBChunk",
    "KBDocument",
    "Master",
    "MasterService",
    "Review",
    "Salon",
    "ScheduleSlot",
    "Service",
    "ServiceCategory",
    "Settings",
    "User",
]
