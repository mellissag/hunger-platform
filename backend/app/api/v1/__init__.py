"""API v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    admin_chat,
    ai_chat,
    audit,
    auth,
    blacklist,
    bookings,
    broadcasts,
    clients,
    color_formulas,
    inventory,
    knowledge,
    loyalty_admin,
    me_loyalty,
    master_portal,
    masters,
    mini_app,
    notifications,
    public_api,
    salon,
    schedule,
    segments,
    service_categories,
    services,
    settings as settings_routes,
    stats,
    tg,
    upload,
    users_admin,
)
from app.api.v1.webhooks import instagram as webhooks_instagram
from app.api.v1.webhooks import whatsapp as webhooks_whatsapp

api_router = APIRouter()
api_router.include_router(webhooks_whatsapp.router)
api_router.include_router(webhooks_instagram.router)
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(admin_chat.router)
api_router.include_router(admin_chat.tags_router)
api_router.include_router(clients.router)
api_router.include_router(masters.router)
api_router.include_router(service_categories.router)
api_router.include_router(services.router)
api_router.include_router(bookings.router)
api_router.include_router(schedule.router)
api_router.include_router(ai_chat.router)
api_router.include_router(knowledge.router)
api_router.include_router(segments.router)
api_router.include_router(broadcasts.router)
api_router.include_router(broadcasts.triggers_router)
api_router.include_router(stats.router)
api_router.include_router(tg.router)
api_router.include_router(salon.router)
api_router.include_router(settings_routes.router)
api_router.include_router(blacklist.router)
api_router.include_router(users_admin.router)
api_router.include_router(audit.router)
api_router.include_router(notifications.router)
api_router.include_router(mini_app.router)
api_router.include_router(me_loyalty.router)
api_router.include_router(loyalty_admin.router)
api_router.include_router(public_api.router)
api_router.include_router(upload.router)
api_router.include_router(inventory.router)
api_router.include_router(color_formulas.router)
api_router.include_router(color_formulas.client_router)
api_router.include_router(master_portal.router)
