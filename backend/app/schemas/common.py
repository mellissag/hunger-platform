"""Общие схемы: пагинация, i18n."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, field_validator

LANG_KEYS = frozenset({"en", "ru", "uk", "bg"})


class I18nTextMap(BaseModel):
    """Обязательные ключи для отображения в боте/админке."""

    model_config = ConfigDict(extra="forbid")

    en: str = ""
    ru: str = ""
    uk: str = ""
    bg: str = ""

    @field_validator("en", "ru", "uk", "bg", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> Any:
        if v is None:
            return ""
        if isinstance(v, str):
            return v
        return str(v)


def validate_i18n_dict(d: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k in LANG_KEYS:
        v = d.get(k, "")
        out[k] = str(v) if v is not None else ""
    extra = set(d.keys()) - LANG_KEYS
    if extra:
        raise ValueError(f"Unsupported i18n keys: {extra}")
    return out


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
