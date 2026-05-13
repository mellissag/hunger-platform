"""Иерархические права пользователя (JSONB), дефолты по роли, merge и кеш Redis."""

from __future__ import annotations

import copy
import json
import logging
from typing import Any
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import text

from app.models.enums import UserRole
from app.models.user import User

logger = logging.getLogger(__name__)

PERMISSIONS_REDIS_KEY = "permissions:{user_id}"
PERMISSIONS_CACHE_TTL_SEC = 60

# Старые плоские ключи (до JSON-дерева страниц) — при обнаружении игнорируем и берём дефолт роли.
_LEGACY_FLAT_KEYS: frozenset[str] = frozenset(
    {
        "clients_view",
        "clients_own_only",
        "clients_view_phones",
        "clients_notes",
        "clients_edit",
        "clients_blacklist",
        "clients_export",
        "clients_telegram",
        "masters_view_all",
        "masters_own_only",
        "bookings_view_all",
        "bookings_create",
        "bookings_edit_others",
        "bookings_cancel_others",
        "bookings_status",
        "finance_revenue",
        "finance_salaries",
        "finance_stats",
        "finance_export",
        "stats_salon",
        "stats_masters",
        "stats_services",
        "services_manage",
        "masters_manage",
        "schedule_others",
        "broadcasts_view",
        "broadcasts_send",
        "inventory_view",
        "inventory_edit",
        "formulas_view",
        "formulas_edit",
        "settings_edit",
        "users_manage",
        "audit_view",
        "ai_manage",
        "integrations_manage",
        "page_bookings",
        "page_clients",
        "page_schedule",
        "page_statistics",
        "page_masters",
        "page_inventory",
        "page_formulas",
        "page_chats",
    }
)


def _admin_template() -> dict[str, Any]:
    return {
        "my_day": {"enabled": False},
        "bookings": {
            "enabled": True,
            "view_all": True,
            "create": True,
            "edit": True,
            "cancel": True,
            "view_client_contacts": True,
            "view_calendar_booking_phones": True,
        },
        "clients": {
            "enabled": True,
            "view_all": True,
            "view_phones": True,
            "export": True,
            "create": True,
            "edit": True,
            "delete": False,
            "view_history": True,
        },
        "chats": {"enabled": True, "view_all": True, "reply": True, "view_history": True},
        "schedule": {"enabled": True, "view_all": True, "edit_own": True, "edit_others": True},
        "formulas": {
            "enabled": True,
            "view_all": True,
            "create": True,
            "edit": True,
            "delete": True,
        },
        "analytics": {"enabled": True, "view_all": True, "view_financial": True},
        "broadcasts": {"enabled": True, "create": True, "send": True, "view_stats": True},
        "services": {"enabled": True, "view_only": False, "create_edit": True, "delete": True},
        "inventory": {"enabled": True, "view_only": False, "edit_stock": True, "manage_items": True},
        "ai": {"enabled": True, "use_chat": True, "manage_settings": True},
        "blacklist": {"enabled": True, "view_only": False, "add": True, "remove": True},
        "specialists": {"enabled": True, "view_only": False, "edit_profiles": True},
        "staff": {"enabled": False, "view_list": False, "create": False, "manage_permissions": False},
        "settings": {"enabled": True, "view_only": False, "edit": True},
        "audit_log": {"enabled": True},
    }


def _master_template() -> dict[str, Any]:
    return {
        "my_day": {"enabled": True},
        "bookings": {
            "enabled": True,
            "view_all": False,
            "create": True,
            "edit": True,
            "cancel": True,
            "view_client_contacts": True,
            "view_calendar_booking_phones": False,
        },
        "clients": {
            "enabled": True,
            "view_all": False,
            "view_phones": False,
            "export": False,
            "create": False,
            "edit": False,
            "delete": False,
            "view_history": True,
        },
        "chats": {"enabled": True, "view_all": False, "reply": True, "view_history": True},
        "schedule": {"enabled": True, "view_all": False, "edit_own": True, "edit_others": False},
        "formulas": {
            "enabled": True,
            "view_all": False,
            "create": True,
            "edit": True,
            "delete": False,
        },
        "analytics": {"enabled": True, "view_all": False, "view_financial": False},
        "broadcasts": {"enabled": False, "create": False, "send": False, "view_stats": False},
        "services": {"enabled": False, "view_only": True, "create_edit": False, "delete": False},
        "inventory": {"enabled": False, "view_only": False, "edit_stock": False, "manage_items": False},
        "ai": {"enabled": False, "use_chat": False, "manage_settings": False},
        "blacklist": {"enabled": False, "view_only": False, "add": False, "remove": False},
        "specialists": {"enabled": False, "view_only": False, "edit_profiles": False},
        "staff": {"enabled": False, "view_list": False, "create": False, "manage_permissions": False},
        "settings": {"enabled": False, "view_only": False, "edit": False},
        "audit_log": {"enabled": False},
    }


def _reception_template() -> dict[str, Any]:
    return {
        "my_day": {"enabled": False},
        "bookings": {
            "enabled": True,
            "view_all": True,
            "create": True,
            "edit": True,
            "cancel": True,
            "view_client_contacts": True,
            "view_calendar_booking_phones": True,
        },
        "clients": {
            "enabled": True,
            "view_all": True,
            "view_phones": True,
            "export": False,
            "create": True,
            "edit": True,
            "delete": False,
            "view_history": True,
        },
        "chats": {"enabled": True, "view_all": True, "reply": True, "view_history": True},
        "schedule": {"enabled": True, "view_all": True, "edit_own": True, "edit_others": False},
        "formulas": {
            "enabled": True,
            "view_all": True,
            "create": False,
            "edit": False,
            "delete": False,
        },
        "analytics": {"enabled": False, "view_all": False, "view_financial": False},
        "broadcasts": {"enabled": False, "create": False, "send": False, "view_stats": False},
        "services": {"enabled": False, "view_only": True, "create_edit": False, "delete": False},
        "inventory": {"enabled": False, "view_only": False, "edit_stock": False, "manage_items": False},
        "ai": {"enabled": False, "use_chat": False, "manage_settings": False},
        "blacklist": {"enabled": True, "view_only": False, "add": True, "remove": True},
        "specialists": {"enabled": False, "view_only": False, "edit_profiles": False},
        "staff": {"enabled": False, "view_list": False, "create": False, "manage_permissions": False},
        "settings": {"enabled": False, "view_only": False, "edit": False},
        "audit_log": {"enabled": False},
    }


def _all_bools_true(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: _all_bools_true(v) for k, v in node.items()}
    if isinstance(node, bool):
        return True
    return node


def owner_permissions_tree() -> dict[str, Any]:
    """Полное дерево прав для owner (игнорируется при проверках, но полезно для UI)."""
    return _all_bools_true(copy.deepcopy(_admin_template()))


def default_permissions_for_role(role_value: str) -> dict[str, Any]:
    if role_value == UserRole.owner.value:
        return owner_permissions_tree()
    if role_value == UserRole.admin.value:
        return copy.deepcopy(_admin_template())
    if role_value == UserRole.reception.value:
        return copy.deepcopy(_reception_template())
    if role_value == UserRole.master.value:
        return copy.deepcopy(_master_template())
    return copy.deepcopy(_master_template())


def is_legacy_flat_permissions(stored: dict[str, Any]) -> bool:
    return any(k in _LEGACY_FLAT_KEYS for k in stored.keys())


def deep_merge_permissions(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge_permissions(out[k], v)
        else:
            out[k] = copy.deepcopy(v) if isinstance(v, dict) else v
    return out


def merged_permissions(user: User) -> dict[str, Any]:
    """Итоговое дерево прав (синхронно, из строки пользователя). Owner — всегда полный доступ."""
    if user.role == UserRole.owner:
        return owner_permissions_tree()
    base = default_permissions_for_role(user.role.value)
    stored = user.permissions
    if not stored or not isinstance(stored, dict):
        return copy.deepcopy(base)
    if is_legacy_flat_permissions(stored):
        return copy.deepcopy(base)
    return deep_merge_permissions(base, stored)


def page_perm(user: User, section: str, key: str) -> bool:
    """Проверка ключа в секции; если основной enabled=false, вторичные считаются false."""
    if user.role == UserRole.owner:
        return True
    tree = merged_permissions(user)
    block = tree.get(section)
    if not isinstance(block, dict):
        return False
    if key != "enabled" and not bool(block.get("enabled", False)):
        return False
    return bool(block.get(key, False))


def redis_permissions_key(user_id: UUID) -> str:
    return PERMISSIONS_REDIS_KEY.format(user_id=str(user_id))


async def invalidate_user_permissions_cache(redis: Redis | None, user_id: UUID) -> None:
    if redis is None:
        return
    try:
        await redis.delete(redis_permissions_key(user_id))
    except Exception:  # noqa: BLE001
        logger.debug("permissions cache invalidate failed", exc_info=True)


async def get_merged_permissions_cached(user: User, redis: Redis | None) -> dict[str, Any]:
    """Чтение объединённых прав с кешем Redis (для /auth/me/permissions)."""
    if user.role == UserRole.owner:
        return owner_permissions_tree()
    key = redis_permissions_key(user.id)
    if redis is not None:
        try:
            raw = await redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception:  # noqa: BLE001
            logger.debug("permissions cache read failed", exc_info=True)
    merged = merged_permissions(user)
    if redis is not None:
        try:
            await redis.setex(key, PERMISSIONS_CACHE_TTL_SEC, json.dumps(merged))
        except Exception:  # noqa: BLE001
            logger.debug("permissions cache write failed", exc_info=True)
    return merged


def sanitize_permissions_payload(body: dict[str, Any], *, role: UserRole) -> dict[str, Any]:
    """PATCH: полный объект от клиента поверх дефолтов роли (безопасное слияние)."""
    if role == UserRole.owner:
        return owner_permissions_tree()
    base = default_permissions_for_role(role.value)
    if not body or not isinstance(body, dict):
        return copy.deepcopy(base)
    return deep_merge_permissions(base, body)


def backfill_null_permissions_sync(connection: Any) -> None:
    """Синхронный upgrade() в Alembic (op.get_bind().connection)."""
    result = connection.execute(text('SELECT id, role::text AS role, permissions FROM "user"'))
    for row in result.mappings():
        uid = row["id"]
        role_val = row["role"]
        perm = row["permissions"]
        need = perm is None or (isinstance(perm, dict) and is_legacy_flat_permissions(perm))
        if not need:
            continue
        fresh = default_permissions_for_role(role_val)
        connection.execute(
            text('UPDATE "user" SET permissions = CAST(:js AS jsonb) WHERE id = :id'),
            {"js": json.dumps(fresh), "id": uid},
        )
