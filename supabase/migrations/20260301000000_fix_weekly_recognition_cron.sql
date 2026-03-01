-- ═══════════════════════════════════════════════════════════════════════════════
-- Исправление еженедельного признания выручки:
--   1. Первый понедельник признания — НА ИЛИ ПОСЛЕ start_date (не раньше).
--      Исключение: если start_date — понедельник, начисление с него же.
--   2. Признание Дт 98 Кт 90 создаётся только по наступлению даты (cron),
--      не заранее. Убираем схему «все будущие проводки при начислении».
--   3. pause/resume адаптированы к cron-подходу.
--   4. Бэкфилл: удаляем все старые weekly_recognition, пересоздаём правильно.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. Вспомогательная функция: первый понедельник на или после даты ─────────
--        Если d — уже понедельник, возвращает d (не сдвигает вперёд).
--        Если нет — первый следующий понедельник.
CREATE OR REPLACE FUNCTION public.first_monday_on_or_after(d DATE)
RETURNS DATE
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (d + ((8 - EXTRACT(ISODOW FROM d)::int) % 7)::int)::date;
$$;

COMMENT ON FUNCTION public.first_monday_on_or_after(DATE) IS
  'Первый понедельник на или после d. Если d — понедельник, возвращает d.';


-- ─── 2. write_charge_journal: только Дт 62 Кт 98 ─────────────────────────────
--        Weekly_recognition теперь создаёт только cron, не эта функция.
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Дт 62 Кт 98 на всю сумму начисления
  INSERT INTO public.journal_entries (
    entry_date, debit_account_code, credit_account_code, amount,
    client_id, service_name, document_type, document_id, document_extra
  ) VALUES (
    COALESCE(p_start_date, (p_created_at AT TIME ZONE 'UTC')::date),
    '62', '98', p_amount,
    p_client_id, p_service_name, 'charge', p_id, ''
  );
  -- Дт 98 Кт 90 — только по понедельникам, через cron
END;
$$;


-- ─── 3. post_charge_entry: Дт 62 Кт 98 + немедленный бэкфилл прошедших недель ─
--        При добавлении начисления сразу признаём прошедшие недели
--        (idempotently), будущие недели — оставляем крону.
CREATE OR REPLACE FUNCTION public.post_charge_entry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  first_monday    DATE;
  end_monday      DATE;
  current_monday  DATE;
  num_weeks       INT;
  amount_per_week NUMERIC(12,2);
  week_cursor     DATE;
  start_d         DATE;
  end_d           DATE;
BEGIN
  -- Дт 62 Кт 98
  PERFORM public.write_charge_journal(
    NEW.id, NEW.client_id, NEW.service_name, NEW.amount,
    NEW.start_date, NEW.end_date, NEW.created_at
  );

  -- Сразу признать прошедшие недели (если start_date в прошлом)
  start_d        := COALESCE(NEW.start_date, (NEW.created_at AT TIME ZONE 'UTC')::date);
  end_d          := COALESCE(NEW.end_date, start_d);
  current_monday := public.week_monday(CURRENT_DATE);
  first_monday   := public.first_monday_on_or_after(start_d);
  end_monday     := public.week_monday(end_d);
  num_weeks      := GREATEST(1, (end_monday - first_monday) / 7 + 1);
  amount_per_week := NEW.amount / num_weeks;
  week_cursor    := first_monday;

  WHILE week_cursor <= end_monday AND week_cursor <= current_monday LOOP
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


-- ─── 4. run_weekly_revenue_recognition: только прошедшие недели, правильный понедельник ─
CREATE OR REPLACE FUNCTION public.run_weekly_revenue_recognition()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r               RECORD;
  first_monday    DATE;
  end_monday      DATE;
  current_monday  DATE;
  num_weeks       INT;
  pause_weeks     INT;
  amount_per_week NUMERIC(12,2);
  week_cursor     DATE;
  inserted_count  INT := 0;
  rc              INT;
BEGIN
  current_monday := public.week_monday(CURRENT_DATE);

  FOR r IN
    SELECT c.id, c.client_id, c.service_name, c.amount,
           COALESCE(c.start_date, (c.created_at AT TIME ZONE 'UTC')::date) AS start_date,
           COALESCE(c.end_date, COALESCE(c.start_date, (c.created_at AT TIME ZONE 'UTC')::date)) AS end_date,
           c.status,
           c.freeze_start,
           c.freeze_end
    FROM public.charges c
  LOOP
    -- Первый понедельник признания: на или после start_date
    first_monday := public.first_monday_on_or_after(r.start_date);
    end_monday   := public.week_monday(r.end_date);
    num_weeks    := GREATEST(1, (end_monday - first_monday) / 7 + 1);

    -- Вычесть недели заморозки из расчёта суммы (только если пауза завершена)
    IF r.freeze_start IS NOT NULL AND r.freeze_end IS NOT NULL THEN
      pause_weeks := (
        public.first_monday_on_or_after(r.freeze_end) -
        public.first_monday_on_or_after(r.freeze_start)
      ) / 7;
      num_weeks := GREATEST(1, num_weeks - pause_weeks);
    END IF;

    amount_per_week := r.amount / num_weeks;
    week_cursor     := first_monday;

    WHILE week_cursor <= end_monday AND week_cursor <= current_monday LOOP

      -- Пропускаем недели в период активной или завершённой заморозки
      IF r.freeze_start IS NOT NULL
         AND week_cursor >= public.first_monday_on_or_after(r.freeze_start)
         AND (r.freeze_end IS NULL OR week_cursor < public.first_monday_on_or_after(r.freeze_end))
      THEN
        week_cursor := week_cursor + 7;
        CONTINUE;
      END IF;

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
      week_cursor    := week_cursor + 7;
    END LOOP;
  END LOOP;

  RETURN inserted_count;
END;
$$;

COMMENT ON FUNCTION public.run_weekly_revenue_recognition() IS
  'Создаёт Дт 98 Кт 90 по понедельно для всех начислений. '
  'Первый понедельник — на или после start_date. Idempotent. Запускается кроном каждый понедельник.';


-- ─── 5. on_charge_update_sync_journal: пересоздать + бэкфилл прошедших недель ──
CREATE OR REPLACE FUNCTION public.on_charge_update_sync_journal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  first_monday    DATE;
  end_monday      DATE;
  current_monday  DATE;
  num_weeks       INT;
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
  -- Отмена: управляется cancel_charge_with_accounting
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  -- Возобновление паузы: управляется resume_charge_with_accounting
  IF OLD.status = 'paused' AND (NEW.status IS NULL OR NEW.status != 'paused') THEN RETURN NEW; END IF;

  -- Удаляем старые проводки начисления и признания
  DELETE FROM public.journal_entries
  WHERE (document_type = 'charge' AND document_id = OLD.id)
     OR (document_type = 'weekly_recognition' AND document_id = OLD.id);

  -- Создаём Дт 62 Кт 98
  PERFORM public.write_charge_journal(
    NEW.id, NEW.client_id, NEW.service_name, NEW.amount,
    NEW.start_date, NEW.end_date, NEW.created_at
  );

  -- Бэкфилл прошедших недель
  start_d        := COALESCE(NEW.start_date, (NEW.created_at AT TIME ZONE 'UTC')::date);
  end_d          := COALESCE(NEW.end_date, start_d);
  current_monday := public.week_monday(CURRENT_DATE);
  first_monday   := public.first_monday_on_or_after(start_d);
  end_monday     := public.week_monday(end_d);
  num_weeks      := GREATEST(1, (end_monday - first_monday) / 7 + 1);
  amount_per_week := NEW.amount / num_weeks;
  week_cursor    := first_monday;

  WHILE week_cursor <= end_monday AND week_cursor <= current_monday LOOP
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


-- ─── 6. pause_charge_with_accounting: unearned = amount - уже признанное ────────
--        При cron-подходе нет будущих проводок — пересчитываем через разность.
CREATE OR REPLACE FUNCTION public.pause_charge_with_accounting(
  p_charge_id BIGINT,
  p_pause_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r           public.charges%ROWTYPE;
  v_earned    NUMERIC(12,2);
  v_unearned  NUMERIC(12,2);
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
  IF r.freeze_end IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Начисление уже использовало заморозку. Повторная заморозка не разрешена.');
  END IF;
  IF p_pause_date > COALESCE(r.end_date, r.start_date) THEN
    RETURN jsonb_build_object('error', 'Дата паузы не может быть позже даты окончания начисления');
  END IF;

  -- Признанная выручка = сумма weekly_recognition до даты паузы
  -- (cron уже создал все прошедшие недели)
  SELECT COALESCE(SUM(amount), 0) INTO v_earned
  FROM public.journal_entries
  WHERE document_id = p_charge_id
    AND document_type = 'weekly_recognition'
    AND entry_date <= p_pause_date;

  v_unearned := r.amount - v_earned;

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

  -- status и freeze_start не в триггере UPDATE → пересчёта не будет
  UPDATE public.charges
  SET status = 'paused', freeze_start = p_pause_date
  WHERE id = p_charge_id;

  RETURN jsonb_build_object('unearned_amount', v_unearned, 'pause_date', p_pause_date);
END;
$$;

COMMENT ON FUNCTION public.pause_charge_with_accounting(BIGINT, DATE) IS
  'Приостанавливает начисление: вычисляет unearned как amount - SUM(recognized), сторнирует Дт 98 Кт 62.';


-- ─── 7. resume_charge_with_accounting: без предварительного создания weekly проводок ─
--        Крон создаст их при наступлении очередного понедельника.
CREATE OR REPLACE FUNCTION public.resume_charge_with_accounting(
  p_charge_id BIGINT,
  p_resume_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r              public.charges%ROWTYPE;
  v_pause_days   INT;
  v_new_end_date DATE;
  v_remaining    NUMERIC(12,2);
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
  SELECT COALESCE(SUM(amount), 0) INTO v_remaining
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
    -- weekly_recognition на оставшийся срок создаётся кроном при наступлении понедельников
  END IF;

  -- Обновляем начисление (OLD.status='paused' → триггер пропустит пересчёт)
  UPDATE public.charges
  SET status     = NULL,
      end_date   = v_new_end_date,
      freeze_end = p_resume_date
  WHERE id = p_charge_id;

  RETURN jsonb_build_object(
    'new_end_date',   v_new_end_date,
    'pause_days',     v_pause_days,
    'resumed_amount', v_remaining
  );
END;
$$;

COMMENT ON FUNCTION public.resume_charge_with_accounting(BIGINT, DATE) IS
  'Возобновляет начисление: удаляет сторно паузы, создаёт Дт 62 Кт 98. '
  'Крон создаст weekly_recognition при наступлении следующих понедельников.';


-- ─── 8. Бэкфилл: удаляем все старые weekly_recognition, пересоздаём правильно ──
--        Старые проводки могли начинаться раньше start_date (ошибка week_monday).
DELETE FROM public.journal_entries
WHERE document_type = 'weekly_recognition';

SELECT public.run_weekly_revenue_recognition();


-- ─── 9. Включаем cron (каждый понедельник в 00:00 UTC) ───────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'weekly-revenue-recognition',
  '0 0 * * 1',
  $$SELECT public.run_weekly_revenue_recognition()$$
);
