-- Упрощённый план счетов и проводки (аналитика: клиент + договор/услуга)
-- 62 — расчёты с клиентами, 51 — расчётный счёт, 98 — доходы будущих периодов, 90 — выручка

-- План счетов
CREATE TABLE IF NOT EXISTS public.accounts (
  id SMALLSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

COMMENT ON TABLE public.accounts IS 'Упрощённый план счетов';
INSERT INTO public.accounts (code, name) VALUES
  ('62', 'Расчёты с клиентами'),
  ('51', 'Расчётный счёт'),
  ('98', 'Доходы будущих периодов'),
  ('90', 'Выручка')
ON CONFLICT (code) DO NOTHING;

-- Журнал проводок (аналитика: client_id, service_name — договор/услуга)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  debit_account_code TEXT NOT NULL,
  credit_account_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('charge', 'payment', 'weekly_recognition')),
  document_id BIGINT NOT NULL,
  document_extra TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_type, document_id, document_extra)
);

COMMENT ON TABLE public.journal_entries IS 'Проводки: аналитика по клиенту и договору (услуге)';
CREATE INDEX IF NOT EXISTS idx_journal_entries_client ON public.journal_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_doc ON public.journal_entries(document_type, document_id);

-- При начислении: Дт 62 Кт 98 на всю сумму
CREATE OR REPLACE FUNCTION public.post_charge_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.journal_entries (
    entry_date, debit_account_code, credit_account_code, amount,
    client_id, service_name,     document_type, document_id, document_extra
  ) VALUES (
    COALESCE(NEW.start_date, (NEW.created_at AT TIME ZONE 'UTC')::date),
    '62', '98', NEW.amount,
    NEW.client_id, NEW.service_name, 'charge', NEW.id, ''
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_charges_post ON public.charges;
CREATE TRIGGER trg_charges_post
  AFTER INSERT ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.post_charge_entry();

-- При оплате: Дт 51 Кт 62
CREATE OR REPLACE FUNCTION public.post_payment_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.journal_entries (
    entry_date, debit_account_code, credit_account_code, amount,
    client_id, service_name,     document_type, document_id, document_extra
  ) VALUES (
    (NEW.created_at AT TIME ZONE 'UTC')::date,
    '51', '62', NEW.amount,
    NEW.client_id, NEW.service_name, 'payment', NEW.id, ''
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_post ON public.payments;
CREATE TRIGGER trg_payments_post
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.post_payment_entry();

-- Понедельник недели (ISO) для даты
CREATE OR REPLACE FUNCTION public.week_monday(d DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('week', d::timestamp)::date;
$$;

-- Еженедельное признание выручки: Дт 98 Кт 90 по распределённой сумме за неделю.
-- Вызывать вручную или по крону в конце недели. Идемпотентно: не создаёт дубликаты по (charge_id, week).
CREATE OR REPLACE FUNCTION public.run_weekly_revenue_recognition()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  start_monday DATE;
  end_monday DATE;
  current_monday DATE;
  num_weeks INT;
  amount_per_week NUMERIC(12,2);
  week_cursor DATE;
  inserted_count INT := 0;
  rc INT;
BEGIN
  current_monday := public.week_monday(CURRENT_DATE);

  FOR r IN
    SELECT c.id, c.client_id, c.service_name, c.amount,
           COALESCE(c.start_date, (c.created_at AT TIME ZONE 'UTC')::date) AS start_date,
           COALESCE(c.end_date, COALESCE(c.start_date, (c.created_at AT TIME ZONE 'UTC')::date)) AS end_date
    FROM public.charges c
  LOOP
    start_monday := public.week_monday(r.start_date);
    end_monday := public.week_monday(r.end_date);
    num_weeks := GREATEST(1, (end_monday - start_monday) / 7 + 1);
    amount_per_week := r.amount / num_weeks;
    week_cursor := start_monday;

    WHILE week_cursor <= end_monday AND week_cursor <= current_monday LOOP
      INSERT INTO public.journal_entries (
        entry_date, debit_account_code, credit_account_code, amount,
        client_id, service_name, document_type, document_id, document_extra
      ) VALUES (
        week_cursor, '98', '90', amount_per_week,
        r.client_id, r.service_name, 'weekly_recognition', r.id, week_cursor::text
      )
      ON CONFLICT (document_type, document_id, document_extra) DO NOTHING;
      GET DIAGNOSTICS rc = ROW_COUNT;
      inserted_count := inserted_count + rc;
      week_cursor := week_cursor + 7;
    END LOOP;
  END LOOP;

  RETURN inserted_count;
END;
$$;

COMMENT ON FUNCTION public.run_weekly_revenue_recognition() IS 'Создаёт проводки Дт 98 Кт 90 понедельно по всем начислениям (в конце недели вызывать вручную или по крону).';

-- Бэкфилл: проводки по уже существующим начислениям и оплатам, затем признание выручки по прошедшим неделям
INSERT INTO public.journal_entries (entry_date, debit_account_code, credit_account_code, amount, client_id, service_name, document_type, document_id, document_extra)
SELECT
  COALESCE(c.start_date, (c.created_at AT TIME ZONE 'UTC')::date),
  '62', '98', c.amount, c.client_id, c.service_name, 'charge', c.id, ''
FROM public.charges c
WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.document_type = 'charge' AND j.document_id = c.id);

INSERT INTO public.journal_entries (entry_date, debit_account_code, credit_account_code, amount, client_id, service_name, document_type, document_id, document_extra)
SELECT
  (p.created_at AT TIME ZONE 'UTC')::date, '51', '62', p.amount, p.client_id, p.service_name, 'payment', p.id, ''
FROM public.payments p
WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.document_type = 'payment' AND j.document_id = p.id);

SELECT public.run_weekly_revenue_recognition();
