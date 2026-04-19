"""Rate limiting (slowapi): ключ по IP; в APP_ENV=test — опциональный bucket в заголовке."""

from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def rate_limit_key(request: Request) -> str:
    base = get_remote_address(request)
    if os.getenv("APP_ENV", "").lower() == "test":
        bucket = request.headers.get("x-test-rate-bucket", "default")
        return f"{base}:{bucket}"
    return base


limiter = Limiter(key_func=rate_limit_key)
