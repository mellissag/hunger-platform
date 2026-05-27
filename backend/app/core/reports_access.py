"""Доступ к разделу «Отчёты»: owner всегда; admin — при reports_access."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.deps import get_current_user
from app.models.enums import UserRole
from app.models.user import User


def user_has_reports_access(user: User) -> bool:
    if user.role == UserRole.owner:
        return True
    if user.role == UserRole.admin and user.reports_access:
        return True
    return False


async def require_reports_access(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user_has_reports_access(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reports access denied",
        )
    return user


ReportsUser = Annotated[User, Depends(require_reports_access)]
