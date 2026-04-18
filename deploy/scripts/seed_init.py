"""
seed_init.py — Инициализация первого запуска Hunger Beauty Platform.

Создаёт:
  - Запись салона (Synchro)
  - 4 аккаунта: owner, admin, master, reception
  - Базовые настройки салона

НЕ создаёт клиентов, услуг и бронирований — только аккаунты.

Запуск:
  docker compose exec api python -m scripts.seed_init

Пароль читается из переменной окружения SEED_PASSWORD.
"""

import asyncio
import os
import sys

from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ── Конфигурация ──────────────────────────────────────────────

DATABASE_URL = os.environ["DATABASE_URL"]
SEED_PASSWORD = os.environ.get("SEED_PASSWORD")

if not SEED_PASSWORD:
    print("❌  Ошибка: переменная SEED_PASSWORD не задана в .env")
    sys.exit(1)

if len(SEED_PASSWORD) < 8:
    print("❌  Ошибка: пароль должен быть минимум 8 символов")
    sys.exit(1)

# ── Данные салона ─────────────────────────────────────────────

SALON = {
    "name": "Synchro",
    "description": "Салон красоты Synchro",
    "timezone": "Europe/Sofia",
    "currency": "EUR",
    "default_lang": "ru",
}

ACCOUNTS = [
    {
        "email": "owner@adm-test.tech",
        "first_name": "Owner",
        "last_name": "Synchro",
        "role": "owner",
    },
    {
        "email": "admin@adm-test.tech",
        "first_name": "Admin",
        "last_name": "Synchro",
        "role": "admin",
    },
    {
        "email": "master@adm-test.tech",
        "first_name": "Master",
        "last_name": "Synchro",
        "role": "master",
    },
    {
        "email": "reception@adm-test.tech",
        "first_name": "Reception",
        "last_name": "Synchro",
        "role": "reception",
    },
]

# ── Seed ──────────────────────────────────────────────────────

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def run():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        from app.models.salon import Salon, Settings
        from app.models.user import User

        # Проверить — уже есть данные?
        from sqlalchemy import select
        existing = await session.execute(select(Salon).limit(1))
        if existing.scalar_one_or_none():
            print("⚠️  База уже инициализирована. Пропуск.")
            return

        # 1. Создать салон
        salon = Salon(**SALON)
        session.add(salon)
        await session.flush()  # получить salon.id

        # 2. Настройки по умолчанию
        settings = Settings(
            salon_id=salon.id,
            theme="premium",
            prepayment_enabled=False,
            cancellation_free_hours=24,
            late_cancellation_policy="no_cancel",
            reminder_intervals=[24, 2, 0.5],
            review_delay_hours=2,
            ai_enabled=True,
        )
        session.add(settings)

        # 3. Создать аккаунты
        password_hash = pwd_ctx.hash(SEED_PASSWORD)
        for acc in ACCOUNTS:
            user = User(
                email=acc["email"],
                password_hash=password_hash,
                first_name=acc["first_name"],
                last_name=acc["last_name"],
                role=acc["role"],
                lang="ru",
                is_active=True,
            )
            session.add(user)
            print(f"   ✅  {acc['role']:12s}  {acc['email']}")

        await session.commit()
        print("\n✅  Инициализация завершена!")
        print(f"\n   Салон:  {SALON['name']}")
        print(f"   Вход:   https://test-adm.tech/login")
        print(f"   Owner:  owner@adm-test.tech")
        print(f"   Пароль: (из SEED_PASSWORD в .env)")
        print("\n   ⚠️  Смени пароли после первого входа: Настройки → Сотрудники\n")


if __name__ == "__main__":
    asyncio.run(run())
