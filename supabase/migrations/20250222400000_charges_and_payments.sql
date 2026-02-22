-- Начисления (услуги по периодам)
CREATE TABLE IF NOT EXISTS public.charges (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.charges IS 'Начисления по клиенту';
CREATE INDEX IF NOT EXISTS idx_charges_client_id ON public.charges(client_id);
CREATE INDEX IF NOT EXISTS idx_charges_start_date ON public.charges(start_date);

-- Оплаты
CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payments IS 'Оплаты по клиенту';
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments(client_id);
