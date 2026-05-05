# PHASE 27 — Рассылки в Telegram (Маркетинг + Авто-триггеры)

## КОНТЕКСТ ПРОЕКТА

**Стиль: Premium Light** — строго соблюдать во всех новых компонентах:
- CSS переменные: `--primary: #9A7230`, `--card`, `--border`, `--foreground`, `--muted`, `--background`
- Шрифт заголовков: `Playfair Display` (импортирован глобально)
- Карточки: `border-radius: 12-16px`, `border: 1px solid var(--border)`, тень `0 1px 3px rgba(0,0,0,0.06)`
- Кнопки primary: `background: var(--primary)`, `color: #fff`, `border-radius: 8px`, `padding: 8px 16px`
- Кнопки secondary: `border: 1px solid var(--border)`, `background: transparent`
- Заголовки секций: `font-size: 11px`, `font-weight: 600`, `letter-spacing: 0.08em`, `text-transform: uppercase`, `color: var(--primary)`
- Инпуты: `border: 1px solid var(--border)`, `border-radius: 8px`, `padding: 8px 12px`
- Бейджи: `background: var(--muted)`, `border-radius: 999px`, `font-size: 12px`
- Stack: **Next.js 14 App Router, TypeScript strict, TanStack Query v8, FastAPI + Pydantic v2 (ConfigDict from_attributes)**
- Бот: **aiogram 3.x** (уже используется в `bot/`)
- Очереди: **Celery + Redis** (уже запущены через docker-compose)

**Перед началом — изучи структуру:**
```bash
find frontend/src/components -name "*.tsx" | head -30
find frontend/src/app -type d | head -20
cat frontend/src/components/broadcasts/BroadcastsPage.tsx 2>/dev/null | head -60
cat frontend/src/lib/api.ts 2>/dev/null | head -40
cat backend/app/routers/broadcasts.py 2>/dev/null | head -40
cat bot/handlers/ -la 2>/dev/null
cat backend/app/tasks.py 2>/dev/null | head -40
```

---

## АРХИТЕКТУРА: ДВА НЕЗАВИСИМЫХ МОДУЛЯ

| Модуль | Где в UI | Кто управляет | Когда отправляется |
|---|---|---|---|
| **Маркетинговые рассылки** | `/broadcasts` | Администратор вручную | Сейчас или по расписанию |
| **Авто-триггеры** | `/settings/automations` | Настраивается один раз | Автоматически по событию |

---

## ЧАСТЬ 1 — БАЗА ДАННЫХ (Alembic миграция)

```bash
cd backend && alembic revision -m "add_broadcasts_and_triggers"
```

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
import uuid

def upgrade():

    # ───────────────────────────────────────────
    # 1. МАРКЕТИНГОВЫЕ РАССЫЛКИ
    # ───────────────────────────────────────────

    op.create_table('broadcasts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),          # внутреннее название
        sa.Column('text', sa.Text(), nullable=False),                # текст сообщения (поддерживает {name})
        sa.Column('photo_url', sa.String(500), nullable=True),       # прикреплённое фото
        sa.Column('buttons', JSONB, nullable=True),                  # [{text, url}] — inline-кнопки
        # status: draft | scheduled | sending | sent | failed
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),  # NULL = отправить сразу
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_sent', sa.Integer(), default=0),
        sa.Column('total_delivered', sa.Integer(), default=0),
        sa.Column('total_read', sa.Integer(), default=0),
        sa.Column('total_clicked', sa.Integer(), default=0),
        sa.Column('total_errors', sa.Integer(), default=0),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Получатели конкретной рассылки
    op.create_table('broadcast_recipients',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('broadcast_id', sa.Integer(),
                  sa.ForeignKey('broadcasts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id'), nullable=False),
        # status: pending | sent | delivered | read | clicked | error
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('telegram_message_id', sa.Integer(), nullable=True),  # id сообщения в TG
        sa.Column('error_reason', sa.String(200), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index('ix_broadcast_recipients_broadcast_id',
                    'broadcast_recipients', ['broadcast_id'])

    # ───────────────────────────────────────────
    # 2. АВТО-ТРИГГЕРЫ
    # ───────────────────────────────────────────

    op.create_table('auto_triggers',
        sa.Column('id', sa.Integer(), primary_key=True),
        # type: post_visit | reactivation | birthday (расширяемо)
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('delay_hours', sa.Integer(), default=3),          # задержка после события
        sa.Column('template_text', sa.Text(), nullable=False),       # шаблон с {name}, {master}, {service}
        sa.Column('photo_url', sa.String(500), nullable=True),
        sa.Column('buttons', JSONB, nullable=True),                  # [{text, url}]
        # master_id = NULL → применяется ко всем мастерам
        sa.Column('master_id', sa.Integer(), sa.ForeignKey('masters.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Лог выполнения триггеров (для аналитики и дедупликации)
    op.create_table('trigger_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trigger_id', sa.Integer(),
                  sa.ForeignKey('auto_triggers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id'), nullable=False),
        sa.Column('booking_id', sa.Integer(), sa.ForeignKey('bookings.id'), nullable=True),
        # status: sent | error | skipped
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('error_reason', sa.String(200), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index('ix_trigger_logs_client_booking',
                    'trigger_logs', ['client_id', 'booking_id'])


def downgrade():
    op.drop_table('trigger_logs')
    op.drop_table('auto_triggers')
    op.drop_table('broadcast_recipients')
    op.drop_table('broadcasts')
```

---

## ЧАСТЬ 2 — BACKEND (FastAPI)

### 2.1 — Pydantic схемы

Создать файл `backend/app/schemas/broadcasts.py`:

```python
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class InlineButton(BaseModel):
    text: str
    url: str


# ── BROADCAST SCHEMAS ──────────────────────────────────

class BroadcastCreate(BaseModel):
    name: str
    text: str
    photo_url: Optional[str] = None
    buttons: Optional[List[InlineButton]] = []
    scheduled_at: Optional[datetime] = None   # None = отправить немедленно


class BroadcastUpdate(BaseModel):
    name: Optional[str] = None
    text: Optional[str] = None
    photo_url: Optional[str] = None
    buttons: Optional[List[InlineButton]] = None
    scheduled_at: Optional[datetime] = None


class BroadcastRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    client_name: Optional[str] = None
    status: str
    error_reason: Optional[str] = None
    sent_at: Optional[datetime] = None


class BroadcastOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    text: str
    photo_url: Optional[str] = None
    buttons: Optional[List[InlineButton]] = []
    status: str
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    total_sent: int
    total_delivered: int
    total_read: int
    total_clicked: int
    total_errors: int
    created_at: datetime


# ── AUTO-TRIGGER SCHEMAS ───────────────────────────────

class AutoTriggerCreate(BaseModel):
    type: str                              # "post_visit" | "reactivation"
    is_active: bool = True
    delay_hours: int = 3
    template_text: str
    photo_url: Optional[str] = None
    buttons: Optional[List[InlineButton]] = []
    master_id: Optional[int] = None        # None = для всех мастеров


class AutoTriggerUpdate(BaseModel):
    is_active: Optional[bool] = None
    delay_hours: Optional[int] = None
    template_text: Optional[str] = None
    photo_url: Optional[str] = None
    buttons: Optional[List[InlineButton]] = None
    master_id: Optional[int] = None


class AutoTriggerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    is_active: bool
    delay_hours: int
    template_text: str
    photo_url: Optional[str] = None
    buttons: Optional[List[InlineButton]] = []
    master_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
```

---

### 2.2 — Роутеры FastAPI

Создать `backend/app/routers/broadcasts.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.auth import get_current_user, require_roles
from app.schemas.broadcasts import (
    BroadcastCreate, BroadcastUpdate, BroadcastOut,
    BroadcastRecipientOut, AutoTriggerCreate, AutoTriggerUpdate, AutoTriggerOut
)
from app import models
from app.tasks import send_broadcast_task, schedule_broadcast_task

router = APIRouter(prefix="/api/broadcasts", tags=["broadcasts"])
triggers_router = APIRouter(prefix="/api/auto-triggers", tags=["auto-triggers"])


# ── МАРКЕТИНГОВЫЕ РАССЫЛКИ ────────────────────────────

@router.get("/", response_model=List[BroadcastOut])
def list_broadcasts(db: Session = Depends(get_db),
                    user=Depends(require_roles(["owner", "admin"]))):
    return db.query(models.Broadcast).order_by(
        models.Broadcast.created_at.desc()
    ).all()


@router.post("/", response_model=BroadcastOut)
def create_broadcast(data: BroadcastCreate,
                     background_tasks: BackgroundTasks,
                     db: Session = Depends(get_db),
                     user=Depends(require_roles(["owner", "admin"]))):
    broadcast = models.Broadcast(**data.model_dump(exclude={"scheduled_at"}),
                                  scheduled_at=data.scheduled_at,
                                  created_by_id=user.id,
                                  status="draft")
    db.add(broadcast)
    db.commit()
    db.refresh(broadcast)

    # Запустить немедленно или поставить в очередь
    if data.scheduled_at is None:
        background_tasks.add_task(send_broadcast_task, broadcast.id)
    else:
        schedule_broadcast_task.apply_async(
            args=[broadcast.id],
            eta=data.scheduled_at
        )
    return broadcast


@router.get("/{broadcast_id}", response_model=BroadcastOut)
def get_broadcast(broadcast_id: int,
                  db: Session = Depends(get_db),
                  user=Depends(require_roles(["owner", "admin"]))):
    b = db.query(models.Broadcast).filter_by(id=broadcast_id).first()
    if not b:
        raise HTTPException(404, "Broadcast not found")
    return b


@router.patch("/{broadcast_id}", response_model=BroadcastOut)
def update_broadcast(broadcast_id: int,
                     data: BroadcastUpdate,
                     db: Session = Depends(get_db),
                     user=Depends(require_roles(["owner", "admin"]))):
    b = db.query(models.Broadcast).filter_by(id=broadcast_id).first()
    if not b:
        raise HTTPException(404)
    if b.status not in ("draft", "scheduled"):
        raise HTTPException(400, "Cannot edit broadcast that is already sending or sent")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


@router.delete("/{broadcast_id}", status_code=204)
def delete_broadcast(broadcast_id: int,
                     db: Session = Depends(get_db),
                     user=Depends(require_roles(["owner", "admin"]))):
    b = db.query(models.Broadcast).filter_by(id=broadcast_id).first()
    if not b:
        raise HTTPException(404)
    if b.status == "sending":
        raise HTTPException(400, "Cannot delete a broadcast that is currently sending")
    db.delete(b)
    db.commit()


@router.get("/{broadcast_id}/recipients",
            response_model=List[BroadcastRecipientOut])
def get_recipients(broadcast_id: int,
                   db: Session = Depends(get_db),
                   user=Depends(require_roles(["owner", "admin"]))):
    return db.query(models.BroadcastRecipient).filter_by(
        broadcast_id=broadcast_id
    ).all()


# ── АВТО-ТРИГГЕРЫ ─────────────────────────────────────

@triggers_router.get("/", response_model=List[AutoTriggerOut])
def list_triggers(db: Session = Depends(get_db),
                  user=Depends(require_roles(["owner"]))):
    return db.query(models.AutoTrigger).all()


@triggers_router.post("/", response_model=AutoTriggerOut)
def create_trigger(data: AutoTriggerCreate,
                   db: Session = Depends(get_db),
                   user=Depends(require_roles(["owner"]))):
    trigger = models.AutoTrigger(**data.model_dump())
    db.add(trigger)
    db.commit()
    db.refresh(trigger)
    return trigger


@triggers_router.patch("/{trigger_id}", response_model=AutoTriggerOut)
def update_trigger(trigger_id: int,
                   data: AutoTriggerUpdate,
                   db: Session = Depends(get_db),
                   user=Depends(require_roles(["owner"]))):
    t = db.query(models.AutoTrigger).filter_by(id=trigger_id).first()
    if not t:
        raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@triggers_router.delete("/{trigger_id}", status_code=204)
def delete_trigger(trigger_id: int,
                   db: Session = Depends(get_db),
                   user=Depends(require_roles(["owner"]))):
    t = db.query(models.AutoTrigger).filter_by(id=trigger_id).first()
    if not t:
        raise HTTPException(404)
    db.delete(t)
    db.commit()
```

Зарегистрировать роутеры в `backend/app/main.py`:
```python
from app.routers.broadcasts import router as broadcasts_router, triggers_router
app.include_router(broadcasts_router)
app.include_router(triggers_router)
```

---

### 2.3 — Celery задачи для отправки

Добавить в `backend/app/tasks.py` (или создать новый файл `backend/app/tasks/broadcasts.py`):

```python
from celery import shared_task
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
import asyncio
import logging

logger = logging.getLogger(__name__)

TELEGRAM_BATCH_SIZE = 25       # сообщений в батче
TELEGRAM_BATCH_DELAY = 1.0     # секунда между батчами (лимит Telegram ~30/сек)


def _render_template(text: str, client) -> str:
    """Подставляет переменные {name}, {master}, {service}, {date}"""
    return (text
            .replace("{name}", client.name or "")
            .replace("{имя}", client.name or ""))


def _build_keyboard(buttons: list | None) -> InlineKeyboardMarkup | None:
    if not buttons:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=b["text"], url=b["url"])]
        for b in buttons
    ])


@shared_task(bind=True, max_retries=3)
def send_broadcast_task(self, broadcast_id: int):
    """Основная задача рассылки — запускается немедленно или по расписанию."""
    db: Session = SessionLocal()
    try:
        broadcast = db.query(models.Broadcast).filter_by(id=broadcast_id).first()
        if not broadcast:
            return
        if broadcast.status == "sent":
            return   # уже отправлена, защита от дублей

        # Получатели = все клиенты с telegram_chat_id
        clients = db.query(models.Client).filter(
            models.Client.telegram_chat_id.isnot(None)
        ).all()

        # Создать записи получателей
        recipients = []
        for client in clients:
            rec = models.BroadcastRecipient(
                broadcast_id=broadcast_id,
                client_id=client.id,
                status="pending"
            )
            db.add(rec)
            recipients.append((rec, client))
        
        broadcast.status = "sending"
        broadcast.total_sent = len(clients)
        db.commit()

        # Отправка батчами
        asyncio.run(_send_batch(broadcast, recipients, db))

        broadcast.status = "sent"
        from datetime import datetime, timezone
        broadcast.sent_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as exc:
        logger.error(f"Broadcast {broadcast_id} failed: {exc}")
        if broadcast:
            broadcast.status = "failed"
            db.commit()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


async def _send_batch(broadcast, recipients, db):
    """Асинхронная отправка с батчингом."""
    from app.config import settings
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    keyboard = _build_keyboard(broadcast.buttons)

    import asyncio
    for i in range(0, len(recipients), TELEGRAM_BATCH_SIZE):
        batch = recipients[i:i + TELEGRAM_BATCH_SIZE]
        for rec, client in batch:
            try:
                text = _render_template(broadcast.text, client)
                if broadcast.photo_url:
                    await bot.send_photo(
                        chat_id=client.telegram_chat_id,
                        photo=broadcast.photo_url,
                        caption=text,
                        reply_markup=keyboard,
                        parse_mode="HTML"
                    )
                else:
                    await bot.send_message(
                        chat_id=client.telegram_chat_id,
                        text=text,
                        reply_markup=keyboard,
                        parse_mode="HTML"
                    )
                rec.status = "sent"
                broadcast.total_delivered += 1
            except Exception as e:
                rec.status = "error"
                rec.error_reason = str(e)[:200]
                broadcast.total_errors += 1
            
            from datetime import datetime, timezone
            rec.sent_at = datetime.now(timezone.utc)

        db.commit()
        if i + TELEGRAM_BATCH_SIZE < len(recipients):
            await asyncio.sleep(TELEGRAM_BATCH_DELAY)

    await bot.session.close()


# ── АВТО-ТРИГГЕР: пост-визит ───────────────────────────────────────

@shared_task
def fire_post_visit_trigger(booking_id: int):
    """
    Вызывается через delay() когда бронирование переводится в статус 'completed'.
    Ищет активный триггер типа 'post_visit' и отправляет клиенту сообщение.
    
    Как вызывать из роутера бронирований:
        if booking.status == "completed":
            trigger = db.query(AutoTrigger).filter_by(
                type="post_visit", is_active=True,
                master_id=booking.master_id  # или NULL для глобального
            ).first()
            if trigger:
                fire_post_visit_trigger.apply_async(
                    args=[booking.id],
                    countdown=trigger.delay_hours * 3600
                )
    """
    db: Session = SessionLocal()
    try:
        booking = db.query(models.Booking).filter_by(id=booking_id).first()
        if not booking:
            return

        client = booking.client
        if not client or not client.telegram_chat_id:
            return

        # Проверка дедупликации — не отправлять дважды за одно бронирование
        already_sent = db.query(models.TriggerLog).filter_by(
            booking_id=booking_id, status="sent"
        ).first()
        if already_sent:
            return

        # Найти триггер: сначала специфичный для мастера, потом глобальный
        trigger = (
            db.query(models.AutoTrigger).filter_by(
                type="post_visit", is_active=True, master_id=booking.master_id
            ).first()
            or
            db.query(models.AutoTrigger).filter_by(
                type="post_visit", is_active=True, master_id=None
            ).first()
        )
        if not trigger:
            return

        text = (trigger.template_text
                .replace("{name}", client.name or "")
                .replace("{имя}", client.name or "")
                .replace("{master}", booking.master.name if booking.master else "")
                .replace("{мастер}", booking.master.name if booking.master else "")
                .replace("{service}", booking.service.name if booking.service else "")
                .replace("{услуга}", booking.service.name if booking.service else ""))

        keyboard = _build_keyboard(trigger.buttons)

        async def _send():
            from app.config import settings
            bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
            if trigger.photo_url:
                await bot.send_photo(
                    chat_id=client.telegram_chat_id,
                    photo=trigger.photo_url,
                    caption=text,
                    reply_markup=keyboard,
                    parse_mode="HTML"
                )
            else:
                await bot.send_message(
                    chat_id=client.telegram_chat_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode="HTML"
                )
            await bot.session.close()

        asyncio.run(_send())

        log = models.TriggerLog(
            trigger_id=trigger.id,
            client_id=client.id,
            booking_id=booking_id,
            status="sent"
        )
        db.add(log)
        db.commit()

    except Exception as e:
        log = models.TriggerLog(
            trigger_id=None,
            client_id=booking.client_id if booking else 0,
            booking_id=booking_id,
            status="error",
            error_reason=str(e)[:200]
        )
        db.add(log)
        db.commit()
        logger.error(f"Post-visit trigger failed for booking {booking_id}: {e}")
    finally:
        db.close()
```

**Подключить триггер к роутеру бронирований** — найди в `backend/app/routers/bookings.py` место где статус меняется на `completed` и добавь:

```python
# В функции update_booking или complete_booking:
if new_status == "completed" and old_status != "completed":
    from app.tasks.broadcasts import fire_post_visit_trigger
    active_trigger = db.query(AutoTrigger).filter(
        AutoTrigger.type == "post_visit",
        AutoTrigger.is_active == True
    ).first()
    if active_trigger:
        fire_post_visit_trigger.apply_async(
            args=[booking.id],
            countdown=active_trigger.delay_hours * 3600
        )
```

---

## ЧАСТЬ 3 — FRONTEND (Next.js 14)

### 3.1 — Страница `/broadcasts`

Создать файл `frontend/src/app/(admin)/broadcasts/page.tsx`.

**Структура страницы:**

```
┌──────────────────────────────────────────────────────────┐
│  Рассылки                        [+ Создать рассылку]    │
│  Маркетинговые кампании в Telegram                        │
├──────────────────────────────────────────────────────────┤
│  [Все] [Черновики] [Запланированные] [Отправленные]       │
├──────────────────────────────────────────────────────────┤
│  Карточка кампании:                                        │
│  ┌───────────────────────────────────────────────────┐   │
│  │ 📨 Весенняя акция        ● Отправлена   28 апр    │   │
│  │ "Привет! Специально для вас..."                    │   │
│  │ Отправлено: 48 · Доставлено: 41 · Прочитано: 28  │   │
│  │ [Дублировать]  [Аналитика →]                      │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Компонент карточки** (`BroadcastCard.tsx`):
- Статус-бейдж: `draft` → серый «Черновик», `scheduled` → золотой «Запланирована», `sending` → синий «Отправляется...», `sent` → зелёный «Отправлена», `failed` → красный «Ошибка»
- Превью текста — обрезать до 80 символов
- Статистика: иконки + числа в одну строку
- Кнопки: «Дублировать», «Аналитика», и только для draft/scheduled — «Редактировать», «Удалить»
- Статус `sending` — показывать progress bar (total_delivered / total_sent)

---

### 3.2 — Drawer: Создание / редактирование рассылки

Открывается справа на всю высоту экрана. Ширина `max-w-[540px]`.

**Поля:**

```tsx
// Внутреннее название
<Input label="Название кампании" placeholder="Весенняя акция — апрель" required />

// Текст сообщения
<Textarea
  label="Текст сообщения"
  placeholder="Напишите сообщение. Используйте {name} для имени клиента."
  rows={5}
  hint="Доступные переменные: {name} — имя клиента"
/>

// Превью сообщения (live) — Telegram bubble
<TelegramPreview text={text} photo={photo} buttons={buttons} />

// Загрузка фото (опционально)
<PhotoUpload label="Прикрепить фото" hint="JPG, PNG до 10 МБ" />

// Inline-кнопки (до 3 штук)
<ButtonsBuilder
  buttons={buttons}
  onAdd={() => addButton()}
  onRemove={(i) => removeButton(i)}
  placeholder_text="Записаться"
  placeholder_url="https://t.me/yoursalon_bot?start=book"
/>

// Отправка
<RadioGroup>
  <Radio value="now" label="Отправить сейчас" />
  <Radio value="scheduled" label="Запланировать" />
</RadioGroup>

{sendType === "scheduled" && (
  <DateTimePicker label="Дата и время отправки" />
)}

// Получатели (информационно)
<RecipientCounter>
  Получатели: <strong>48 клиентов</strong> с активным Telegram
</RecipientCounter>
```

**Компонент `TelegramPreview`** — визуализирует как будет выглядеть сообщение в Telegram:
```tsx
// Стилизовать под Telegram bubble:
// фон #EFFDDE (входящее), border-radius: 12px,
// max-width: 280px, font-size: 14px
// Кнопки под сообщением — синие rounded кнопки
```

---

### 3.3 — Детальная аналитика рассылки

Клик «Аналитика →» открывает отдельную страницу `/broadcasts/[id]`:

```
┌─────────────────────────────────────────────────────────┐
│  ← Назад   Весенняя акция — апрель           Отправлена │
│  28 апреля 2026, 12:00                                   │
├────────────┬────────────┬────────────┬─────────────────┐ │
│ Отправлено │ Доставлено │ Прочитано  │ Кликнули кнопку │ │
│     48     │  41 (85%)  │  28 (58%)  │    12 (25%)     │ │
└────────────┴────────────┴────────────┴─────────────────┘ │
│                                                           │
│  [Все (48)] [Доставлено (41)] [Ошибки (7)]               │
│                                                           │
│  Список получателей с именем, статусом и временем        │
│  ┌─────────────────────────────────────────────────┐    │
│  │ АС  Анна Соколова     ✓ Доставлено   12:03      │    │
│  │ МП  Марина Петренко   ✓ Доставлено   12:03      │    │
│  │ ??  Bot blocked       ✗ Ошибка       —           │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

### 3.4 — Страница `/settings/automations` (Авто-триггеры)

Добавить новую вкладку в разделе Настройки.

**Секция «После визита»:**

```
┌──────────────────────────────────────────────────────────┐
│  Сообщение после визита               [вкл. ●──────]     │
│  Клиент получает сообщение автоматически после визита     │
├──────────────────────────────────────────────────────────┤
│  Задержка:  [3 часа ▼]   (1ч / 3ч / 24ч / следующий день)│
│                                                           │
│  Шаблон сообщения:                                        │
│  ┌─────────────────────────────────────────────────┐     │
│  │ {name}, спасибо за визит к {master}! 🌟          │     │
│  │ Будем рады вашему отзыву...                      │     │
│  └─────────────────────────────────────────────────┘     │
│  Переменные: {name} {master} {service} {date}             │
│                                                           │
│  Кнопка:  [⭐ Оставить отзыв]  →  [https://...]          │
│                                                           │
│  [Превью сообщения]                                       │
│                                                           │
│  Применять к мастеру: [Все мастера ▼]                     │
│                                                           │
│              [Сохранить настройки]                        │
└──────────────────────────────────────────────────────────┘
```

**TanStack Query хуки** (`frontend/src/hooks/useBroadcasts.ts`):

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

// Список рассылок
export const useBroadcasts = () =>
  useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => api.get("/api/broadcasts").then(r => r.data)
  })

// Создание рассылки
export const useCreateBroadcast = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BroadcastCreate) =>
      api.post("/api/broadcasts", data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] })
  })
}

// Аналитика
export const useBroadcastRecipients = (id: number) =>
  useQuery({
    queryKey: ["broadcast-recipients", id],
    queryFn: () => api.get(`/api/broadcasts/${id}/recipients`).then(r => r.data),
    enabled: !!id
  })

// Авто-триггеры
export const useAutoTriggers = () =>
  useQuery({
    queryKey: ["auto-triggers"],
    queryFn: () => api.get("/api/auto-triggers").then(r => r.data)
  })

export const useUpdateTrigger = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AutoTriggerUpdate }) =>
      api.patch(`/api/auto-triggers/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-triggers"] })
  })
}
```

---

## ЧАСТЬ 4 — СТИЛИСТИКА КОМПОНЕНТОВ

Все новые компоненты строго в Premium Light. Примеры конкретных стилей:

```tsx
// Статус-бейдж рассылки
const statusConfig = {
  draft:     { label: "Черновик",       className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Запланирована",  className: "bg-amber-50 text-amber-700 border border-amber-200" },
  sending:   { label: "Отправляется...", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  sent:      { label: "Отправлена",     className: "bg-green-50 text-green-700 border border-green-200" },
  failed:    { label: "Ошибка",         className: "bg-red-50 text-red-700 border border-red-200" },
}

// Карточка кампании
<div className="rounded-xl border border-border bg-card p-4 hover:border-[var(--primary)] 
                transition-colors cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.06)]">

// Toggle (вкл/выкл триггер)
// Использовать shadcn/ui Switch с кастомным цветом:
// checked: background var(--primary) / unchecked: var(--muted)

// Секция настроек триггера
<div className="rounded-xl border border-border bg-card p-5">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="font-playfair text-base font-medium">Сообщение после визита</h3>
      <p className="text-sm text-muted-foreground mt-0.5">Автоматически после завершения записи</p>
    </div>
    <Switch checked={trigger.is_active} onCheckedChange={handleToggle} />
  </div>
  ...
</div>
```

---

## ЧАСТЬ 5 — ПОРЯДОК РЕАЛИЗАЦИИ

1. Запустить Alembic миграцию
2. Создать модели SQLAlchemy (`models/broadcast.py`, `models/auto_trigger.py`)
3. Создать схемы Pydantic (`schemas/broadcasts.py`)
4. Создать роутеры и зарегистрировать в `main.py`
5. Добавить Celery задачи в `tasks/broadcasts.py`
6. Подключить хук `fire_post_visit_trigger` к роутеру бронирований
7. Frontend: создать хуки `useBroadcasts.ts`
8. Frontend: страница `/broadcasts` + список карточек
9. Frontend: Drawer для создания рассылки с Telegram Preview
10. Frontend: страница `/broadcasts/[id]` — аналитика
11. Frontend: вкладка `/settings/automations` — настройка триггеров
12. Протестировать: создать рассылку, отправить себе в Telegram

---

## ВАЖНО

- Никогда не отправлять сообщения синхронно в HTTP-запросе — только через Celery
- Добавить защиту от дублей в `fire_post_visit_trigger` через `trigger_logs`
- Батчинг обязателен: Telegram блокирует ботов при >30 сообщений/сек
- Переменные `{name}` / `{имя}` — поддерживать оба варианта (русский и латиница)
- Страница `/broadcasts` уже существует в сайдбаре — не создавать новый роут, обновить существующий
- Поле `photo_url` — загружать через уже существующий endpoint загрузки медиа
