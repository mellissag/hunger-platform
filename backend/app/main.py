"""FastAPI entrypoint."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1 import api_router
from app.bot import build_bot, build_dispatcher
from app.config import get_settings
from app.core.exceptions import DomainError
from app.limiter import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.bot = None
    app.state.dp = None
    if settings.telegram_bot_token:
        app.state.bot = build_bot(settings.telegram_bot_token)
        app.state.dp = build_dispatcher(settings)
        if settings.redis_url and settings.app_env != "test":
            from redis.asyncio import Redis

            from app.bot.services_cache import subscribe_to_updates

            r = Redis.from_url(settings.redis_url, decode_responses=True)
            await subscribe_to_updates(r)
    yield
    bot = getattr(app.state, "bot", None)
    if bot is not None:
        await bot.session.close()


app = FastAPI(title="Hunger Beauty API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


@app.exception_handler(DomainError)
async def domain_error_handler(_request: object, exc: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code},
    )


app.include_router(api_router, prefix="/api/v1")

_media_root = Path(os.environ.get("UPLOAD_DIR", "./data/uploads"))
_media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_media_root)), name="media")


@app.get("/healthz", response_model=None)
async def healthz(request: Request):
    """Liveness; при настроенном боте проверяет, что webhook URL содержит secret."""
    settings = get_settings()
    bot = getattr(request.app.state, "bot", None)
    if (
        bot
        and settings.telegram_bot_token
        and settings.telegram_webhook_secret
    ):
        info = await bot.get_webhook_info()
        url = info.url or ""
        if settings.telegram_webhook_secret not in url:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "error", "telegram_webhook": "misconfigured"},
            )
    return {"status": "ok"}


@app.get("/api")
async def api_hello() -> dict[str, str]:
    return {"message": "hello"}
