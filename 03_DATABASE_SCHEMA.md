# Database Schema — детально

Это развёрнутая версия раздела 4 из `01_MASTER_SPEC.md`.
Все таблицы на PostgreSQL 16 с расширением `pgvector`.

---

## 0. Соглашения

- Все `id` — `uuid`, default `gen_random_uuid()`.
- Все таймстампы — `timestamptz`, хранятся в UTC.
- `created_at`, `updated_at` везде, где есть смысл.
- Soft delete — только для `client` (GDPR) через `deleted_at`. Остальное — hard delete с cascade.
- Enum-ы — native PG enums.
- i18n-поля — `jsonb` с ключами `en/ru/uk/bg`.

---

## 1. salon (1 запись — синглтон)

```sql
CREATE TABLE salon (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo_url        text,
  cover_url       text,
  favicon_url     text,
  address         text,
  phone           text,
  email           text,
  website         text,
  social          jsonb DEFAULT '{}'::jsonb,     -- {instagram, tiktok, facebook}
  timezone        text NOT NULL DEFAULT 'Europe/Sofia',
  currency        text NOT NULL DEFAULT 'EUR',   -- EUR / USD / UAH
  default_lang    text NOT NULL DEFAULT 'en',
  license_key     text UNIQUE,
  license_since   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

Важно: в production в таблице будет ровно **одна строка**. Сервисы используют `get_salon()` с кешем.

---

## 2. settings (1:1 с salon)

```sql
CREATE TYPE theme_preset AS ENUM ('minimal', 'friendly', 'premium');
CREATE TYPE cancellation_policy AS ENUM ('no_cancel', 'fine', 'blacklist');

CREATE TABLE settings (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id                      uuid UNIQUE NOT NULL REFERENCES salon(id) ON DELETE CASCADE,

  -- theme
  theme                         theme_preset NOT NULL DEFAULT 'friendly',
  primary_color                 text NOT NULL DEFAULT '#D97757',

  -- booking & cancel
  prepayment_enabled            bool NOT NULL DEFAULT false,
  prepayment_percent            int NOT NULL DEFAULT 20,
  prepayment_min                numeric(10,2) DEFAULT 5,
  prepayment_skip_regular_after int,                         -- пропускать для N+ визитов
  cancellation_free_hours       int NOT NULL DEFAULT 24,
  cancellation_late_policy      cancellation_policy NOT NULL DEFAULT 'fine',
  cancellation_fine_amount      numeric(10,2) DEFAULT 10,
  cancellation_blacklist_after  int DEFAULT 3,              -- no-show кол-во → авто blacklist
  booking_lead_time_minutes     int NOT NULL DEFAULT 60,
  booking_buffer_minutes        int NOT NULL DEFAULT 5,

  -- reminders
  reminder_intervals            int[] NOT NULL DEFAULT '{1440,120,30}'::int[], -- в минутах до визита
  review_delay_hours            int NOT NULL DEFAULT 2,

  -- working hours default
  working_hours_default         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- пример: {"mon":{"open":"10:00","close":"20:00"}, ...}

  -- AI
  ai_enabled                    bool NOT NULL DEFAULT true,
  ai_model                      text DEFAULT 'gemini-1.5-flash',
  ai_system_prompt              jsonb DEFAULT '{}'::jsonb,   -- i18n prompt
  ai_temperature                real DEFAULT 0.5,
  ai_allow_booking              bool DEFAULT false,

  -- integrations
  payment_provider              text,                         -- 'telegram_payments' | 'stripe' | 'liqpay' | 'epay_bg'
  payment_config                jsonb,                        -- зашифровано
  telegram_admin_chat_id        bigint,
  smtp_config                   jsonb,

  -- misc
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
```

---

## 3. user (staff)

```sql
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'master', 'reception');

CREATE TABLE "user" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext UNIQUE NOT NULL,
  password_hash  text NOT NULL,
  role           user_role NOT NULL,
  first_name     text NOT NULL,
  last_name      text,
  avatar_url     text,
  phone          text,
  master_id      uuid REFERENCES master(id) ON DELETE SET NULL,  -- для роли 'master'
  lang           text NOT NULL DEFAULT 'en',
  is_active      bool NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_role ON "user"(role) WHERE is_active;
CREATE UNIQUE INDEX idx_user_master ON "user"(master_id) WHERE master_id IS NOT NULL;
```

---

## 4. session (refresh tokens)

```sql
CREATE TABLE session (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,                 -- sha256 от refresh
  expires_at  timestamptz NOT NULL,
  ip          inet,
  user_agent  text,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_user ON session(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_session_token ON session(token_hash);
```

---

## 5. master

```sql
CREATE TABLE master (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  bio             jsonb DEFAULT '{}'::jsonb,
  photo_url       text,
  specialization  jsonb DEFAULT '{}'::jsonb,        -- i18n
  color_hex       text NOT NULL DEFAULT '#D97757',  -- для календаря
  sort_order      int NOT NULL DEFAULT 0,
  is_active       bool NOT NULL DEFAULT true,
  payroll_percent numeric(5,2),                     -- % от выручки на ЗП
  rating_avg      numeric(3,2),
  rating_count    int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_master_sort ON master(sort_order) WHERE is_active;
```

---

## 6. service_category + service

```sql
CREATE TABLE service_category (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_i18n    jsonb NOT NULL,                -- {en,ru,uk,bg}
  icon         text,
  sort_order   int NOT NULL DEFAULT 0,
  is_active    bool NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         uuid REFERENCES service_category(id) ON DELETE SET NULL,
  name_i18n           jsonb NOT NULL,
  description_i18n    jsonb DEFAULT '{}'::jsonb,
  duration_minutes    int NOT NULL,
  price               numeric(10,2) NOT NULL,
  photo_url           text,
  is_active           bool NOT NULL DEFAULT true,
  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_cat ON service(category_id) WHERE is_active;
```

---

## 7. master_service (M2M)

```sql
CREATE TABLE master_service (
  master_id        uuid NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  service_id       uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  price_override   numeric(10,2),
  duration_override int,
  PRIMARY KEY (master_id, service_id)
);
```

---

## 8. schedule_slot

```sql
CREATE TYPE slot_type AS ENUM ('working', 'vacation', 'sick', 'block', 'break');

CREATE TABLE schedule_slot (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   uuid NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  type        slot_type NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  recurrence  jsonb,                          -- RRULE или {freq, byday[], until}
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slot_master_starts ON schedule_slot(master_id, starts_at);
CREATE INDEX idx_slot_type ON schedule_slot(type);
```

---

## 9. client

```sql
CREATE TABLE client (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id        bigint UNIQUE,
  tg_username       text,
  phone             text,
  first_name        text,
  last_name         text,
  birthday          date,
  lang              text NOT NULL DEFAULT 'en',
  source            text NOT NULL DEFAULT 'bot',    -- 'bot' | 'manual'
  joined_at         timestamptz NOT NULL DEFAULT now(),
  last_visit_at     timestamptz,
  total_bookings    int NOT NULL DEFAULT 0,
  total_revenue     numeric(12,2) NOT NULL DEFAULT 0,
  no_show_count     int NOT NULL DEFAULT 0,
  tags              text[] DEFAULT '{}',
  prefers_no_ai     bool NOT NULL DEFAULT false,
  deleted_at        timestamptz,                    -- soft delete для GDPR
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_phone ON client(phone);
CREATE INDEX idx_client_tags ON client USING gin(tags);
CREATE INDEX idx_client_last_visit ON client(last_visit_at);
```

---

## 10. client_note («записка»)

```sql
CREATE TABLE client_note (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL REFERENCES "user"(id) ON DELETE SET NULL,
  content         text NOT NULL,
  pinned          bool NOT NULL DEFAULT false,
  visibility      text NOT NULL DEFAULT 'staff',    -- 'staff' | 'author_only'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_client ON client_note(client_id, pinned DESC, created_at DESC);
```

Для master-роли фильтруем: `author_user_id = current.user_id OR visibility='staff'` (admin видит всё).

---

## 11. booking

```sql
CREATE TYPE booking_status AS ENUM (
  'pending', 'confirmed', 'completed',
  'cancelled_by_client', 'cancelled_by_salon', 'no_show'
);
CREATE TYPE prepayment_status AS ENUM ('none', 'required', 'paid', 'refunded', 'failed');

CREATE TABLE booking (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL REFERENCES client(id) ON DELETE RESTRICT,
  master_id               uuid NOT NULL REFERENCES master(id) ON DELETE RESTRICT,
  service_id              uuid NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  status                  booking_status NOT NULL DEFAULT 'pending',
  price                   numeric(10,2) NOT NULL,
  prepayment_amount       numeric(10,2),
  prepayment_status       prepayment_status NOT NULL DEFAULT 'none',
  payment_provider_ref    text,
  notes                   text,
  created_via             text NOT NULL DEFAULT 'bot',   -- 'bot' | 'admin' | 'miniapp'
  cancellation_reason     text,
  cancelled_at            timestamptz,
  completed_at            timestamptz,

  reminder_sent_24h       bool NOT NULL DEFAULT false,
  reminder_sent_2h        bool NOT NULL DEFAULT false,
  reminder_sent_30m       bool NOT NULL DEFAULT false,
  review_requested_at     timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_master_starts ON booking(master_id, starts_at);
CREATE INDEX idx_booking_client_starts ON booking(client_id, starts_at DESC);
CREATE INDEX idx_booking_status_starts ON booking(status, starts_at);
CREATE INDEX idx_booking_reminders ON booking(status, starts_at)
  WHERE status='confirmed' AND (NOT reminder_sent_24h OR NOT reminder_sent_2h OR NOT reminder_sent_30m);
```

### Concurrency

Создание брони: в транзакции
```sql
SELECT id FROM booking
WHERE master_id = :mid
  AND status IN ('pending','confirmed')
  AND tstzrange(starts_at, ends_at, '[)') && tstzrange(:new_start, :new_end, '[)')
FOR UPDATE;
```

Если пусто — INSERT, иначе → `SlotTakenError`.

---

## 12. review

```sql
CREATE TABLE review (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid UNIQUE NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  master_id     uuid NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  is_published  bool NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_master_rating ON review(master_id, rating) WHERE is_published;
```

Триггер после insert/update → пересчёт `master.rating_avg/count`.

---

## 13. blacklist_entry

```sql
CREATE TABLE blacklist_entry (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid UNIQUE NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  reason             text,
  added_by_user_id   uuid REFERENCES "user"(id) ON DELETE SET NULL,
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blacklist_expires ON blacklist_entry(expires_at);
```

---

## 14. broadcast + broadcast_recipient

```sql
CREATE TYPE broadcast_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');

CREATE TABLE broadcast (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  message_i18n        jsonb NOT NULL,                 -- {en,ru,uk,bg}
  media_url           text,
  inline_buttons      jsonb,                           -- [{text, url|callback}]
  segment_criteria    jsonb NOT NULL,
  status              broadcast_status NOT NULL DEFAULT 'draft',
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  created_by_user_id  uuid NOT NULL REFERENCES "user"(id),
  stats               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_broadcast_status ON broadcast(status, scheduled_at);

CREATE TABLE broadcast_recipient (
  broadcast_id   uuid NOT NULL REFERENCES broadcast(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending',    -- pending/sent/delivered/failed/blocked
  error          text,
  sent_at        timestamptz,
  clicked_at     timestamptz,
  PRIMARY KEY (broadcast_id, client_id)
);

CREATE INDEX idx_br_client ON broadcast_recipient(client_id);
CREATE INDEX idx_br_pending ON broadcast_recipient(broadcast_id) WHERE status='pending';
```

---

## 15. kb_document + kb_chunk (RAG)

```sql
CREATE TABLE kb_document (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  source_type  text NOT NULL DEFAULT 'manual',   -- 'file' | 'url' | 'manual'
  source_ref   text,
  content      text,                              -- исходник
  lang         text NOT NULL DEFAULT 'en',
  is_active    bool NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kb_chunk (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES kb_document(id) ON DELETE CASCADE,
  position       int NOT NULL,
  content        text NOT NULL,
  embedding      vector(768) NOT NULL,            -- text-embedding-004 size
  token_count    int NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_doc ON kb_chunk(document_id);
CREATE INDEX idx_chunk_vec ON kb_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 16. ai_conversation + ai_message

```sql
CREATE TABLE ai_conversation (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  lang        text,
  token_in    int NOT NULL DEFAULT 0,
  token_out   int NOT NULL DEFAULT 0
);

CREATE INDEX idx_conv_client ON ai_conversation(client_id, started_at DESC);

CREATE TABLE ai_message (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  role             text NOT NULL,                 -- 'user' | 'assistant' | 'system'
  content          text NOT NULL,
  cited_chunks     uuid[],
  flagged          bool NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_msg_conv ON ai_message(conversation_id, created_at);
CREATE INDEX idx_msg_flagged ON ai_message(flagged) WHERE flagged;
```

---

## 17. bot_visit_stat

```sql
CREATE TABLE bot_visit_stat (
  date                 date PRIMARY KEY,
  unique_visitors      int NOT NULL DEFAULT 0,
  new_joins            int NOT NULL DEFAULT 0,
  bookings_started     int NOT NULL DEFAULT 0,
  bookings_completed   int NOT NULL DEFAULT 0,
  bookings_abandoned   int NOT NULL DEFAULT 0,
  ai_sessions          int NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

Агрегируется ARQ-воркером из сырой таблицы `bot_event` (ниже).

```sql
CREATE TABLE bot_event (
  id          bigserial PRIMARY KEY,
  client_id   uuid REFERENCES client(id) ON DELETE SET NULL,
  event_type  text NOT NULL,       -- 'visit', 'start', 'booking_started', 'booking_completed', 'booking_abandoned', 'ai_session'
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_type_date ON bot_event(event_type, created_at);
CREATE INDEX idx_event_client ON bot_event(client_id, created_at);
```

Раз в сутки агрегатор пересчитывает `bot_visit_stat`, сырая таблица очищается > 90 дней.

---

## 18. audit_log

```sql
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES "user"(id) ON DELETE SET NULL,
  action       text NOT NULL,            -- 'login', 'create_booking', 'update_settings', ...
  entity_type  text,
  entity_id    uuid,
  payload      jsonb,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);
```

---

## 19. upload (файлы)

```sql
CREATE TABLE upload (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path           text NOT NULL,          -- относительный путь в /data/uploads
  original_name  text,
  mime           text NOT NULL,
  size_bytes     int NOT NULL,
  width          int,
  height         int,
  uploaded_by    uuid REFERENCES "user"(id) ON DELETE SET NULL,
  purpose        text,                    -- 'master_photo', 'service_photo', 'logo', ...
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

---

## 20. Триггеры

### 20.1. updated_at
```sql
CREATE OR REPLACE FUNCTION tg_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```
Навешиваем на все таблицы с `updated_at`.

### 20.2. booking → client counters
При `status` переходящем в `completed`:
- `client.total_bookings += 1`
- `client.total_revenue += price`
- `client.last_visit_at = NOW()`

При `status` в `no_show`:
- `client.no_show_count += 1`
- если >= `settings.cancellation_blacklist_after` → auto-insert в blacklist.

### 20.3. review → master rating
Пересчёт `master.rating_avg / rating_count` после insert/update/delete review.

---

## 21. Расширения PG

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "citext";        -- для email
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- для JSONB-индексов опц.
```

---

## 22. Бэкапы

```bash
pg_dump -Fc -d hunger > backup_$(date +%F).dump
```

Восстановление:
```bash
pg_restore -d hunger --clean --if-exists backup_2026-04-18.dump
```

Политика ротации: 7 ежедневных + 4 еженедельных + 3 ежемесячных (crontab в `deploy/scripts/backup.sh`).

---

## 23. Миграционный план

1. Миграция `0001_initial` — всё выше.
2. Начальные данные через `scripts/seed_initial.py` (запускает install.sh):
   - 1 salon с дефолтными настройками.
   - 1 owner.
3. Демо-данные (опционально) — `scripts/seed_demo.py`.
4. Все последующие изменения — только через alembic autogenerate.
