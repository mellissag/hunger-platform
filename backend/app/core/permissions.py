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
    "page_blacklist",
    "page_master_dashboard",
    "page_salon_dashboard",
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
        "page_blacklist": True,
        "page_master_dashboard": False,
        "page_salon_dashboard": True,
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
        "page_blacklist": True,
        "page_master_dashboard": False,
        "page_salon_dashboard": True,
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
        "page_blacklist": False,
        "page_master_dashboard": False,
        "page_salon_dashboard": False,
    },
}


def _tree_perm(m: dict, section: str, key: str) -> bool:
    """Чтение булева из дерева; при enabled=false вторичные ключи — false."""
    block = m.get(section)
    if not isinstance(block, dict):
        return False
    if key != "enabled" and not bool(block.get("enabled", False)):
        return False
    return bool(block.get(key, False))


def _flat_from_nested(m: dict) -> dict[str, bool]:
    """Плоский словарь для обратной совместимости API и старых вызовов has_permission."""
    mv_all = _tree_perm(m, "specialists", "enabled") and not _tree_perm(m, "specialists", "view_only")
    return {
        "clients_view": _tree_perm(m, "clients", "enabled"),
        "clients_own_only": _tree_perm(m, "clients", "enabled") and not _tree_perm(m, "clients", "view_all"),
        "clients_view_phones": _tree_perm(m, "clients", "view_phones"),
        "clients_notes": _tree_perm(m, "clients", "view_history"),
        "clients_edit": _tree_perm(m, "clients", "edit"),
        "clients_blacklist": _tree_perm(m, "blacklist", "add"),
        "clients_export": _tree_perm(m, "clients", "export"),
        "clients_telegram": _tree_perm(m, "chats", "reply"),
        "masters_view_all": mv_all,
        "masters_own_only": not mv_all,
        "bookings_view_all": _tree_perm(m, "bookings", "view_all"),
        "bookings_create": _tree_perm(m, "bookings", "create"),
        "bookings_edit_others": _tree_perm(m, "bookings", "edit") and _tree_perm(m, "bookings", "view_all"),
        "bookings_cancel_others": _tree_perm(m, "bookings", "cancel") and _tree_perm(m, "bookings", "view_all"),
        "bookings_status": _tree_perm(m, "bookings", "edit"),
        "finance_revenue": _tree_perm(m, "analytics", "view_financial"),
        "finance_salaries": _tree_perm(m, "analytics", "view_financial"),
        "finance_stats": _tree_perm(m, "analytics", "enabled"),
        "finance_export": _tree_perm(m, "analytics", "view_all"),
        "stats_salon": _tree_perm(m, "analytics", "enabled"),
        "stats_masters": _tree_perm(m, "analytics", "view_all"),
        "stats_services": _tree_perm(m, "analytics", "view_all"),
        "services_manage": _tree_perm(m, "services", "enabled") and _tree_perm(m, "services", "create_edit"),
        "masters_manage": _tree_perm(m, "specialists", "edit_profiles"),
        "schedule_others": _tree_perm(m, "schedule", "edit_others"),
        "broadcasts_view": _tree_perm(m, "broadcasts", "enabled"),
        "broadcasts_send": _tree_perm(m, "broadcasts", "send"),
        "inventory_view": _tree_perm(m, "inventory", "enabled"),
        "inventory_edit": _tree_perm(m, "inventory", "edit_stock") or _tree_perm(m, "inventory", "manage_items"),
        "formulas_view": _tree_perm(m, "formulas", "enabled"),
        "formulas_edit": _tree_perm(m, "formulas", "create") or _tree_perm(m, "formulas", "edit"),
        "settings_edit": _tree_perm(m, "settings", "edit"),
        "users_manage": _tree_perm(m, "staff", "create"),
        "audit_view": _tree_perm(m, "audit_log", "enabled"),
        "ai_manage": _tree_perm(m, "ai", "manage_settings"),
        "integrations_manage": _tree_perm(m, "settings", "edit"),
        "page_bookings": _tree_perm(m, "bookings", "enabled"),
        "page_clients": _tree_perm(m, "clients", "enabled"),
        "page_schedule": _tree_perm(m, "schedule", "enabled"),
        "page_statistics": _tree_perm(m, "analytics", "enabled"),
        "page_masters": _tree_perm(m, "specialists", "enabled"),
        "page_inventory": _tree_perm(m, "inventory", "enabled"),
        "page_formulas": _tree_perm(m, "formulas", "enabled"),
        "page_chats": _tree_perm(m, "chats", "enabled"),
        "page_blacklist": _tree_perm(m, "blacklist", "enabled"),
        "page_master_dashboard": _tree_perm(m, "master_dashboard", "enabled"),
        "page_salon_dashboard": _tree_perm(m, "salon_dashboard", "enabled"),
    }


def get_effective_permissions(user: "User") -> dict[str, bool]:
    """Плоские права, выведенные из JSON-дерева страниц (для совместимости)."""
    if user.role.value == "owner":
        return {p: True for p in ALL_PERMISSIONS}

    from app.core.user_page_permissions import merged_permissions

    return _flat_from_nested(merged_permissions(user))


def has_permission(user: "User", permission: str) -> bool:
    return get_effective_permissions(user).get(permission, False)
