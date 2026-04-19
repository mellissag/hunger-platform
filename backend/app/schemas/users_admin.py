"""Управление сотрудниками (owner)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UserStaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: UserRole
    first_name: str
    last_name: str | None
    lang: str
    is_active: bool
    master_id: UUID | None
    last_login_at: datetime | None
    created_at: datetime


class UserStaffCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: UserRole
    first_name: str = Field(..., min_length=1, max_length=200)
    last_name: str | None = Field(None, max_length=200)
    lang: str = Field("en", min_length=2, max_length=5)
    master_id: UUID | None = None


class UserStaffPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: UserRole | None = None
    first_name: str | None = Field(None, min_length=1, max_length=200)
    last_name: str | None = None
    lang: str | None = Field(None, min_length=2, max_length=5)
    is_active: bool | None = None
    master_id: UUID | None = None


class InviteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: UserRole
    first_name: str = Field(..., min_length=1, max_length=200)
    last_name: str | None = Field(None, max_length=200)


class InviteCreatedResponse(BaseModel):
    token: str
    invite_url: str
    expires_at: datetime
