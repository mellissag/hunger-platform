"""Shared helpers for admin chat rows (metadata per client)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Chat
from app.models.client import Client


async def ensure_client_chat_row(db: AsyncSession, client_id: UUID) -> Chat:
    """Create ``chat`` metadata row if missing (same semantics as admin_chat._get_or_create_chat)."""
    existing = await db.execute(select(Chat).where(Chat.client_id == client_id))
    chat = existing.scalar_one_or_none()
    if chat is not None:
        return chat
    client = await db.get(Client, client_id)
    if client is None:
        raise ValueError("Client not found")
    chat = Chat(client_id=client_id)
    db.add(chat)
    await db.flush()
    return chat
