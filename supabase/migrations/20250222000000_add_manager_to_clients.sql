-- Добавляем поле менеджер (БА из таблицы)
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS manager TEXT;

COMMENT ON COLUMN public.clients.manager IS 'Менеджер (БА)';
