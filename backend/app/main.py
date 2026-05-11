"""FastAPI entrypoint."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.v1 import api_router
from app.bot import build_bot, build_dispatcher
from app.config import get_settings
from app.core.exceptions import DomainError
from app.limiter import limiter

_logger = logging.getLogger(__name__)


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

        # Set persistent WebApp menu button (bottom-left of Telegram input field)
        try:
            from aiogram.types import MenuButtonWebApp, WebAppInfo

            mini_app_url = f"https://{settings.app_domain}/mini-app"
            await app.state.bot.set_my_commands([])  # clear old slash commands
            await app.state.bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="Открыть салон",
                    web_app=WebAppInfo(url=mini_app_url),
                )
            )
        except Exception:  # noqa: BLE001
            pass  # non-critical: bot may lack permissions or API unavailable
    yield
    bot = getattr(app.state, "bot", None)
    if bot is not None:
        await bot.session.close()


app = FastAPI(title="Hunger Beauty API", version="1.0.0", lifespan=lifespan)

# Trust X-Forwarded-* from reverse proxy so request.base_url matches the public host (correct /media URLs).
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# CORS: restrict to app_domain in production; allow all in development/test.
_settings = get_settings()
_allowed_origins = (
    ["*"]
    if _settings.app_env in ("development", "test")
    else [
        f"https://{_settings.app_domain}",
        f"https://www.{_settings.app_domain}",
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-Test-Rate-Bucket"],
)


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


def _log_media_root_state() -> None:
    """Log the resolved upload directory and a quick file count so that
    deploys missing the bind-mount (or with an empty bind-mount) are
    immediately visible in the api startup logs instead of silently
    serving 404 for every /media/* request.
    """
    try:
        resolved = _media_root.resolve()
        non_gitkeep = [
            p for p in _media_root.rglob("*") if p.is_file() and p.name != ".gitkeep"
        ]
        if not non_gitkeep:
            _logger.warning(
                "UPLOAD_DIR=%s resolved to %s is empty (no media files). "
                "If the database still references /media/... URLs, those "
                "requests will return 404. Check the bind-mount path "
                "(deploy/docker-compose.yml: ../data/uploads:/app/data/uploads).",
                _media_root, resolved,
            )
        else:
            _logger.info(
                "UPLOAD_DIR=%s resolved to %s (%d media files)",
                _media_root, resolved, len(non_gitkeep),
            )
    except Exception:  # noqa: BLE001
        _logger.exception("Failed to inspect UPLOAD_DIR=%s", _media_root)


_log_media_root_state()


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
