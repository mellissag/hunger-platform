"""AI-консультант: RAG + Gemini/Groq, стриминг, логирование диалогов."""

from __future__ import annotations

import asyncio
import base64
import json
import re
import uuid
from collections.abc import Awaitable, Callable

import httpx
from google import genai
from google.genai import types as genai_types
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

NO_BOOKING_VIA_AI_INSTRUCTION = (
    "\nIMPORTANT: You must NOT book appointments or promise specific time slots. "
    "Tell the user to tap «Book» / «Записаться» in the bot menu for booking.\n"
)

_EMBED_MODEL = "gemini-embedding-001"
_DEFAULT_GEN_MODEL = "gemini-2.5-flash-lite"
_DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def _get_integrations(salon_settings: Settings | None) -> dict:
    if salon_settings is None:
        return {}
    return salon_settings.integrations or {}


def _get_provider(salon_settings: Settings | None) -> str:
    return str(_get_integrations(salon_settings).get("ai_provider", "gemini") or "gemini")


def _get_gemini_key(salon_settings: Settings | None = None) -> str:
    """Return Gemini API key (used for embeddings and generation when provider=gemini)."""
    raw = _get_integrations(salon_settings).get("ai_api_key", "")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    env_key = get_settings().gemini_api_key
    if env_key:
        return env_key
    raise AIUnavailableError(
        "Gemini API key is not configured. "
        "Add it in Admin → AI → Settings."
    )


def _get_groq_key(salon_settings: Settings | None = None) -> str:
    """Return Groq API key."""
    raw = _get_integrations(salon_settings).get("groq_api_key", "")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    raise AIUnavailableError(
        "Groq API key is not configured. "
        "Add your Groq key in Admin → AI → Settings."
    )


def _get_api_key(salon_settings: Settings | None = None) -> str:
    """Return key for generation — provider-aware."""
    provider = _get_provider(salon_settings)
    if provider == "groq":
        return _get_groq_key(salon_settings)
    return _get_gemini_key(salon_settings)


def _make_client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


_LANGS = ("en", "ru", "uk", "bg")


def _strip_json_fence(raw: str) -> str:
    t = raw.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _parse_translation_json(raw: str) -> dict[str, str]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("translation response is not a JSON object")
    out: dict[str, str] = {}
    for k in _LANGS:
        v = data.get(k)
        out[k] = str(v).strip() if v is not None else ""
    return out


async def _gemini_generate_plain(
    *,
    client: genai.Client,
    model_name: str,
    system: str,
    user_prompt: str,
    temperature: float,
) -> str:
    def _sync() -> str:
        response = client.models.generate_content(
            model=model_name,
            contents=user_prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
            ),
        )
        return response.text or ""

    return await asyncio.to_thread(_sync)


async def _call_groq(
    *,
    api_key: str,
    system: str,
    user_prompt: str,
    model: str = _DEFAULT_GROQ_MODEL,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """Call Groq's OpenAI-compatible API via httpx."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(_GROQ_API_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"] or ""


def _pick_system_prompt(settings_row: Settings, lang: str) -> str:
    raw = settings_row.ai_system_prompt or {}
    if isinstance(raw, dict):
        text = raw.get(lang) or raw.get("en") or raw.get("ru")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return _DEFAULT_SYSTEM


async def _embed_question(text: str, client: genai.Client) -> list[float]:
    def _sync() -> list[float]:
        result = client.models.embed_content(
            model=_EMBED_MODEL,
            contents=text.strip(),
            config=genai_types.EmbedContentConfig(output_dimensionality=768),
        )
        emb = result.embeddings[0].values
        if not emb:
            raise RuntimeError("empty embedding response")
        return list(emb)

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
        image_base64: str | None = None,
        image_mime_type: str = "image/jpeg",
        on_stream_chunk: Callable[[str], Awaitable[None]] | None = None,
    ) -> tuple[str, list[uuid.UUID], uuid.UUID]:
        """RAG + Gemini, стриминг через on_stream_chunk. Возвращает ответ, id чанков KB и id ответа assistant."""
        q = question.strip()
        if not q:
            raise ValueError("empty question")

        salon_row = await self.db.execute(
            select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id).limit(1)
        )
        first = salon_row.first()
        if not first:
            raise AIUnavailableError("Salon is not configured.")
        salon, salon_settings = first
        if not salon_settings.ai_enabled:
            raise AIUnavailableError("AI assistant is disabled in salon settings.")

        provider = _get_provider(salon_settings)
        gemini_key = _get_gemini_key(salon_settings)
        gemini_client = _make_client(gemini_key)

        client = await self.db.get(Client, client_id)
        if client is None:
            raise AIUnavailableError("Client not found.")

        lang = (client.lang or "en").split("-")[0].lower()
        if lang not in ("en", "ru", "uk", "bg"):
            lang = "en"

        await check_ai_rate_limit(self.db, self.redis, client_id)

        embedding = await _embed_question(q, gemini_client)
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

        raw_model = (salon_settings.ai_model or "").strip()
        temperature = float(salon_settings.ai_temperature or 0.7)

        full_answer_parts: list[str] = []

        if provider == "groq":
            groq_key = _get_groq_key(salon_settings)
            # ai_model may contain a Gemini name — ignore it for Groq
            groq_model = (
                raw_model
                if raw_model and "gemini" not in raw_model.lower() and "models/" not in raw_model
                else _DEFAULT_GROQ_MODEL
            )
            text = await _call_groq(
                api_key=groq_key,
                system=system,
                user_prompt=user_prompt,
                model=groq_model,
                temperature=temperature,
            )
            full_answer_parts.append(text)
            if on_stream_chunk and text:
                await on_stream_chunk(text)
        else:
            # Gemini (default)
            model_name = (raw_model or _DEFAULT_GEN_MODEL).removeprefix("models/")

            async def _run_stream() -> None:
                def _sync_stream() -> str:
                    parts: list[genai_types.Part] = []
                    if image_base64:
                        try:
                            img_bytes = base64.b64decode(image_base64)
                            parts.append(
                                genai_types.Part.from_bytes(
                                    data=img_bytes,
                                    mime_type=image_mime_type,
                                )
                            )
                        except Exception:  # noqa: BLE001
                            pass
                    parts.append(genai_types.Part.from_text(text=user_prompt))

                    response = gemini_client.models.generate_content(
                        model=model_name,
                        contents=parts,
                        config=genai_types.GenerateContentConfig(
                            system_instruction=system,
                            temperature=temperature,
                        ),
                    )
                    return response.text or ""

                text = await asyncio.to_thread(_sync_stream)
                full_answer_parts.append(text)
                if on_stream_chunk and text:
                    await on_stream_chunk(text)

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

    async def translate_admin(
        self,
        *,
        text: str,
        source_lang: str = "en",
        target_langs: list[str] | None = None,
    ) -> dict[str, str]:
        """Админ: перевод i18n тем же провайдером/ключом, что и AI-чат (без RAG, без rate limit)."""
        raw = text.strip()
        if not raw:
            raise ValueError("empty text")
        sl = source_lang.lower()
        if sl not in _LANGS:
            raise ValueError("invalid source_lang")

        salon_row = await self.db.execute(
            select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id).limit(1)
        )
        first = salon_row.first()
        if not first:
            raise AIUnavailableError("Salon is not configured.")
        _salon, salon_settings = first
        if not salon_settings.ai_enabled:
            raise AIUnavailableError("AI assistant is disabled in salon settings.")

        provider = _get_provider(salon_settings)
        raw_model = (salon_settings.ai_model or "").strip()
        temperature = min(0.9, max(0.1, float(salon_settings.ai_temperature or 0.35)))

        system = (
            'You are a professional translator for a beauty salon admin UI. '
            'Return ONLY a raw JSON object with exactly these keys: "en", "ru", "uk", "bg". '
            "Each value is a string: natural translation or adaptation of the source for that language. "
            "No markdown code fences, no explanations, no extra keys."
        )
        user_prompt = f'The source text is in language code "{sl}".\n\nSOURCE:\n{raw}\n'

        if provider == "groq":
            groq_key = _get_groq_key(salon_settings)
            groq_model = (
                raw_model
                if raw_model and "gemini" not in raw_model.lower() and "models/" not in raw_model
                else _DEFAULT_GROQ_MODEL
            )
            raw_out = await _call_groq(
                api_key=groq_key,
                system=system,
                user_prompt=user_prompt,
                model=groq_model,
                temperature=temperature,
                max_tokens=8192,
            )
        else:
            gemini_key = _get_gemini_key(salon_settings)
            gemini_client = _make_client(gemini_key)
            model_name = (raw_model or _DEFAULT_GEN_MODEL).removeprefix("models/")
            raw_out = await _gemini_generate_plain(
                client=gemini_client,
                model_name=model_name,
                system=system,
                user_prompt=user_prompt,
                temperature=temperature,
            )

        try:
            parsed = _parse_translation_json(raw_out)
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            raise AIUnavailableError(
                "Could not parse AI translation. Try again or shorten the text."
            ) from e
        if target_langs:
            allowed = {str(x).lower() for x in target_langs if str(x).lower() in _LANGS}
            if allowed:
                return {k: parsed.get(k, "") for k in _LANGS if k in allowed}
        return parsed

    async def test_ask_admin(
        self,
        question: str,
        lang: str = "en",
    ) -> tuple[str, list[uuid.UUID]]:
        """Тест из админки без client — без rate limit и без записи в ai_message."""
        salon_row = await self.db.execute(
            select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id).limit(1)
        )
        first = salon_row.first()
        if not first:
            raise AIUnavailableError("Salon is not configured.")
        salon, salon_settings = first
        if not salon_settings.ai_enabled:
            raise AIUnavailableError("AI assistant is disabled.")

        provider = _get_provider(salon_settings)
        gemini_key = _get_gemini_key(salon_settings)
        gemini_client = _make_client(gemini_key)

        q = question.strip()
        embedding = await _embed_question(q, gemini_client)
        chunks = await _retrieve_chunks(self.db, embedding)
        cited_ids = [c.id for c in chunks]
        kb_text = "\n\n".join(f"[chunk {c.id}]\n{c.content}" for c in chunks) or "(empty)"

        system = _pick_system_prompt(salon_settings, lang)
        system += f"\n\nSalon name: {salon.name}\n"
        system += f"\nKnowledge base excerpts:\n{kb_text}\n"
        if not salon_settings.ai_allow_booking:
            system += NO_BOOKING_VIA_AI_INSTRUCTION

        raw_model = (salon_settings.ai_model or "").strip()
        temperature = float(salon_settings.ai_temperature or 0.7)
        user_prompt = f"Client question:\n{q}"

        if provider == "groq":
            groq_key = _get_groq_key(salon_settings)
            groq_model = (
                raw_model
                if raw_model and "gemini" not in raw_model.lower() and "models/" not in raw_model
                else _DEFAULT_GROQ_MODEL
            )
            answer = await _call_groq(
                api_key=groq_key,
                system=system,
                user_prompt=user_prompt,
                model=groq_model,
                temperature=temperature,
            )
        else:
            model_name = (raw_model or _DEFAULT_GEN_MODEL).removeprefix("models/")

            def _sync() -> str:
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=user_prompt,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=system,
                        temperature=temperature,
                    ),
                )
                return response.text or "…"

            answer = await asyncio.to_thread(_sync)

        return answer.strip() or "…", cited_ids


def gemini_configured() -> bool:
    """Check if a Gemini API key is available (env or DB — rough check via env only)."""
    return bool(get_settings().gemini_api_key)
