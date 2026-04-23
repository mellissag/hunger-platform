"""AI-консультант: RAG + Gemini 1.5 Flash, стриминг, логирование диалогов."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
import google.generativeai as genai
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import AIUnavailableError
from app.models.ai_chat import AIConversation, AIMessage
from app.models.client import Client
from app.models.enums import AIMessageRole
from app.models.knowledge import KBChunk
from app.models.salon import Salon, Settings
from app.services.ai_rate_limit import check_ai_rate_limit

_DEFAULT_SYSTEM = (
    "You are a helpful salon assistant. Answer briefly in the client's language. "
    "Use ONLY the knowledge base excerpts below for facts about services and prices. "
    "If something is not in the knowledge base, say you are not sure. "
    "Do not invent booking times; for booking, direct the user to use the booking button in the bot menu."
)

# Явный запрет «записать через AI» при ai_allow_booking=false (проверяется в тестах).
NO_BOOKING_VIA_AI_INSTRUCTION = (
    "\nIMPORTANT: You must NOT book appointments or promise specific time slots. "
    "Tell the user to tap «Book» / «Записаться» in the bot menu for booking.\n"
)

_EMBED_MODEL = "models/text-embedding-004"


def _ensure_gemini() -> None:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise AIUnavailableError(
            "AI assistant is not configured (missing GEMINI_API_KEY). "
            "Add the key in server environment to enable this feature."
        )
    genai.configure(api_key=settings.gemini_api_key)


def _pick_system_prompt(settings_row: Settings, lang: str) -> str:
    raw = settings_row.ai_system_prompt or {}
    if isinstance(raw, dict):
        text = raw.get(lang) or raw.get("en") or raw.get("ru")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return _DEFAULT_SYSTEM


async def _embed_question(text: str) -> list[float]:
    _ensure_gemini()

    def _sync() -> list[float]:
        out = genai.embed_content(
            model=_EMBED_MODEL,
            content=text.strip(),
            output_dimensionality=768,
        )
        emb = out.get("embedding")
        if not isinstance(emb, list):
            raise RuntimeError("invalid embedding response")
        return emb

    return await asyncio.to_thread(_sync)


async def _retrieve_chunks(db: AsyncSession, embedding: list[float]) -> list[KBChunk]:
    stmt = select(KBChunk).order_by(KBChunk.embedding.cosine_distance(embedding)).limit(5)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def _get_or_create_conversation(
    db: AsyncSession, client_id: uuid.UUID, lang: str | None
) -> tuple[AIConversation, bool]:
    row = await db.execute(
        select(AIConversation)
        .where(AIConversation.client_id == client_id, AIConversation.ended_at.is_(None))
        .order_by(AIConversation.started_at.desc())
        .limit(1)
    )
    conv = row.scalar_one_or_none()
    if conv:
        return conv, False
    conv = AIConversation(client_id=client_id, lang=lang)
    db.add(conv)
    await db.flush()
    return conv, True


async def _load_history(db: AsyncSession, conversation_id: uuid.UUID, limit: int = 10) -> list[AIMessage]:
    res = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.desc())
        .limit(limit)
    )
    rows = list(res.scalars().all())
    rows.reverse()
    return rows


def _history_block(msgs: list[AIMessage]) -> str:
    lines: list[str] = []
    for m in msgs:
        role = "user" if m.role == AIMessageRole.user else "assistant"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


class AIService:
    def __init__(self, db: AsyncSession, redis: Redis | None) -> None:
        self.db = db
        self.redis = redis

    async def ask(
        self,
        client_id: uuid.UUID,
        question: str,
        *,
        on_stream_chunk: Callable[[str], Awaitable[None]] | None = None,
    ) -> tuple[str, list[uuid.UUID], uuid.UUID]:
        """RAG + Gemini, стриминг через on_stream_chunk. Возвращает ответ, id чанков KB и id ответа assistant."""
        q = question.strip()
        if not q:
            raise ValueError("empty question")

        _ensure_gemini()

        salon_row = await self.db.execute(select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id).limit(1))
        first = salon_row.first()
        if not first:
            raise AIUnavailableError("Salon is not configured.")
        salon, salon_settings = first
        if not salon_settings.ai_enabled:
            raise AIUnavailableError("AI assistant is disabled in salon settings.")

        client = await self.db.get(Client, client_id)
        if client is None:
            raise AIUnavailableError("Client not found.")

        lang = (client.lang or "en").split("-")[0].lower()
        if lang not in ("en", "ru", "uk", "bg"):
            lang = "en"

        await check_ai_rate_limit(self.db, self.redis, client_id)

        embedding = await _embed_question(q)
        chunks = await _retrieve_chunks(self.db, embedding)
        cited_ids = [c.id for c in chunks]

        kb_text = "\n\n".join(
            f"[chunk {c.id}]\n{c.content}" for c in chunks
        ) or "(no relevant knowledge base excerpts)"

        system = _pick_system_prompt(salon_settings, lang)
        system += f"\n\nSalon name: {salon.name}\nClient language: {lang}\n"
        system += f"\nKnowledge base excerpts:\n{kb_text}\n"
        if not salon_settings.ai_allow_booking:
            system += NO_BOOKING_VIA_AI_INSTRUCTION

        conv, conv_is_new = await _get_or_create_conversation(self.db, client_id, lang)
        if conv_is_new:
            from app.services.client_bot_activity import bump_client_funnel

            bump_client_funnel(client, "ai_sessions")
        hist = await _load_history(self.db, conv.id, limit=10)
        hist_block = _history_block(hist)

        user_prompt_parts: list[str] = []
        if hist_block:
            user_prompt_parts.append("Previous dialogue:\n" + hist_block)
        user_prompt_parts.append(f"Client question:\n{q}")

        user_prompt = "\n\n".join(user_prompt_parts)

        user_msg = AIMessage(
            conversation_id=conv.id,
            role=AIMessageRole.user,
            content=q,
        )
        self.db.add(user_msg)
        await self.db.flush()

        model_name = (salon_settings.ai_model or "gemini-1.5-flash").strip()
        if not model_name.startswith("models/"):
            model_name = f"models/{model_name}"

        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system,
        )

        full_answer_parts: list[str] = []

        async def _run_stream() -> None:
            resp = await model.generate_content_async(
                user_prompt,
                stream=True,
            )
            async for chunk in resp:
                t = getattr(chunk, "text", None) or ""
                if t:
                    full_answer_parts.append(t)
                    if on_stream_chunk:
                        await on_stream_chunk(t)

        await _run_stream()

        answer = "".join(full_answer_parts).strip() or "…"

        approx_in = len(system) + len(user_prompt)
        approx_out = len(answer)
        conv.token_in += max(1, approx_in // 4)
        conv.token_out += max(1, approx_out // 4)

        asst = AIMessage(
            conversation_id=conv.id,
            role=AIMessageRole.assistant,
            content=answer,
            cited_chunks=cited_ids or None,
        )
        self.db.add(asst)
        await self.db.flush()
        await self.db.refresh(asst)

        return answer, cited_ids, asst.id

    async def test_ask_admin(
        self,
        question: str,
        lang: str = "en",
    ) -> tuple[str, list[uuid.UUID]]:
        """Тест из админки без client — без rate limit и без записи в ai_message (optional)."""
        _ensure_gemini()

        salon_row = await self.db.execute(select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id).limit(1))
        first = salon_row.first()
        if not first:
            raise AIUnavailableError("Salon is not configured.")
        salon, salon_settings = first
        if not salon_settings.ai_enabled:
            raise AIUnavailableError("AI assistant is disabled.")

        q = question.strip()
        embedding = await _embed_question(q)
        chunks = await _retrieve_chunks(self.db, embedding)
        cited_ids = [c.id for c in chunks]
        kb_text = "\n\n".join(f"[chunk {c.id}]\n{c.content}" for c in chunks) or "(empty)"

        system = _pick_system_prompt(salon_settings, lang)
        system += f"\n\nSalon name: {salon.name}\n"
        system += f"\nKnowledge base excerpts:\n{kb_text}\n"
        if not salon_settings.ai_allow_booking:
            system += NO_BOOKING_VIA_AI_INSTRUCTION

        model_name = (salon_settings.ai_model or "gemini-1.5-flash").strip()
        if not model_name.startswith("models/"):
            model_name = f"models/{model_name}"

        model = genai.GenerativeModel(model_name=model_name, system_instruction=system)
        full: list[str] = []
        resp = await model.generate_content_async(f"Client question:\n{q}", stream=True)
        async for chunk in resp:
            t = getattr(chunk, "text", None) or ""
            if t:
                full.append(t)
        answer = "".join(full).strip() or "…"
        return answer, cited_ids


def gemini_configured() -> bool:
    return bool(get_settings().gemini_api_key)
