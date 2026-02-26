-- Доработка таблиц для подписной модели (только добавление полей, без переименований).
-- services: тип услуги и длительность тарифа.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;

COMMENT ON COLUMN public.services.type IS 'subscription | one-time';
COMMENT ON COLUMN public.services.duration_days IS 'Длительность тарифа в днях (30, 90, 180, 365)';

-- Для существующих строк задаём разумные значения по умолчанию (не меняем логику текущих данных).
UPDATE public.services SET type = 'one-time' WHERE type IS NULL;
UPDATE public.services SET duration_days = 30 WHERE type = 'subscription' AND duration_days IS NULL;
ALTER TABLE public.services ALTER COLUMN type SET DEFAULT 'one-time';

-- charges: тип начисления, статус, заморозка. start_date, end_date, updated_at уже есть.
ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS subscription_type TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS freeze_start DATE,
  ADD COLUMN IF NOT EXISTS freeze_end DATE;

COMMENT ON COLUMN public.charges.subscription_type IS 'primary | renewal | one-time';
COMMENT ON COLUMN public.charges.status IS 'active | expired — по датам; paused | cancelled — вручную';
COMMENT ON COLUMN public.charges.freeze_start IS 'Дата начала заморозки';
COMMENT ON COLUMN public.charges.freeze_end IS 'Дата окончания заморозки';

-- Существующие начисления не трогаем: subscription_type и status остаются NULL (логика в приложении).
-- updated_at в таблице уже есть (см. 20250222400000).
