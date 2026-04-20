"""Публичные схемы для эндпоинта настроек отображения."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.models.enums import ThemePreset


class ThemeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    theme: ThemePreset
