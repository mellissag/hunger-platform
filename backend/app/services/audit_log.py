"""Запись в audit_log."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.enums import UserRole


async def record_auth_login(
    db: AsyncSession,
    *,
    user_id: UUID,
    ip: str | None,
    user_agent: str | None,
    email_hint: str | None = None,
) -> None:
    payload: dict[str, Any] = {}
    if email_hint:
        payload["email"] = email_hint
    db.add(
        AuditLog(
            user_id=user_id,
            action="auth.login",
            entity_type="user",
            entity_id=user_id,
            payload=payload or None,
            ip=ip,
            user_agent=user_agent,
        )
    )


async def record_auth_logout(
    db: AsyncSession,
    *,
    user_id: UUID,
    session_id: UUID | None,
    ip: str | None,
    user_agent: str | None,
) -> None:
    payload: dict[str, Any] = {}
    if session_id:
        payload["session_id"] = str(session_id)
    db.add(
        AuditLog(
            user_id=user_id,
            action="auth.logout",
            entity_type="session",
            entity_id=session_id,
            payload=payload or None,
            ip=ip,
            user_agent=user_agent,
        )
    )


async def record_event(
    db: AsyncSession,
    *,
    user_id: UUID | None,
    action: str,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload,
            ip=ip,
            user_agent=user_agent,
        )
    )


async def record_role_change(
    db: AsyncSession,
    *,
    actor_user_id: UUID,
    target_user_id: UUID,
    old_role: UserRole,
    new_role: UserRole,
    ip: str | None,
    user_agent: str | None,
) -> None:
    db.add(
        AuditLog(
            user_id=actor_user_id,
            action="user.role_changed",
            entity_type="user",
            entity_id=target_user_id,
            payload={
                "old_role": old_role.value,
                "new_role": new_role.value,
            },
            ip=ip,
            user_agent=user_agent,
        )
    )
