-- При изменении начисления (даты, сумма, услуга) пересоздаём проводки, чтобы карточка счёта 62 использовала новые даты

-- Общая функция: записать проводки по начислению (по id и данным строки)
CREATE OR REPLACE FUNCTION public.write_charge_journal(
  p_id BIGINT,
  p_client_id BIGINT,
  p_service_name TEXT,
  p_amount NUMERIC,
  p_start_date DATE,
  p_end_date DATE,
  p_created_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_monday DATE;
  end_monday DATE;
  num_weeks INT;
  amount_per_week NUMERIC(12,2);
  week_cursor DATE;
  start_d DATE;
  end_d DATE;
BEGIN
  -- Дт 62 Кт 98 на всю сумму
  INSERT INTO public.journal_entries (
    entry_date, debit_account_code, credit_account_code, amount,
    client_id, service_name, document_type, document_id, document_extra
  ) VALUES (
    COALESCE(p_start_date, (p_created_at AT TIME ZONE 'UTC')::date),
    '62', '98', p_amount,
    p_client_id, p_service_name, 'charge', p_id, ''
  );

  -- Дт 98 Кт 90 понедельно на весь период
  start_d := COALESCE(p_start_date, (p_created_at AT TIME ZONE 'UTC')::date);
  end_d := COALESCE(p_end_date, start_d);
  start_monday := public.week_monday(start_d);
  end_monday := public.week_monday(end_d);
  num_weeks := GREATEST(1, (end_monday - start_monday) / 7 + 1);
  amount_per_week := p_amount / num_weeks;
  week_cursor := start_monday;

  WHILE week_cursor <= end_monday LOOP
    INSERT INTO public.journal_entries (
      entry_date, debit_account_code, credit_account_code, amount,
      client_id, service_name, document_type, document_id, document_extra
    ) VALUES (
      week_cursor, '98', '90', amount_per_week,
      p_client_id, p_service_name, 'weekly_recognition', p_id, week_cursor::text
    );
    week_cursor := week_cursor + 7;
  END LOOP;
END;
$$;

-- Триггер INSERT: как раньше, но через общую функцию
CREATE OR REPLACE FUNCTION public.post_charge_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_charge_journal(
    NEW.id, NEW.client_id, NEW.service_name, NEW.amount,
    NEW.start_date, NEW.end_date, NEW.created_at
  );
  RETURN NEW;
END;
$$;

-- При UPDATE начисления: удалить старые проводки и записать новые по обновлённым датам/сумме
CREATE OR REPLACE FUNCTION public.on_charge_update_sync_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.start_date IS NOT DISTINCT FROM NEW.start_date
     AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date
     AND OLD.amount IS NOT DISTINCT FROM NEW.amount
     AND OLD.service_name IS NOT DISTINCT FROM NEW.service_name THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.journal_entries
  WHERE (document_type = 'charge' AND document_id = OLD.id)
     OR (document_type = 'weekly_recognition' AND document_id = OLD.id);
  PERFORM public.write_charge_journal(
    NEW.id, NEW.client_id, NEW.service_name, NEW.amount,
    NEW.start_date, NEW.end_date, NEW.created_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_charge_update_journal ON public.charges;
CREATE TRIGGER trg_charge_update_journal
  AFTER UPDATE OF start_date, end_date, amount, service_name ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.on_charge_update_sync_journal();
