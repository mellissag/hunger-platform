# Changelog

All notable changes to the Hunger Beauty Platform are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-04-19

### 🎉 First stable release — Hunger Beauty Platform v1.0.0

Complete single-tenant beauty-salon platform: Telegram bot + web admin panel + Mini App, ready for VPS deployment.

---

### Added

#### Platform foundation (Phase 0–2)
- Project scaffold: monorepo with `backend/`, `frontend/`, `deploy/` structure.
- Docker Compose stack: `caddy`, `postgres`, `redis`, `api`, `worker`, `web` (6 services).
- Caddy 2 with automatic Let's Encrypt TLS.
- `deploy/scripts/install.sh` — one-liner install for clean Ubuntu 22.04/24.04.
- `deploy/scripts/update.sh` — zero-downtime update preserving data volumes.
- `deploy/scripts/backup.sh` — pg_dump with 7/4/3 rotation.
- `.env.example` with all required variables documented.
- GitHub Actions CI: lint → typecheck → test → build Docker images.
- GitHub Actions release: publishes Docker images on `git tag vX.Y.Z`.

#### Data model (Phase 3)
- 20 PostgreSQL tables: `salon`, `settings`, `user`, `master`, `service`, `service_category`, `master_service`, `schedule_slot`, `client`, `client_note`, `booking`, `review`, `blacklist_entry`, `broadcast`, `broadcast_recipient`, `kb_document`, `kb_chunk`, `ai_conversation`, `ai_message`, `bot_visit_stat`, `audit_log`, `session`, `user_invite`.
- pgvector extension for embedding-based similarity search.
- All Alembic migrations auto-generated and tested.
- Seed script `backend/scripts/seed_init.py` creates owner, admin, master, reception accounts.

#### Authentication & RBAC (Phase 3)
- JWT access tokens (15 min) + refresh tokens (30 days) stored in `session` table.
- bcrypt password hashing (12 rounds), minimum 10 characters.
- 4 roles: `owner`, `admin`, `master`, `reception` with enforced per-endpoint RBAC.
- Rate limiting on `/auth/login`: 5 attempts → 15-minute IP block (slowapi).
- Refresh token rotation and revocation.
- Audit log for all sensitive actions.

#### Telegram Bot (Phase 5)
- aiogram 3 bot with webhook mode (no long polling in production).
- FSM booking flow: service → master → date → time → confirmation.
- Language selection screen (EN / RU / UK / BG) on first contact.
- 8 bot routers: `/start`, language, booking, my_bookings, profile, ai_consult, review, about.
- Inline keyboards only (no reply keyboards — preserves clean chat history).
- Throttle middleware (spam protection).
- Auto-create client record on first `/start`.

#### Admin Panel (Phases 4, 7, 9–14)
- Next.js 14 App Router, TypeScript strict, Tailwind CSS, shadcn/ui.
- Pages: Dashboard, Bookings, Clients, Masters, Services, Schedule, Broadcasts, Statistics, AI, Blacklist, Users, Settings, Audit Log.
- Dashboard KPI cards: today's bookings, revenue, new clients, top master.
- Booking calendar with drag-and-drop (admin + master views).
- Client card with KPI block, multi-note system (pinned notes, author tracking), booking history, reviews.
- Master management: CRUD, photo, assigned services with per-master price/duration override, schedule blocks.
- Service CRUD with 4-language name/description tabs, auto-translate via Gemini AI.
- Schedule: working slots, vacation, sick days, breaks, recurring rules.
- 3 UI themes: `minimal`, `friendly`, `premium` with primary color picker (hot-swap without reload).
- Master-role portal: personal dashboard, personal schedule management, personal client notes.

#### Services Real-Time Sync (Phase 7)
- Redis Pub/Sub channel `services:updates` — service visibility changes reflect in the bot **< 1 second**.
- Bot subscribes on startup via `services_cache.py`.
- Cache invalidation on create/update/delete/hide.

#### AI Consultant (Phase 7)
- Google Gemini 1.5 Flash as LLM; `text-embedding-004` for embeddings.
- RAG pipeline: document → chunk (500 token, 50 overlap) → pgvector → top-5 retrieval → prompt assembly.
- Supports PDF, DOCX, manual text, and URL sources.
- System prompt editable from admin UI.
- Rate limit: 20 messages/hour per client (Redis or DB fallback).
- AI-enabled/disabled toggle in Settings.
- Test-chat in admin KB editor shows cited chunks.
- AI conversation history stored and viewable in admin.

#### Reminders & Notifications (Phase 6)
- ARQ worker with cron jobs.
- Booking reminders at configurable intervals (default: 24h, 2h, 30min before).
- Post-visit review request (configurable delay, default 2h after booking ends).
- Cancellation notifications to client and admin.

#### Broadcasts (Phase 10)
- 12 audience segments: all, new, inactive N days, birthday week/month, by service, by master, VIP, sleeping, regular, by tag, by language, no-show.
- Telegram rate limiter (30 msg/sec built-in).
- Scheduled delivery.
- Delivery stats: sent / delivered / failed.
- WYSIWYG message editor with emoji picker, media upload, inline buttons.
- AI auto-translate draft for all 4 languages.

#### Statistics (Phase 11)
- Booking overview: total, confirmed, cancelled, no-show, avg check.
- Revenue trend chart (daily), heatmap (hour × weekday).
- Master performance: revenue, bookings, rating, cancellation %, occupancy.
- Service popularity: top-N by revenue and count; dead services (0 bookings in N days).
- Bot funnel: unique visitors, new joins, started/completed booking, AI sessions.
- Retention: 30/60/90-day repeat visit tracking.
- XLSX and PDF export of payroll reports.

#### Internationalization (Phase 9)
- 4 languages throughout: English, Русский, Українська, Български.
- Bot: aiogram-i18n + Fluent (`.ftl` files).
- Frontend: next-intl + JSON message files.
- Database: all user-facing strings stored as JSONB `{en,ru,uk,bg}`.
- ICU plural rules, date/currency formatting per locale.
- 100% key coverage verified by i18n-checker agent.

#### Mini App (Phase 13)
- Telegram Mini App at `/mini-app/*` (Next.js routes).
- HMAC verification of `initData` from Telegram.
- Pages: services showcase, master cards with ratings, booking calendar.

#### Security (Phase 12)
- HTTPS enforced via Caddy + Let's Encrypt.
- Telegram webhook HMAC verification (`X-Telegram-Bot-Api-Secret-Token`).
- CSP headers via Next.js.
- PII masking in structured logs.
- Integration tokens (bot_token, SMTP password) masked in admin UI.
- Secrets exclusively via `.env`, never committed to repository.

---

### Changed
- N/A (initial release)

---

### Fixed
- N/A (initial release)

---

### Infrastructure
- Docker multi-stage builds for both `api` and `web` images.
- Health checks: `/healthz` (FastAPI — checks pg + redis), `/readyz` (Next.js).
- Structured JSON logging via structlog + loguru.
- Alembic migrations run automatically on container startup.

---

### Test Coverage
- Backend: **≥ 70%** statement coverage (pytest + testcontainers).
- Frontend: Vitest unit tests for core hooks and utilities.
- End-to-end: 7 Playwright scenarios covering login, booking creation, client notes, settings, theme switching, responsiveness, and a11y basics.

---

### Known Limitations (Out of Scope for v1.0)
- No multi-salon support (single-tenant by design).
- Group services ("4-hands" treatments) not implemented.
- POS/fiscal integration (ФЗ-54, etc.) not included.
- Public website (only Telegram Mini App).
- 2FA for owner account (planned for v1.1).
- Stripe / LiqPay / ePay payment adapters are scaffolded but not fully tested in production.

---

## [Unreleased]

### Planned for v1.1
- 2FA (TOTP) for owner account.
- Gallery of works (Mini App).
- AI booking (allow AI to create bookings on behalf of client).
- Stripe payment adapter production-ready.
- Multi-image upload for services.
- Client birthday auto-message.
