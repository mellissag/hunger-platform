"""CRUD kb_document и постановка задачи индексации в ARQ."""

from __future__ import annotations

import uuid

from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.enums import KBSourceType
from app.models.knowledge import KBDocument


async def enqueue_reindex(doc_id: uuid.UUID) -> None:
    settings = get_settings()
    if not settings.redis_url:
        logger.warning("REDIS_URL not set; kb reindex skipped for {}", doc_id)
        return
    from arq.connections import RedisSettings, create_pool

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        await pool.enqueue_job("index_kb_document", str(doc_id))
    finally:
        await pool.close(close_connection_pool=True)


async def list_documents(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
) -> tuple[list[KBDocument], int]:
    total = (await db.execute(select(func.count()).select_from(KBDocument))).scalar_one()
    offset = (page - 1) * page_size
    res = await db.execute(
        select(KBDocument).order_by(KBDocument.created_at.desc()).offset(offset).limit(page_size)
    )
    return list(res.scalars().all()), int(total)


async def get_document(db: AsyncSession, doc_id: uuid.UUID) -> KBDocument | None:
    return await db.get(KBDocument, doc_id)


async def create_document(
    db: AsyncSession,
    *,
    title: str,
    source_type: KBSourceType,
    source_ref: str | None,
    content: str | None,
    lang: str,
) -> KBDocument:
    doc = KBDocument(
        title=title,
        source_type=source_type,
        source_ref=source_ref,
        content=content,
        lang=lang,
    )
    db.add(doc)
    await db.flush()
    await enqueue_reindex(doc.id)
    return doc


async def update_document(db: AsyncSession, doc: KBDocument, updates: dict[str, object]) -> KBDocument:
    for k, v in updates.items():
        setattr(doc, k, v)
    await db.flush()
    await enqueue_reindex(doc.id)
    return doc


async def delete_document(db: AsyncSession, doc: KBDocument) -> None:
    await db.delete(doc)
