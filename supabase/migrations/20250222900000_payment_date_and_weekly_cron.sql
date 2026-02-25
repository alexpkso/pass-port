-- 1) Поле даты оплаты: оплата проводится в определённый день
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_date DATE;

UPDATE public.payments
SET payment_date = (created_at AT TIME ZONE 'UTC')::date
WHERE payment_date IS NULL;

ALTER TABLE public.payments ALTER COLUMN payment_date SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT (CURRENT_DATE);

COMMENT ON COLUMN public.payments.payment_date IS 'Дата проведения оплаты';

-- Проводки по оплатам использовать payment_date
CREATE OR REPLACE FUNCTION public.post_payment_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.journal_entries (
    entry_date, debit_account_code, credit_account_code, amount,
    client_id, service_name, document_type, document_id, document_extra
  ) VALUES (
    NEW.payment_date,
    '51', '62', NEW.amount,
    NEW.client_id, NEW.service_name, 'payment', NEW.id, ''
  );
  RETURN NEW;
END;
$$;

-- Обновить даты в уже созданных проводках по оплатам (по новой колонке)
UPDATE public.journal_entries j
SET entry_date = p.payment_date
FROM public.payments p
WHERE j.document_type = 'payment' AND j.document_id = p.id AND j.entry_date IS DISTINCT FROM p.payment_date;

-- При изменении даты/суммы оплаты — обновить проводку (дата и сумма)
CREATE OR REPLACE FUNCTION public.sync_payment_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.journal_entries
  SET entry_date = NEW.payment_date, amount = NEW.amount, service_name = NEW.service_name
  WHERE document_type = 'payment' AND document_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_sync ON public.payments;
CREATE TRIGGER trg_payments_sync
  AFTER UPDATE OF payment_date, amount, service_name ON public.payments
  FOR EACH ROW
  WHEN (OLD.payment_date IS DISTINCT FROM NEW.payment_date OR OLD.amount IS DISTINCT FROM NEW.amount OR OLD.service_name IS DISTINCT FROM NEW.service_name)
  EXECUTE FUNCTION public.sync_payment_entry();

-- 2) Бэкфилл проводок Дт 98 Кт 90 с начала оказания услуг по текущую дату (идемпотентно)
SELECT public.run_weekly_revenue_recognition();

-- 3) Еженедельное автоматическое признание выручки (каждый понедельник в 00:00 UTC)
-- Включите pg_cron в Dashboard: Integrations → Cron, если расширение ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job с именем weekly-revenue-recognition при повторном запуске перезапишется
SELECT cron.schedule(
  'weekly-revenue-recognition',
  '0 0 * * 1',
  $$SELECT public.run_weekly_revenue_recognition()$$
);
