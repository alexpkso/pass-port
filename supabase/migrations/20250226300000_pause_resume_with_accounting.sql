-- Бухгалтерски-корректные функции приостановки и возобновления начислений.
--
-- При паузе:
--   1) Удаляются будущие проводки Дт 98 Кт 90 (после даты паузы)
--   2) Сторнируется неоказанная часть: Дт 98 Кт 62 (= сумма удалённых проводок)
--   3) Обновляется начисление: status='paused', freeze_start=date
--
-- При возобновлении:
--   1) Удаляется сторно-проводка паузы
--   2) Создаётся новый дебет на оставшуюся сумму: Дт 62 Кт 98 (document_type='charge_resume')
--   3) Создаются недельные проводки Дт 98 Кт 90 на оставшийся срок
--   4) Обновляется начисление: end_date+=pause_days, freeze_end=resume_date, status=null
--
-- Не более одной заморозки за весь срок начисления (проверка по freeze_end IS NOT NULL).

-- 1. Добавляем новые типы документов
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_document_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_document_type_check
  CHECK (document_type IN ('charge', 'payment', 'weekly_recognition', 'cancellation', 'pause_reversal', 'charge_resume'));

-- 2. Обновляем триггер синхронизации: пропускаем при возобновлении паузы
--    (при отмене уже пропускается — оставляем, добавляем ветку для resume)
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
  -- Отмена: проводки управляются cancel_charge_with_accounting
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  -- Возобновление после паузы: проводки управляются resume_charge_with_accounting
  IF OLD.status = 'paused' AND (NEW.status IS NULL OR NEW.status != 'paused') THEN RETURN NEW; END IF;

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

-- 3. Функция приостановки начисления с проводками
CREATE OR REPLACE FUNCTION public.pause_charge_with_accounting(
  p_charge_id BIGINT,
  p_pause_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.charges%ROWTYPE;
  v_unearned NUMERIC(12,2);
BEGIN
  SELECT * INTO r FROM public.charges WHERE id = p_charge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Начисление не найдено');
  END IF;
  IF r.status = 'paused' THEN
    RETURN jsonb_build_object('error', 'Начисление уже приостановлено');
  END IF;
  IF r.status = 'cancelled' THEN
    RETURN jsonb_build_object('error', 'Нельзя приостановить отменённое начисление');
  END IF;
  -- Не более одной заморозки: если freeze_end уже заполнен — заморозка уже была
  IF r.freeze_end IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Начисление уже использовало заморозку. Повторная заморозка не разрешена.');
  END IF;
  IF p_pause_date > COALESCE(r.end_date, r.start_date) THEN
    RETURN jsonb_build_object('error', 'Дата паузы не может быть позже даты окончания начисления');
  END IF;

  -- Сумма неоказанных услуг = сумма будущих недельных проводок
  SELECT COALESCE(SUM(amount), 0)
  INTO v_unearned
  FROM public.journal_entries
  WHERE document_id = p_charge_id
    AND document_type = 'weekly_recognition'
    AND entry_date > p_pause_date;

  -- Удаляем будущие проводки Дт 98 Кт 90
  DELETE FROM public.journal_entries
  WHERE document_id = p_charge_id
    AND document_type = 'weekly_recognition'
    AND entry_date > p_pause_date;

  -- Сторнируем неоказанную часть: Дт 98 Кт 62
  IF v_unearned > 0 THEN
    INSERT INTO public.journal_entries (
      entry_date, debit_account_code, credit_account_code, amount,
      client_id, service_name, document_type, document_id, document_extra
    ) VALUES (
      p_pause_date, '98', '62', v_unearned,
      r.client_id, r.service_name, 'pause_reversal', p_charge_id, p_pause_date::text
    )
    ON CONFLICT (document_type, document_id, document_extra) DO NOTHING;
  END IF;

  -- status и freeze_start не входят в триггер → пересчёта не будет
  UPDATE public.charges
  SET status = 'paused',
      freeze_start = p_pause_date
  WHERE id = p_charge_id;

  RETURN jsonb_build_object('unearned_amount', v_unearned, 'pause_date', p_pause_date);
END;
$$;

COMMENT ON FUNCTION public.pause_charge_with_accounting(BIGINT, DATE) IS
  'Приостанавливает начисление: удаляет будущие Дт 98 Кт 90, сторнирует Дт 98 Кт 62 на неоказанную сумму.';

-- 4. Функция возобновления начисления с проводками
CREATE OR REPLACE FUNCTION public.resume_charge_with_accounting(
  p_charge_id BIGINT,
  p_resume_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r               public.charges%ROWTYPE;
  v_pause_days    INT;
  v_new_end_date  DATE;
  v_remaining     NUMERIC(12,2);
  start_monday    DATE;
  end_monday      DATE;
  num_weeks       INT;
  amount_per_week NUMERIC(12,2);
  week_cursor     DATE;
BEGIN
  SELECT * INTO r FROM public.charges WHERE id = p_charge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Начисление не найдено');
  END IF;
  IF r.status != 'paused' THEN
    RETURN jsonb_build_object('error', 'Начисление не приостановлено');
  END IF;
  IF r.freeze_start IS NULL THEN
    RETURN jsonb_build_object('error', 'Нет даты начала заморозки');
  END IF;
  IF p_resume_date < r.freeze_start THEN
    RETURN jsonb_build_object('error', 'Дата возобновления не может быть раньше даты паузы');
  END IF;

  v_pause_days   := (p_resume_date - r.freeze_start)::INT;
  v_new_end_date := COALESCE(r.end_date, r.start_date) + v_pause_days;

  -- Берём сумму из проводки pause_reversal
  SELECT COALESCE(SUM(amount), 0)
  INTO v_remaining
  FROM public.journal_entries
  WHERE document_id = p_charge_id AND document_type = 'pause_reversal';

  -- Удаляем сторно-проводку паузы
  DELETE FROM public.journal_entries
  WHERE document_id = p_charge_id AND document_type = 'pause_reversal';

  IF v_remaining > 0 THEN
    -- Новая проводка: Дт 62 Кт 98 на оставшуюся сумму
    INSERT INTO public.journal_entries (
      entry_date, debit_account_code, credit_account_code, amount,
      client_id, service_name, document_type, document_id, document_extra
    ) VALUES (
      p_resume_date, '62', '98', v_remaining,
      r.client_id, r.service_name, 'charge_resume', p_charge_id, p_resume_date::text
    )
    ON CONFLICT (document_type, document_id, document_extra) DO NOTHING;

    -- Еженедельное признание на оставшийся срок: p_resume_date → v_new_end_date
    start_monday    := public.week_monday(p_resume_date);
    end_monday      := public.week_monday(v_new_end_date);
    num_weeks       := GREATEST(1, (end_monday - start_monday) / 7 + 1);
    amount_per_week := v_remaining / num_weeks;
    week_cursor     := start_monday;

    WHILE week_cursor <= end_monday LOOP
      INSERT INTO public.journal_entries (
        entry_date, debit_account_code, credit_account_code, amount,
        client_id, service_name, document_type, document_id, document_extra
      ) VALUES (
        week_cursor, '98', '90', amount_per_week,
        r.client_id, r.service_name, 'weekly_recognition', p_charge_id, week_cursor::text
      )
      ON CONFLICT (document_type, document_id, document_extra) DO NOTHING;
      week_cursor := week_cursor + 7;
    END LOOP;
  END IF;

  -- Обновляем начисление (OLD.status='paused' → триггер пропустит пересчёт)
  UPDATE public.charges
  SET status      = NULL,
      end_date    = v_new_end_date,
      freeze_end  = p_resume_date
  WHERE id = p_charge_id;

  RETURN jsonb_build_object(
    'new_end_date',    v_new_end_date,
    'pause_days',      v_pause_days,
    'resumed_amount',  v_remaining
  );
END;
$$;

COMMENT ON FUNCTION public.resume_charge_with_accounting(BIGINT, DATE) IS
  'Возобновляет начисление: удаляет сторно паузы, создаёт Дт 62 Кт 98 + еженедельные Дт 98 Кт 90 на продлённый период.';
