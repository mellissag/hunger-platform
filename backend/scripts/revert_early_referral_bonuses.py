"""Откат ошибочных referral_bonus у клиентов без завершённых визитов.

Начисления при регистрации (при trigger=on_first_visit) попали на счёт до первого визита.
Скрипт находит клиентов с total_visits=0 и referral_bonus, списывает баллы и удаляет транзакции.

Запуск (dry-run):
  docker compose -f deploy/docker-compose.yml exec api python -m scripts.revert_early_referral_bonuses

Применить:
  docker compose -f deploy/docker-compose.yml exec api python -m scripts.revert_early_referral_bonuses --apply
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.db.base import get_async_session_factory
from app.models.client import Client
from app.models.enums import LoyaltyTransactionType
from app.models.loyalty import LoyaltyTransaction


async def run(*, apply: bool) -> int:
    factory = get_async_session_factory()
    reverted = 0
    async with factory() as session:
        clients = (
            await session.execute(
                select(Client).where(Client.total_visits == 0)
            )
        ).scalars().all()

        for client in clients:
            txs = (
                await session.execute(
                    select(LoyaltyTransaction).where(
                        LoyaltyTransaction.client_id == client.id,
                        LoyaltyTransaction.type == LoyaltyTransactionType.referral_bonus,
                    )
                )
            ).scalars().all()
            if not txs:
                continue

            points_before = int(client.loyalty_points or 0)
            delta = sum(int(tx.points) for tx in txs)
            points_after = points_before - delta

            print(
                f"client={client.id} visits=0 txs={len(txs)} "
                f"points {points_before} -> {points_after} (-{delta})"
            )
            for tx in txs:
                print(f"  - tx {tx.id} +{tx.points} {tx.description!r}")

            reverted += len(txs)
            if apply:
                client.loyalty_points = points_after
                for tx in txs:
                    await session.delete(tx)

        if apply and reverted:
            await session.commit()
            print(f"Applied: removed {reverted} referral_bonus transaction(s).")
        elif reverted:
            print(f"Dry-run: would remove {reverted} transaction(s). Pass --apply to commit.")
        else:
            print("Nothing to revert.")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes (default is dry-run)",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(apply=args.apply)))


if __name__ == "__main__":
    main()
