"""Audit log (owner)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.audit_api import AuditLogOut
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/audit", tags=["audit"])

_OWNER = (UserRole.owner,)


@router.get("/log", response_model=PaginatedResponse[AuditLogOut])
async def list_audit(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_OWNER))],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = None,
    user_id: UUID | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
) -> PaginatedResponse[AuditLogOut]:
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
        count_stmt = count_stmt.where(AuditLog.user_id == user_id)
    if from_ is not None:
        stmt = stmt.where(AuditLog.created_at >= from_)
        count_stmt = count_stmt.where(AuditLog.created_at >= from_)
    if to is not None:
        stmt = stmt.where(AuditLog.created_at <= to)
        count_stmt = count_stmt.where(AuditLog.created_at <= to)
    total = (await db.execute(count_stmt)).scalar_one()
    offset = (page - 1) * page_size
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()
    items = [AuditLogOut.model_validate(r) for r in rows]
    return PaginatedResponse(items=items, total=int(total or 0), page=page, page_size=page_size)
