"""RBAC: роли и преднаборы для Depends."""

from __future__ import annotations

from enum import Enum

from app.models.enums import UserRole

# Публичный алиас роли (как в спецификации: owner, admin, master, reception)
Role = UserRole


class RolesRequired(Enum):
    """Именованные наборы ролей для эндпоинтов и OpenAPI."""

    STAFF = (UserRole.owner, UserRole.admin, UserRole.master, UserRole.reception)
    ADMINS = (UserRole.owner, UserRole.admin)
    OWNER_ONLY = (UserRole.owner,)
    SALON_SETTINGS = (UserRole.owner,)
