-- Связываем сущности: добавляем FK-поля для жёсткой связи между таблицами.
-- charges → services (service_id)
ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS service_id BIGINT REFERENCES public.services(id) ON DELETE SET NULL;

-- Заполняем service_id для существующих начислений по совпадению имени
UPDATE public.charges c
SET service_id = s.id
FROM public.services s
WHERE c.service_name = s.name
  AND c.service_id IS NULL;

COMMENT ON COLUMN public.charges.service_id IS 'FK на справочник услуг (services.id)';
CREATE INDEX IF NOT EXISTS idx_charges_service_id ON public.charges(service_id);

-- payments → services (service_id) и payments → charges (charge_id)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS service_id BIGINT REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS charge_id  BIGINT REFERENCES public.charges(id)  ON DELETE SET NULL;

-- Заполняем service_id для существующих оплат по совпадению имени
UPDATE public.payments p
SET service_id = s.id
FROM public.services s
WHERE p.service_name = s.name
  AND p.service_id IS NULL;

COMMENT ON COLUMN public.payments.service_id IS 'FK на справочник услуг (services.id)';
COMMENT ON COLUMN public.payments.charge_id  IS 'FK на начисление — конкретный период подписки (charges.id)';
CREATE INDEX IF NOT EXISTS idx_payments_service_id ON public.payments(service_id);
CREATE INDEX IF NOT EXISTS idx_payments_charge_id  ON public.payments(charge_id);
