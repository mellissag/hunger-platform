"""Гранулярные права доступа пользователей + RBAC-наборы ролей."""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.user import User

# Публичный алиас (обратная совместимость)
Role = UserRole


class RolesRequired(Enum):
    """Именованные наборы ролей для эндпоинтов."""

    STAFF = (UserRole.owner, UserRole.admin, UserRole.master, UserRole.reception)
    ADMINS = (UserRole.owner, UserRole.admin)
    OWNER_ONLY = (UserRole.owner,)
    SALON_SETTINGS = (UserRole.owner,)

ALL_PERMISSIONS: list[str] = [
    # Клиенты
    "clients_view",
    "clients_own_only",
    "clients_view_phones",
    "clients_notes",
    "clients_edit",
    "clients_blacklist",
    "clients_export",
    "clients_telegram",
    # Мастера
    "masters_view_all",
    "masters_own_only",
    # Записи
    "bookings_view_all",
    "bookings_create",
    "bookings_edit_others",
    "bookings_cancel_others",
    "bookings_status",
    # Финансы
    "finance_revenue",
    "finance_salaries",
    "finance_stats",
    "finance_export",
    # Статистика
    "stats_salon",
    "stats_masters",
    "stats_services",
    # Услуги и мастера
    "services_manage",
    "masters_manage",
    "schedule_others",
    # Маркетинг
    "broadcasts_view",
    "broadcasts_send",
    # Склад и формулы
    "inventory_view",
    "inventory_edit",
    "formulas_view",
    "formulas_edit",
    # Система
    "settings_edit",
    "users_manage",
    "audit_view",
    "ai_manage",
    "integrations_manage",
    # Доступ мастера к страницам (управляется владельцем через /users)
    "page_bookings",
    "page_clients",
    "page_schedule",
    "page_statistics",
    "page_masters",
    "page_inventory",
    "page_formulas",
    "page_chats",
]

ROLE_DEFAULTS: dict[str, dict[str, bool]] = {
    "owner": {p: True for p in ALL_PERMISSIONS},

    "admin": {
        "clients_view": True,
        "clients_own_only": False,
        "clients_view_phones": True,
        "clients_notes": True,
        "clients_edit": True,
        "clients_blacklist": True,
        "clients_export": True,
        "clients_telegram": True,
        "masters_view_all": True,
        "masters_own_only": False,
        "bookings_view_all": True,
        "bookings_create": True,
        "bookings_edit_others": True,
        "bookings_cancel_others": True,
        "bookings_status": True,
        "finance_revenue": True,
        "finance_salaries": False,
        "finance_stats": True,
        "finance_export": True,
        "stats_salon": True,
        "stats_masters": True,
        "stats_services": True,
        "services_manage": True,
        "masters_manage": True,
        "schedule_others": True,
        "broadcasts_view": True,
        "broadcasts_send": True,
        "inventory_view": True,
        "inventory_edit": True,
        "formulas_view": True,
        "formulas_edit": True,
        "settings_edit": False,
        "users_manage": False,
        "audit_view": True,
        "ai_manage": False,
        "integrations_manage": False,
        # Доступ к страницам (для мастеров; admin имеет полный доступ)
        "page_bookings": True,
        "page_clients": True,
        "page_schedule": True,
        "page_statistics": True,
        "page_masters": True,
        "page_inventory": True,
        "page_formulas": True,
        "page_chats": True,
    },

    "reception": {
        "clients_view": True,
        "clients_own_only": False,
        "clients_view_phones": True,
        "clients_notes": True,
        "clients_edit": True,
        "clients_blacklist": False,
        "clients_export": False,
        "clients_telegram": True,
        "masters_view_all": True,
        "masters_own_only": False,
        "bookings_view_all": True,
        "bookings_create": True,
        "bookings_edit_others": True,
        "bookings_cancel_others": True,
        "bookings_status": True,
        "finance_revenue": False,
        "finance_salaries": False,
        "finance_stats": False,
        "finance_export": False,
        "stats_salon": False,
        "stats_masters": False,
        "stats_services": False,
        "services_manage": False,
        "masters_manage": False,
        "schedule_others": False,
        "broadcasts_view": True,
        "broadcasts_send": False,
        "inventory_view": False,
        "inventory_edit": False,
        "formulas_view": False,
        "formulas_edit": False,
        "settings_edit": False,
        "users_manage": False,
        "audit_view": False,
        "ai_manage": False,
        "integrations_manage": False,
        # Доступ к страницам (reception не управляет мастерами)
        "page_bookings": True,
        "page_clients": True,
        "page_schedule": True,
        "page_statistics": False,
        "page_masters": False,
        "page_inventory": False,
        "page_formulas": False,
        "page_chats": True,
    },

    "master": {
        "clients_view": True,
        "clients_own_only": True,
        "clients_view_phones": False,
        "clients_notes": True,
        "clients_edit": False,
        "clients_blacklist": False,
        "clients_export": False,
        "clients_telegram": False,
        "masters_view_all": False,
        "masters_own_only": True,
        "bookings_view_all": False,
        "bookings_create": False,
        "bookings_edit_others": False,
        "bookings_cancel_others": False,
        "bookings_status": True,
        "finance_revenue": False,
        "finance_salaries": False,
        "finance_stats": False,
        "finance_export": False,
        "stats_salon": False,
        "stats_masters": False,
        "stats_services": False,
        "services_manage": False,
        "masters_manage": False,
        "schedule_others": False,
        "broadcasts_view": False,
        "broadcasts_send": False,
        "inventory_view": True,
        "inventory_edit": False,
        "formulas_view": True,
        "formulas_edit": True,
        "settings_edit": False,
        "users_manage": False,
        "audit_view": False,
        "ai_manage": False,
        "integrations_manage": False,
        # Доступ к страницам: по умолчанию False — владелец включает через /users
        "page_bookings": False,
        "page_clients": False,
        "page_schedule": False,
        "page_statistics": False,
        "page_masters": False,
        "page_inventory": False,
        "page_formulas": False,
        "page_chats": False,
    },
}


def get_effective_permissions(user: "User") -> dict[str, bool]:
    """Итоговые права: дефолт роли + индивидуальные переопределения.
    owner всегда получает все права, невзирая на поле permissions."""
    if user.role.value == "owner":
        return {p: True for p in ALL_PERMISSIONS}

    defaults = ROLE_DEFAULTS.get(user.role.value, {p: False for p in ALL_PERMISSIONS})

    if not user.permissions:
        return defaults.copy()

    result = defaults.copy()
    for key, value in user.permissions.items():
        if key in ALL_PERMISSIONS:
            result[key] = bool(value)
    return result


def has_permission(user: "User", permission: str) -> bool:
    return get_effective_permissions(user).get(permission, False)
