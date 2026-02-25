-- При проведении новой услуги (начисления) сразу делаем все проводки:
-- 1) Дт 62 Кт 98 на всю сумму
-- 2) Дт 98 Кт 90 понедельно на весь период (все недели сразу)
-- По существующим начислениям ничего не делаем. Еженедельный cron отключаем.

CREATE OR REPLACE FUNCTION public.post_charge_entry()
RETURNS TRIGGER
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
    COALESCE(NEW.start_date, (NEW.created_at AT TIME ZONE 'UTC')::date),
    '62', '98', NEW.amount,
    NEW.client_id, NEW.service_name, 'charge', NEW.id, ''
  );

  -- Дт 98 Кт 90 понедельно на весь период (сразу все проводки)
  start_d := COALESCE(NEW.start_date, (NEW.created_at AT TIME ZONE 'UTC')::date);
  end_d := COALESCE(NEW.end_date, start_d);
  start_monday := public.week_monday(start_d);
  end_monday := public.week_monday(end_d);
  num_weeks := GREATEST(1, (end_monday - start_monday) / 7 + 1);
  amount_per_week := NEW.amount / num_weeks;
  week_cursor := start_monday;

  WHILE week_cursor <= end_monday LOOP
    INSERT INTO public.journal_entries (
      entry_date, debit_account_code, credit_account_code, amount,
      client_id, service_name, document_type, document_id, document_extra
    ) VALUES (
      week_cursor, '98', '90', amount_per_week,
      NEW.client_id, NEW.service_name, 'weekly_recognition', NEW.id, week_cursor::text
    );
    week_cursor := week_cursor + 7;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Отключить еженедельный cron (проводки теперь создаются при добавлении начисления)
DO $$
DECLARE
  jid BIGINT;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'weekly-revenue-recognition' LIMIT 1;
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN OTHERS THEN NULL;
END
$$;
