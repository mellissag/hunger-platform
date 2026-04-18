# REST API Specification

Префикс: `/api/v1`.
Формат: JSON.
Аутентификация: `Authorization: Bearer <access_token>`.
Ошибки: `{"error": "code", "message": "human readable", "details": {...}}`.
Пагинация: `?page=1&page_size=20` в query, `{"items": [...], "total": N, "page": 1, "page_size": 20}` в ответе.

---

## 0. Auth

| Метод | Путь | Роль | Описание |
|---|---|---|---|
| POST | `/auth/login` | public | email+password → access+refresh |
| POST | `/auth/refresh` | public | refresh → new access |
| POST | `/auth/logout` | any | отозвать refresh |
| GET | `/auth/me` | any | профиль текущего |
| POST | `/auth/password-reset/request` | public | запрос сброса |
| POST | `/auth/password-reset/confirm` | public | подтверждение |

---

## 1. Users (staff accounts)

| Метод | Путь | Роль |
|---|---|---|
| GET | `/users` | owner |
| POST | `/users` | owner |
| GET | `/users/:id` | owner |
| PATCH | `/users/:id` | owner |
| DELETE | `/users/:id` | owner |
| POST | `/users/:id/invite` | owner |
| POST | `/users/:id/revoke-sessions` | owner |

---

## 2. Clients

| Метод | Путь | Роль |
|---|---|---|
| GET | `/clients` | owner/admin/reception (master → свои) |
| POST | `/clients` | owner/admin/reception |
| GET | `/clients/:id` | owner/admin/reception (master — если был у него) |
| PATCH | `/clients/:id` | owner/admin/reception |
| DELETE | `/clients/:id` | owner |
| POST | `/clients/import` | owner/admin (XLSX/CSV) |
| GET | `/clients/export` | owner/admin |
| POST | `/clients/:id/message` | owner/admin/reception (личное сообщение в ТГ) |

### Client notes

| Метод | Путь | Роль |
|---|---|---|
| GET | `/clients/:id/notes` | owner/admin/reception/master (master — свои) |
| POST | `/clients/:id/notes` | owner/admin/reception/master |
| PATCH | `/clients/:id/notes/:note_id` | author or owner/admin |
| DELETE | `/clients/:id/notes/:note_id` | author or owner/admin |
| POST | `/clients/:id/notes/:note_id/pin` | owner/admin/reception |

---

## 3. Masters

| Метод | Путь | Роль |
|---|---|---|
| GET | `/masters` | any auth |
| POST | `/masters` | owner/admin |
| GET | `/masters/:id` | any auth |
| PATCH | `/masters/:id` | owner/admin (master — только свой) |
| DELETE | `/masters/:id` | owner |
| GET | `/masters/:id/services` | any auth |
| PUT | `/masters/:id/services` | owner/admin (массовое назначение) |
| GET | `/masters/:id/stats?from=&to=` | owner/admin (master — свои) |

---

## 4. Services

| Метод | Путь | Роль |
|---|---|---|
| GET | `/service-categories` | any |
| POST | `/service-categories` | owner/admin |
| PATCH | `/service-categories/:id` | owner/admin |
| DELETE | `/service-categories/:id` | owner/admin |
| POST | `/service-categories/reorder` | owner/admin |
| GET | `/services` | any |
| POST | `/services` | owner/admin |
| GET | `/services/:id` | any |
| PATCH | `/services/:id` | owner/admin |
| DELETE | `/services/:id` | owner/admin |
| POST | `/services/:id/translate` | owner/admin (AI auto-translate) |

---

## 5. Schedule

| Метод | Путь | Роль |
|---|---|---|
| GET | `/schedule/slots?master_id=&service_id=&date=` | any (публично — для бота/miniapp) |
| GET | `/schedule/calendar?from=&to=&master_id?` | owner/admin/reception (master → свой) |
| POST | `/schedule/blocks` | owner/admin (master — свои) |
| PATCH | `/schedule/blocks/:id` | owner/admin (master — свои) |
| DELETE | `/schedule/blocks/:id` | owner/admin (master — свои) |
| GET | `/schedule/working-hours/:master_id` | any auth |
| PUT | `/schedule/working-hours/:master_id` | owner/admin (master — свои) |

---

## 6. Bookings

| Метод | Путь | Роль |
|---|---|---|
| GET | `/bookings?from=&to=&master_id?&service_id?&status?&client_id?` | owner/admin/reception (master — свои) |
| POST | `/bookings` | owner/admin/reception (master — свои клиенты) |
| GET | `/bookings/:id` | owner/admin/reception (master — свои) |
| PATCH | `/bookings/:id` | same |
| POST | `/bookings/:id/cancel` | same |
| POST | `/bookings/:id/reschedule` | same |
| POST | `/bookings/:id/complete` | owner/admin/reception/master (своя) |
| POST | `/bookings/:id/no-show` | owner/admin/reception/master (своя) |
| GET | `/bookings/export?from=&to=` | owner/admin |

---

## 7. Reviews

| Метод | Путь | Роль |
|---|---|---|
| GET | `/reviews?master_id?&published=true` | owner/admin (мастер — свои) |
| GET | `/reviews/:id` | same |
| PATCH | `/reviews/:id/publish` | owner/admin |
| DELETE | `/reviews/:id` | owner |

---

## 8. Blacklist

| Метод | Путь | Роль |
|---|---|---|
| GET | `/blacklist` | owner/admin |
| POST | `/blacklist` | owner/admin |
| PATCH | `/blacklist/:id` | owner/admin |
| DELETE | `/blacklist/:id` | owner/admin |
| GET | `/blacklist/check?tg_user_id=` | internal (bot) |

---

## 9. Broadcasts

| Метод | Путь | Роль |
|---|---|---|
| GET | `/broadcasts` | owner/admin |
| POST | `/broadcasts` | owner/admin |
| GET | `/broadcasts/:id` | owner/admin |
| PATCH | `/broadcasts/:id` | owner/admin (только draft/scheduled) |
| DELETE | `/broadcasts/:id` | owner/admin |
| POST | `/broadcasts/:id/send` | owner/admin |
| POST | `/broadcasts/:id/cancel` | owner/admin |
| POST | `/broadcasts/:id/duplicate` | owner/admin |
| GET | `/broadcasts/:id/stats` | owner/admin |
| POST | `/broadcasts/:id/translate` | owner/admin (AI auto-translate) |

### Segments

| Метод | Путь | Роль |
|---|---|---|
| POST | `/segments/preview` | owner/admin — `{criteria: {...}}` → count + sample |
| GET | `/segments/presets` | owner/admin |

---

## 10. Statistics

| Метод | Путь | Роль |
|---|---|---|
| GET | `/stats/overview?from=&to=` | owner/admin |
| GET | `/stats/bot?from=&to=` | owner/admin |
| GET | `/stats/masters?from=&to=` | owner/admin |
| GET | `/stats/services?from=&to=` | owner/admin |
| GET | `/stats/finance?from=&to=` | owner/admin |
| GET | `/stats/my?from=&to=` | master (своя) |
| GET | `/stats/export?format=xlsx|pdf&kind=finance` | owner/admin |

---

## 11. AI

| Метод | Путь | Роль |
|---|---|---|
| GET | `/ai/settings` | owner/admin |
| PATCH | `/ai/settings` | owner/admin (prompt, temperature, model, enabled) |
| POST | `/ai/test` | owner/admin — `{question}` → `{answer, cited_chunks}` |
| GET | `/ai/kb/documents` | owner/admin |
| POST | `/ai/kb/documents` | owner/admin (upload PDF/DOCX/TXT or manual) |
| GET | `/ai/kb/documents/:id` | owner/admin |
| PATCH | `/ai/kb/documents/:id` | owner/admin |
| DELETE | `/ai/kb/documents/:id` | owner/admin |
| POST | `/ai/kb/documents/:id/reindex` | owner/admin |
| GET | `/ai/conversations?flagged?` | owner/admin |
| GET | `/ai/conversations/:id` | owner/admin |
| POST | `/ai/messages/:id/flag` | internal (bot) / owner/admin |

---

## 12. Settings (owner only)

| Метод | Путь |
|---|---|
| GET | `/settings` |
| PATCH | `/settings` (partial update любого блока) |
| POST | `/settings/brand/logo` (upload) |
| POST | `/settings/brand/cover` (upload) |
| POST | `/settings/brand/favicon` (upload) |
| POST | `/settings/telegram/check` (ping бота) |
| POST | `/settings/payment/test` (проверка ключей) |
| POST | `/settings/smtp/test` (тестовое письмо) |
| POST | `/settings/backup/create` |
| GET | `/settings/backup/list` |
| GET | `/settings/backup/download/:file` |
| GET | `/settings/license` |

---

## 13. Audit log (owner only)

| Метод | Путь |
|---|---|
| GET | `/audit-log?user_id?&action?&from?&to?` |
| GET | `/audit-log/:id` |
| GET | `/audit-log/export?format=xlsx` |

---

## 14. Bot (internal)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/tg/webhook/:secret` | Telegram webhook |
| POST | `/miniapp/auth` | валидация initData, выдача short-lived token |
| GET | `/miniapp/salon` | публичная инфа салона |
| GET | `/miniapp/services` | публичный список услуг |
| GET | `/miniapp/masters` | публичный список мастеров |
| GET | `/miniapp/schedule/slots` | публичные слоты |
| POST | `/miniapp/bookings` | публичная запись (через initData) |

---

## 15. Uploads

| Метод | Путь | Роль |
|---|---|---|
| POST | `/uploads/image` | owner/admin/master (+reception для клиентов) |
| DELETE | `/uploads/:id` | owner/admin |

Валидация: MIME, размер 5MB, ресайз до 2000px по длинной стороне, WebP.

---

## 16. Health

| Метод | Путь |
|---|---|
| GET | `/healthz` (pg + redis ping) |
| GET | `/readyz` (webhook status) |
| GET | `/metrics` (Prometheus, опц.) |

---

## Общие правила

- **Пагинация**: `page` (1-based), `page_size` (default 20, max 100).
- **Сортировка**: `?sort=field,-other_field` (знак `-` — desc).
- **Поиск**: `?q=...` на списках (ILIKE по нескольким полям).
- **Фильтры** — отдельные query params; сложные — `?filter={json}` для сегментов.
- **Идемпотентность мутаций**: для POST/PATCH — опциональный заголовок `Idempotency-Key`.
- **Версионирование**: новый breaking → `/api/v2`.
- **OpenAPI**: auto-generated FastAPI, доступен на `/api/v1/docs` (только dev + owner в prod).
