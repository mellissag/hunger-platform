"""Инициализация первого запуска: салон, настройки, 4 аккаунта.

Запуск: docker compose exec api python -m scripts.seed_init

Пароль: переменная окружения SEED_PASSWORD (минимум 8 символов).
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid

from passlib.context import CryptContext
from sqlalchemy import select

from app.db.base import get_async_session_factory
from app.models.enums import LateCancellationPolicy, ThemePreset, UserRole
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.models.user import User

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def run() -> None:
    seed_password = os.environ.get("SEED_PASSWORD")
    if not seed_password:
        print("❌  Ошибка: переменная SEED_PASSWORD не задана в .env")
        sys.exit(1)
    if len(seed_password) < 8:
        print("❌  Ошибка: SEED_PASSWORD должен быть не короче 8 символов")
        sys.exit(1)

    async with get_async_session_factory()() as session:
        existing = await session.execute(select(Salon.id).limit(1))
        if existing.scalar_one_or_none() is not None:
            print("⚠️  База уже инициализирована. Пропуск.")
            return

        salon = Salon(
            name="Synchro",
            description={"ru": "Салон красоты Synchro"},
            timezone="Europe/Sofia",
            currency="EUR",
            default_lang="ru",
        )
        session.add(salon)
        await session.flush()

        settings = Settings(
            salon_id=salon.id,
            theme=ThemePreset.premium,
            primary_color="#9A7230",
            prepayment_enabled=False,
            cancellation_free_hours=24,
            late_cancellation_policy=LateCancellationPolicy.no_cancel,
            reminder_intervals=[24.0, 2.0, 0.5],
            review_delay_hours=2,
            ai_enabled=True,
            ai_allow_booking=False,
        )
        session.add(settings)

        master_profile = Master(
            display_name="Master",
            bio={"ru": ""},
            specialization={"ru": ""},
        )
        session.add(master_profile)
        await session.flush()

        password_hash = pwd_ctx.hash(seed_password)

        accounts: list[tuple[str, str, str, UserRole, uuid.UUID | None]] = [
            ("owner@adm-test.tech", "Owner", "Synchro", UserRole.owner, None),
            ("admin@adm-test.tech", "Admin", "Synchro", UserRole.admin, None),
            (
                "master@adm-test.tech",
                "Master",
                "Synchro",
                UserRole.master,
                master_profile.id,
            ),
            ("reception@adm-test.tech", "Reception", "Synchro", UserRole.reception, None),
        ]

        for email, first_name, last_name, role, master_id in accounts:
            session.add(
                User(
                    email=email,
                    password_hash=password_hash,
                    first_name=first_name,
                    last_name=last_name,
                    role=role,
                    master_id=master_id,
                    lang="ru",
                    is_active=True,
                )
            )
            print(f"   ✅  {role.value:12s}  {email}")

        await session.commit()

    print("\n✅  Инициализация завершена!")
    print("\n   Салон:  Synchro")
    print("   Вход в админку: задайте APP_DOMAIN в .env")
    print("   Owner:  owner@adm-test.tech")
    print("   Пароль: из SEED_PASSWORD в .env")
    print("\n   ⚠️  Смените пароли после первого входа.\n")


if __name__ == "__main__":
    asyncio.run(run())
