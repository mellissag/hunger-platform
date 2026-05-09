-- Emergency seed: one category + one service + M2M link.
-- Run AFTER: alembic upgrade head (table service_category_link must exist).
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/seed_minimal_catalog.sql

BEGIN;

DO $$
DECLARE
  cid uuid := gen_random_uuid();
  sid uuid := gen_random_uuid();
BEGIN
  INSERT INTO service_category (id, name_i18n, icon, sort_order, created_at)
  VALUES (
    cid,
    '{"ru":"SYNCHRO","en":"SYNCHRO","uk":"SYNCHRO","bg":"SYNCHRO"}'::jsonb,
    '✨',
    0,
    now()
  );

  INSERT INTO service (
    id,
    category_id,
    name_i18n,
    description_i18n,
    duration_minutes,
    duration_type,
    duration_max_minutes,
    price,
    photo_url,
    is_active,
    sort_order,
    created_at,
    updated_at
  )
  VALUES (
    sid,
    cid,
    '{"ru":"Базовая услуга","en":"Base service","uk":"Базова послуга","bg":"Базова услуга"}'::jsonb,
    '{"ru":"","en":"","uk":"","bg":""}'::jsonb,
    60,
    'fixed',
    NULL,
    49.00,
    NULL,
    true,
    0,
    now(),
    now()
  );

  INSERT INTO service_category_link (service_id, category_id)
  VALUES (sid, cid);
END $$;

COMMIT;
