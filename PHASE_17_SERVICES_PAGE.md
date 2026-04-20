# PHASE 17 — Services Page · Premium Light Redesign

## Контекст

Проект Hunger Beauty Platform — single-tenant шаблон для салонов красоты.
Phase 16 выполнена: тема Premium Light подключена, Dashboard переделан.
Теперь переделываем страницу **Услуги** (`/services`) под Premium Light дизайн.

Прочитай для контекста:
@01_MASTER_SPEC.md раздел 7.8 (Services CRUD)
@design/admin_premium_light.html ← референс дизайна (страница Услуг уже там)
@05_API_SPEC.md раздел /services

---

## Задача

Переделать страницу `/app/(admin)/services/page.tsx` и связанные компоненты
по дизайну из `design/admin_premium_light.html`.

---

## 1. Структура страницы (точно по дизайну)

### 1.1. Page Header

```
[· Управление услугами ·]          ← page-subtitle, uppercase, muted
[Коллекция услуг]                  ← page-title, Playfair Display 32px
[— ✦ —]                            ← декоративный ornament
[Воскресенье, 19 апреля · Sofia]   ← текущая дата + город из настроек

                    [sync-badge: Бот синхронизирован]
                    [Экспорт ↓]  [+ Добавить услугу]
```

**sync-badge** — зелёный pill-бейдж с точкой. Показывает что Redis Pub/Sub активен.
Получать статус: `GET /api/health` → поле `redis: true/false`.

---

### 1.2. KPI Grid — 4 карточки

| Label | Value | API поле |
|---|---|---|
| Всего услуг | число | `GET /api/services/stats` → `total` |
| Активны в боте | число | → `active` |
| Записей за месяц | число | → `bookings_month` |
| Выручка / услуга | `€ N` | → `avg_revenue` |

**Дизайн KPI карточки:**
- Золотая подпись сверху (10px, uppercase, letter-spacing)
- Число — Playfair Display 36px
- Тренд — цветная строчка: `↗ +2 за месяц` (success) / `↘ -1` (danger)
- При hover: `translateY(-2px)`, усиленная тень, золотая линия 2px сверху появляется

---

### 1.3. Аналитика — строка из 2 карточек

**Левая (2/3 ширины) — «Популярность услуг»:**
- Заголовок + subtitle «записей за 30 дней»
- Правый край: dropdown «По выручке ▾»
- SVG линейный график (или recharts LineChart) с градиентной заливкой под кривой
- Цвет линии: `#9A7230`, gradient fill от rgba(154,114,48,.18) до transparent
- Горизонтальные пунктирные линии сетки: `stroke="#E4DDD0" stroke-dasharray="2 4"`
- Точки на пиках: circle r=4, fill=#9A7230, stroke=#fff stroke-width=2
- Легенда внизу: цветные точки + названия

**Правая (1/3 ширины) — «По категориям»:**
- Donut chart (recharts PieChart с innerRadius)
- Цвета: `#9A7230, #C9A96E, #B8A888, #C8BFA8, #E4DDD0`
- В центре donut: число (всего записей)
- Легенда справа: название категории + процент

---

### 1.4. Services CRUD — основной блок

**Toolbar (над сеткой):**

```
[Все] [Волосы] [Ногти] [Уход] [Брови]    ←→    [🔍 Поиск…]
```

- Filter tabs: pill-кнопки, активная — фон `--primary`, текст белый
- Поиск — поле с иконкой лупы, `width: 240px`
- Категории загружать из `GET /api/services/categories`

**Сетка услуг — 3 колонки:**

Каждая карточка `.svc-card`:

```
┌─────────────────────────────────────┐
│ [Название услуги]     [✏️] [🗑️]      │  ← svc-name (Playfair), кнопки
│ [КАТЕГОРИЯ]                         │  ← svc-cat (uppercase, gold, 10px)
│                                     │
│ 35 €                                │  ← svc-price (Playfair 24px, gold)
│ ─────────────────────────────────── │  ← dotted border-top
│ Длит.: 60 мин  Мастеров: 3  Броней: 42 │
│                                     │
│ [toggle] Активна в боте             │  ← зелёный toggle = включён
└─────────────────────────────────────┘
```

**Toggle «Активна в боте»:**
- Зелёный (success) = активна → `PUT /api/services/{id}` `{is_active: true}`
- Серый (border) = скрыта → `{is_active: false}`
- После переключения: Redis Pub/Sub уведомляет бота (backend делает это автоматически)
- Карточка скрытой услуги: `opacity: 0.65`

**Кнопка редактирования** → открывает `<ServiceDrawer>` (см. раздел 3)
**Кнопка удаления** → открывает `<DeleteConfirmModal>` (см. раздел 4)

**Последний элемент сетки — карточка «+ Добавить услугу»:**
```
┌─────────────────────────────────────┐
│          [+ иконка]                 │
│        Добавить услугу              │  ← dashed border, muted bg
└─────────────────────────────────────┘
```
Click → открывает `<ServiceDrawer>` в режиме создания.

**Под сеткой — info-строка:**
```
ℹ️ Изменения синхронизируются с Telegram-ботом мгновенно через Redis Pub/Sub.
   Переключатель «Скрыта в боте» убирает услугу из меню записи — история сохраняется.
```

---

## 2. API endpoints (уже реализованы в Phase 1-15)

```
GET  /api/services                  → список услуг (+ фильтр ?category_id=&search=)
GET  /api/services/categories       → список категорий
GET  /api/services/stats            → { total, active, bookings_month, avg_revenue }
POST /api/services                  → создать услугу
PUT  /api/services/{id}             → обновить (включая is_active)
DELETE /api/services/{id}           → удалить (soft delete)
GET  /api/health                    → { redis: bool, ... }
```

---

## 3. ServiceDrawer — боковая панель создания/редактирования

Компонент `<ServiceDrawer open={bool} serviceId={id|null} onClose={fn} />`

**Поля формы** (react-hook-form + zod):

```
Название услуги:
  [Tabs: RU | EN | UK | BG]
  [input]  ← на активном языке, остальные ниже collapsed

Описание:
  [Tabs: RU | EN | UK | BG]
  [textarea]

Категория:       [select — из GET /api/services/categories]
Цена (€):        [number input]
Длительность:    [number input] мин
Фото:            [upload area с превью]
Мастера:         [multi-select checkboxes] — кто выполняет услугу
Сортировка:      [number]
Активна в боте:  [toggle]

[Кнопка "Автоперевод AI"] → POST /api/ai/translate {text, source_lang, target_langs: ['en','ru','uk','bg']}
  → заполняет поля остальных языков как черновик
```

**Кнопки drawer:**
- `Отмена` — закрыть без сохранения
- `Сохранить` — POST или PUT → закрыть → обновить список

**Стиль drawer:**
- Ширина: `480px`, слайдит справа
- Заголовок: «Новая услуга» / «Редактировать услугу» — Playfair Display
- Overlay: `rgba(28,20,9,.3)` backdrop
- Цвета и стиль: Premium Light (--card фон, --border рамки, gold акценты)

---

## 4. DeleteConfirmModal

```tsx
// Двухшаговое подтверждение удаления

Шаг 1: Показать диалог:
  "Удалить «{service.name}»?"
  Если есть будущие брони → красный блок:
  "⚠️ У этой услуги {N} подтверждённых записей.
   Удаление недоступно пока есть активные брони."
   [Отмена] — единственная кнопка

  Если броней нет:
  "Услуга будет скрыта из бота. История броней сохраняется."
  [Отмена] [Удалить]

Шаг 2 (если нажал Удалить):
  Кнопка "Удалить" становится loading
  DELETE /api/services/{id}
  Успех → закрыть модал → убрать карточку из списка
```

---

## 5. Файловая структура

```
frontend/src/
├── app/(admin)/services/
│   └── page.tsx                    ← главная страница (переделать)
├── components/services/
│   ├── ServiceCard.tsx             ← карточка услуги
│   ├── ServiceDrawer.tsx           ← боковая панель создания/редактирования
│   ├── ServiceDeleteModal.tsx      ← модал подтверждения удаления
│   ├── ServiceFilterTabs.tsx       ← фильтр по категориям
│   ├── ServicesKPI.tsx             ← 4 KPI карточки
│   ├── ServicesChart.tsx           ← график + pie chart
│   └── ServiceToggle.tsx           ← toggle is_active с optimistic update
├── hooks/
│   ├── useServices.ts              ← TanStack Query: список, CRUD
│   └── useServiceStats.ts          ← KPI данные
```

---

## 6. Важные детали реализации

### Optimistic update для toggle
При переключении тогла — немедленно менять UI, не ждать ответа сервера.
Если запрос упал — откатить toggle обратно + показать toast «Ошибка синхронизации».

### Sync badge
```tsx
const { data: health } = useQuery(['health'], () => api.get('/health'), {
  refetchInterval: 30_000  // проверять каждые 30 сек
})

// Показывать:
// health.redis === true → зелёный "Бот синхронизирован"
// health.redis === false → красный "Бот отключён"
```

### Пустое состояние
Если в категории нет услуг — показать:
```
[иконка тега]
Услуг в этой категории пока нет
[+ Добавить первую услугу]
```

### Скелетон загрузки
Пока грузится список — показывать 6 skeleton карточек (серые прямоугольники с анимацией pulse).

### Тема
Все стили через CSS переменные `--primary`, `--card`, `--border` и т.д.
Не хардкодить цвета напрямую — чтобы тема корректно переключалась.

---

## 7. Тесты

Написать тесты для:
```
- ServiceCard: рендер, toggle click → optimistic update
- ServiceDrawer: валидация формы (обязательные поля), submit
- DeleteModal: блокировка если есть брони
- useServices hook: invalidation после CRUD
```

---

## 8. Порядок выполнения

1. Создать хуки `useServices.ts`, `useServiceStats.ts`
2. Переделать `page.tsx` — layout, header, KPI grid, chart row, toolbar, grid
3. `ServiceCard.tsx` — карточка с toggle, кнопками
4. `ServiceToggle.tsx` — optimistic PUT + rollback
5. `ServicesKPI.tsx` — 4 карточки из /stats
6. `ServicesChart.tsx` — линейный + donut chart (recharts)
7. `ServiceDrawer.tsx` — форма с языковыми табами + автоперевод
8. `ServiceDeleteModal.tsx` — проверка броней + подтверждение
9. Тесты

---

## 9. Коммит

```bash
git add -A
git commit -m "feat(phase-17): services page premium light redesign + crud"
git push origin main
```

---

## Acceptance criteria

- [ ] Страница `/services` визуально соответствует `design/admin_premium_light.html`
- [ ] KPI карточки загружают реальные данные
- [ ] Фильтр по категориям работает (client-side + query param)
- [ ] Поиск фильтрует в реальном времени (debounce 300ms)
- [ ] Toggle «Активна в боте» работает с optimistic update
- [ ] Drawer создания: валидация, автоперевод AI, загрузка фото
- [ ] Drawer редактирования: поля предзаполнены текущими значениями
- [ ] Удаление: заблокировано если есть будущие брони
- [ ] sync-badge показывает реальный статус Redis
- [ ] Все стили через CSS переменные (тема переключается корректно)
- [ ] Skeleton при загрузке, empty state при пустой категории
