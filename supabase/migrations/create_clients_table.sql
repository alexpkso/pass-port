-- Таблица clients для Supabase
-- Выполните в SQL Editor в панели Supabase

CREATE TABLE IF NOT EXISTS public.clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  subscription_start DATE,
  subscription_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Комментарии к полям (опционально)
COMMENT ON TABLE public.clients IS 'Клиенты';
COMMENT ON COLUMN public.clients.id IS 'Первичный ключ, автоинкремент';
COMMENT ON COLUMN public.clients.name IS 'Название клиента';
COMMENT ON COLUMN public.clients.legal_name IS 'Юридическое название';
COMMENT ON COLUMN public.clients.subscription_start IS 'Дата начала подписки';
COMMENT ON COLUMN public.clients.subscription_end IS 'Дата завершения подписки';
COMMENT ON COLUMN public.clients.created_at IS 'Дата создания записи';

-- Включить RLS (Row Level Security), если нужна защита на уровне строк
-- ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
