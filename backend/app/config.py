"""Настройки приложения (Pydantic Settings)."""

from __future__ import annotations

from functools import lru_cache

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    app_domain: str = "localhost"
    jwt_secret: str
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    redis_url: str | None = None
    telegram_bot_token: str | None = None
    telegram_bot_username: str | None = Field(default=None, validation_alias="TELEGRAM_BOT_USERNAME")
    telegram_webhook_secret: str | None = None
    gemini_api_key: str | None = None
    upload_dir: str = "./data/uploads"
    salon_timezone: str = "Europe/Sofia"
    # Mini App: when initData is missing (plain browser), use this synthetic tg_user_id for all guests
    mini_app_browser_anonymous_tg_id: int = Field(
        default=-9000000000000000000,
        description="Stable synthetic Telegram id for guest mini-app users without Telegram context.",
    )
    # Allow ?tg_user_id=… on mini-app requests as an explicit test override (also enabled in dev/test by code)
    mini_app_allow_query_tg_fallback: bool = False

    # WhatsApp Business Cloud API (Meta)
    whatsapp_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_business_account_id: str | None = None
    whatsapp_verify_token: str | None = None
    # Optional approved template names for business-initiated messages (reminders / confirmations)
    whatsapp_reminder_template_name: str | None = None
    whatsapp_confirmation_template_name: str | None = None

    # Instagram Messaging API (Meta — Instagram API with Instagram Login)
    instagram_page_access_token: str | None = Field(
        default=None, validation_alias="INSTAGRAM_PAGE_ACCESS_TOKEN"
    )
    instagram_account_id: str | None = Field(default=None, validation_alias="INSTAGRAM_ACCOUNT_ID")
    instagram_app_id: str | None = Field(default=None, validation_alias="INSTAGRAM_APP_ID")
    instagram_app_secret: str | None = Field(default=None, validation_alias="INSTAGRAM_APP_SECRET")
    instagram_webhook_verify_token: str | None = Field(
        default=None, validation_alias="INSTAGRAM_WEBHOOK_VERIFY_TOKEN"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
