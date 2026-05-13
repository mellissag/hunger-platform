"""Pydantic: salon role_permissions (GET/PATCH)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReceptionPagesState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bookings: bool = True
    clients: bool = True
    schedule: bool = True
    analytics: bool = True


class ReceptionRoleState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pages: ReceptionPagesState = Field(default_factory=ReceptionPagesState)


class AdminRoleState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clients_access: bool = True


class RolePermissionsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    admin: AdminRoleState
    reception: ReceptionRoleState


class RolePermissionsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    admin: dict[str, Any] | None = None
    reception: dict[str, Any] | None = None
