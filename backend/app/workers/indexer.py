"""Индексация KB: чанки + эмбеддинги в kb_chunk."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

import google.generativeai as genai
from loguru import logger
from sqlalchemy import delete

from app.config import get_settings
from app.models.knowledge import KBChunk, KBDocument

# ~500 токенов × ~4 символа; overlap ~50 токенов
_CHUNK_CHARS = 2000
_OVERLAP_CHARS = 200
_EMBED_MODEL = "models/text-embedding-004"
_EMBED_DIM = 768


def _split_chunks(text: str) -> list[str]:
    t = text.strip()
    if not t:
        return []
    out: list[str] = []
    start = 0
    n = len(t)
    while start < n:
        end = min(start + _CHUNK_CHARS, n)
        piece = t[start:end].strip()
        if piece:
            out.append(piece)
        if end >= n:
            break
        start = max(0, end - _OVERLAP_CHARS)
    return out


def _embed_sync(text: str) -> list[float]:
    result = genai.embed_content(
        model=_EMBED_MODEL,
        content=text,
        output_dimensionality=_EMBED_DIM,
    )
    emb = result.get("embedding")
    if not isinstance(emb, list):
        raise RuntimeError("unexpected embedding response")
    return emb


async def index_kb_document(ctx: dict[str, Any], doc_id: str) -> None:
    """Пересобрать чанки и эмбеддинги для kb_document."""
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.error("index_kb_document: GEMINI_API_KEY missing")
        return

    genai.configure(api_key=settings.gemini_api_key)
    factory = ctx["db"]
    did = UUID(doc_id)

    async with factory() as session:
        doc = await session.get(KBDocument, did)
        if doc is None:
            logger.warning("index_kb_document: document {} not found", did)
            return
        content = (doc.content or "").strip()
        if not content:
            logger.warning("index_kb_document: empty content for {}", did)
            await session.execute(delete(KBChunk).where(KBChunk.document_id == did))
            await session.commit()
            return

        await session.execute(delete(KBChunk).where(KBChunk.document_id == did))
        await session.commit()

    chunks = _split_chunks(content)
    for pos, chunk_text in enumerate(chunks):
        embedding = await asyncio.to_thread(_embed_sync, chunk_text)
        token_guess = max(1, len(chunk_text) // 4)
        async with factory() as session:
            session.add(
                KBChunk(
                    document_id=did,
                    content=chunk_text,
                    embedding=embedding,
                    token_count=token_guess,
                    position=pos,
                )
            )
            await session.commit()
