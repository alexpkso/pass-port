-- Исправление триггера UPDATE: при изменении начисления с заморозкой
-- правильно пересоздаём weekly_recognition с учётом периода паузы.

CREATE OR REPLACE FUNCTION public.on_charge_update_sync_journal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  first_monday    DATE;
  end_monday      DATE;
  current_monday  DATE;
  num_weeks       INT;
  pause_weeks     INT;
  amount_per_week NUMERIC(12,2);
  week_cursor     DATE;
  start_d         DATE;
  end_d           DATE;
BEGIN
  IF OLD.start_date IS NOT DISTINCT FROM NEW.start_date
     AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date
     AND OLD.amount IS NOT DISTINCT FROM NEW.amount
     AND OLD.service_name IS NOT DISTINCT FROM NEW.service_name THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF OLD.status = 'paused' AND (NEW.status IS NULL OR NEW.status != 'paused') THEN RETURN NEW; END IF;

  -- Удаляем старые проводки
  DELETE FROM public.journal_entries
  WHERE (document_type = 'charge' AND document_id = OLD.id)
     OR (document_type = 'weekly_recognition' AND document_id = OLD.id);

  -- Создаём Дт 62 Кт 98
  PERFORM public.write_charge_journal(
    NEW.id, NEW.client_id, NEW.service_name, NEW.amount,
    NEW.start_date, NEW.end_date, NEW.created_at
  );

  -- Бэкфилл прошедших недель с учётом заморозки
  start_d        := COALESCE(NEW.start_date, (NEW.created_at AT TIME ZONE 'UTC')::date);
  end_d          := COALESCE(NEW.end_date, start_d);
  current_monday := public.week_monday(CURRENT_DATE);
  first_monday   := public.first_monday_on_or_after(start_d);
  end_monday     := public.week_monday(end_d);
  num_weeks      := GREATEST(1, (end_monday - first_monday) / 7 + 1);

  -- Вычесть недели заморозки (только если пауза завершена)
  IF NEW.freeze_start IS NOT NULL AND NEW.freeze_end IS NOT NULL THEN
    pause_weeks := (
      public.first_monday_on_or_after(NEW.freeze_end) -
      public.first_monday_on_or_after(NEW.freeze_start)
    ) / 7;
    num_weeks := GREATEST(1, num_weeks - pause_weeks);
  END IF;

  amount_per_week := NEW.amount / num_weeks;
  week_cursor     := first_monday;

  WHILE week_cursor <= end_monday AND week_cursor <= current_monday LOOP
    -- Пропускаем период заморозки
    IF NEW.freeze_start IS NOT NULL
       AND week_cursor >= public.first_monday_on_or_after(NEW.freeze_start)
       AND (NEW.freeze_end IS NULL OR week_cursor < public.first_monday_on_or_after(NEW.freeze_end))
    THEN
      week_cursor := week_cursor + 7;
      CONTINUE;
    END IF;

    INSERT INTO public.journal_entries (
      entry_date, debit_account_code, credit_account_code, amount,
      client_id, service_name, document_type, document_id, document_extra
    ) VALUES (
      week_cursor, '98', '90', amount_per_week,
      NEW.client_id, NEW.service_name, 'weekly_recognition', NEW.id, week_cursor::text
    )
    ON CONFLICT (document_type, document_id, document_extra) DO NOTHING;
    week_cursor := week_cursor + 7;
  END LOOP;

  RETURN NEW;
END;
$$;
