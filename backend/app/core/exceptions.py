"""Доменные исключения API → HTTP через handlers в main."""


class DomainError(Exception):
    """Базовая ошибка домена."""

    def __init__(self, message: str, *, code: str, status_code: int) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class AuthError(Exception):
    """Ошибка аутентификации (неверные учётные данные, просроченный токен)."""


class ForbiddenError(Exception):
    """Недостаточно прав."""


class NotFoundError(DomainError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, code="not_found", status_code=404)


class SlotTakenError(DomainError):
    """Пересечение по времени с существующей записью."""

    def __init__(self, message: str = "Time slot is already taken") -> None:
        super().__init__(message, code="slot_taken", status_code=409)


class ClientBlacklistedError(DomainError):
    """Клиент в чёрном списке."""

    def __init__(self, message: str = "Client is blacklisted") -> None:
        super().__init__(message, code="client_blacklisted", status_code=403)


class MasterDoesNotOfferServiceError(DomainError):
    """Мастер не выполняет эту услугу."""

    def __init__(self, message: str = "Master does not offer this service") -> None:
        super().__init__(message, code="master_service_mismatch", status_code=409)


class ConflictError(DomainError):
    """Конфликт данных (FK, дубликат)."""

    def __init__(self, message: str, *, code: str = "conflict") -> None:
        super().__init__(message, code=code, status_code=409)


class ForbiddenScopeError(DomainError):
    """Доступ к объекту другого мастера / вне области видимости."""

    def __init__(self, message: str = "Access denied for this resource") -> None:
        super().__init__(message, code="forbidden_scope", status_code=403)


class InvalidScheduleError(DomainError):
    """Слот вне расписания, пересечение с буфером или lead time."""

    def __init__(self, message: str = "Invalid schedule") -> None:
        super().__init__(message, code="invalid_schedule", status_code=409)


class LateCancellationDeniedError(DomainError):
    """Поздняя отмена запрещена политикой."""

    def __init__(self, message: str = "Late cancellation not allowed") -> None:
        super().__init__(message, code="late_cancellation_denied", status_code=403)


class InvalidBookingStateError(DomainError):
    """Операция недопустима для текущего статуса брони."""

    def __init__(self, message: str = "Invalid booking status") -> None:
        super().__init__(message, code="invalid_booking_state", status_code=409)


class AIUnavailableError(DomainError):
    """Нет GEMINI_API_KEY или AI отключён."""

    def __init__(self, message: str = "AI is temporarily unavailable") -> None:
        super().__init__(message, code="ai_unavailable", status_code=503)


class AIRateLimitError(DomainError):
    """Слишком много запросов к AI за час."""

    def __init__(self, message: str = "Too many AI requests, try again later") -> None:
        super().__init__(message, code="ai_rate_limit", status_code=429)
