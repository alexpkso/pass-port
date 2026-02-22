-- Таблица "Список услуг"
CREATE TABLE IF NOT EXISTS public.services (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  base_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.services IS 'Список услуг';
COMMENT ON COLUMN public.services.name IS 'Название';
COMMENT ON COLUMN public.services.base_cost IS 'Базовая стоимость';
