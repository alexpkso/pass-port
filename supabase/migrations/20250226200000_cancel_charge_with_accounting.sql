-- Отмена начисления с корректирующими бухгалтерскими проводками.
-- При отмене: удаляем будущие еженедельные проводки, добавляем Дт 98 Кт 62 на неоказанную сумму,
-- обновляем начисление (дата окончания → дата отмены, сумма → фактически оказанная).

-- 1. Добавляем тип 'cancellation' в допустимые типы документов
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_document_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_document_type_check
  CHECK (document_type IN ('charge', 'payment', 'weekly_recognition', 'cancellation'));

-- 2. Модифицируем триггер синхронизации проводок:
--    при отмене начисления (NEW.status = 'cancelled') пропускаем пересчёт —
--    проводки управляются функцией cancel_charge_with_accounting.
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
  -- Если начисление отменяется — проводки управляются cancel_charge_with_accounting, пропускаем
  IF NEW.status = 'cancelled' THEN
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

-- 3. Функция отмены начисления с корректирующими проводками
CREATE OR REPLACE FUNCTION public.cancel_charge_with_accounting(
  p_charge_id BIGINT,
  p_cancel_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           public.charges%ROWTYPE;
  v_start     DATE;
  v_end       DATE;
  v_total_days INT;
  v_earned_days INT;
  v_earned    NUMERIC(12,2);
  v_unearned  NUMERIC(12,2);
BEGIN
  SELECT * INTO r FROM public.charges WHERE id = p_charge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Начисление не найдено');
  END IF;

  v_start := COALESCE(r.start_date, (r.created_at AT TIME ZONE 'UTC')::date);
  v_end   := COALESCE(r.end_date, v_start);

  -- Валидация даты отмены
  IF p_cancel_date > v_end THEN
    RETURN jsonb_build_object('error', 'Дата отмены не может быть позже даты окончания начисления');
  END IF;

  -- Считаем дни (для превью в UI)
  v_total_days  := GREATEST(1, (v_end - v_start + 1)::INT);
  v_earned_days := GREATEST(0, LEAST((p_cancel_date - v_start + 1)::INT, v_total_days));

  -- earned = точная сумма уже созданных проводок Дт 98 Кт 90 (≤ p_cancel_date)
  -- это исключает копеечные расхождения при округлении amount_per_week
  SELECT COALESCE(SUM(amount), 0)
  INTO v_earned
  FROM public.journal_entries
  WHERE document_id = p_charge_id
    AND document_type = 'weekly_recognition'
    AND entry_date <= p_cancel_date;

  v_unearned := r.amount - v_earned;

  -- Удаляем еженедельные проводки признания после даты отмены
  DELETE FROM public.journal_entries
  WHERE document_id = p_charge_id
    AND document_type = 'weekly_recognition'
    AND entry_date > p_cancel_date;

  -- Добавляем проводку отмены: Дт 98 Кт 62 на сумму неоказанных услуг
  IF v_unearned > 0 THEN
    INSERT INTO public.journal_entries (
      entry_date, debit_account_code, credit_account_code, amount,
      client_id, service_name, document_type, document_id, document_extra
    ) VALUES (
      p_cancel_date, '98', '62', v_unearned,
      r.client_id, r.service_name, 'cancellation', p_charge_id, p_cancel_date::text
    )
    ON CONFLICT (document_type, document_id, document_extra) DO NOTHING;
  END IF;

  -- Обновляем начисление: триггер пропустит пересчёт (NEW.status = 'cancelled')
  UPDATE public.charges
  SET status   = 'cancelled',
      end_date = p_cancel_date,
      amount   = v_earned
  WHERE id = p_charge_id;

  RETURN jsonb_build_object(
    'earned_amount',  v_earned,
    'unearned_amount', v_unearned,
    'earned_days',    v_earned_days,
    'total_days',     v_total_days
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_charge_with_accounting(BIGINT, DATE) IS
  'Отменяет начисление: удаляет будущие проводки Дт 98 Кт 90, добавляет Дт 98 Кт 62 на неоказанную сумму, обновляет строку (end_date, amount, status).';
