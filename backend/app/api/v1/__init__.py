"""API v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import ai_chat, auth, bookings, clients, knowledge, masters, schedule, service_categories, services, tg

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(clients.router)
api_router.include_router(masters.router)
api_router.include_router(service_categories.router)
api_router.include_router(services.router)
api_router.include_router(bookings.router)
api_router.include_router(schedule.router)
api_router.include_router(ai_chat.router)
api_router.include_router(knowledge.router)
api_router.include_router(tg.router)
