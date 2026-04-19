"""Расписание API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import SlotType


class SlotsResponse(BaseModel):
    times: list[str] = Field(description="Время начала (HH:MM) в timezone салона")


class CalendarBookingOut(BaseModel):
    kind: str = "booking"
    id: UUID
    master_id: UUID
    client_id: UUID
    service_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: str
    price: Decimal


class CalendarSlotOut(BaseModel):
    kind: str = "schedule_slot"
    id: UUID
    master_id: UUID
    slot_type: str
    starts_at: datetime
    ends_at: datetime
    note: str | None


class CalendarResponse(BaseModel):
    bookings: list[CalendarBookingOut]
    slots: list[CalendarSlotOut]


class ScheduleBlockCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    master_id: UUID
    starts_at: datetime = Field(description="UTC")
    ends_at: datetime = Field(description="UTC")
    slot_type: SlotType = Field(default=SlotType.block)
    note: str | None = None

    @model_validator(mode="after")
    def _only_blockish(self) -> ScheduleBlockCreate:
        allowed = {SlotType.block, SlotType.vacation, SlotType.sick}
        if self.slot_type not in allowed:
            raise ValueError("slot_type must be block, vacation, or sick")
        return self


class ScheduleBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    master_id: UUID
    slot_type: str
    starts_at: datetime
    ends_at: datetime
    note: str | None
