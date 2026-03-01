-- ═══════════════════════════════════════════════════════════════════════════════
-- Упрощение паузы/возобновления:
--   Пауза — просто приостанавливает признание выручки.
--   Крон пропускает замороженные недели, срок продлевается на паузу.
--   Никаких дополнительных проводок (pause_reversal / charge_resume) не нужно.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. pause_charge_with_accounting: только обновление статуса ───────────────
CREATE OR REPLACE FUNCTION public.pause_charge_with_accounting(
  p_charge_id BIGINT,
  p_pause_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.charges%ROWTYPE;
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

  -- Никаких проводок: крон просто пропустит замороженные недели
  UPDATE public.charges
  SET status       = 'paused',
      freeze_start = p_pause_date
  WHERE id = p_charge_id;

  RETURN jsonb_build_object('pause_date', p_pause_date);
END;
$$;

COMMENT ON FUNCTION public.pause_charge_with_accounting(BIGINT, DATE) IS
  'Приостанавливает начисление: status=paused, freeze_start=дата. '
  'Никаких проводок — крон пропускает замороженные недели автоматически.';


-- ─── 2. resume_charge_with_accounting: продление срока, никаких проводок ──────
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

  -- Никаких проводок: просто продлеваем срок и снимаем паузу.
  -- Крон создаст weekly_recognition с первого понедельника после resume_date.
  UPDATE public.charges
  SET status     = NULL,
      end_date   = v_new_end_date,
      freeze_end = p_resume_date
  WHERE id = p_charge_id;

  RETURN jsonb_build_object(
    'new_end_date', v_new_end_date,
    'pause_days',   v_pause_days
  );
END;
$$;

COMMENT ON FUNCTION public.resume_charge_with_accounting(BIGINT, DATE) IS
  'Возобновляет начисление: продлевает end_date на дни паузы, снимает статус. '
  'Никаких проводок — крон создаст weekly_recognition при наступлении понедельников.';


-- ─── 3. Очистка: удаляем устаревшие проводки паузы/возобновления ─────────────
DELETE FROM public.journal_entries
WHERE document_type IN ('pause_reversal', 'charge_resume');


-- ─── 4. Обновляем ограничение document_type (убираем ненужные типы) ───────────
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_document_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_document_type_check
  CHECK (document_type IN ('charge', 'payment', 'weekly_recognition', 'cancellation'));
