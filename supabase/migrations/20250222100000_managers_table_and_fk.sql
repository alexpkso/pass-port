-- Таблица "Менеджеры"
CREATE TABLE IF NOT EXISTS public.managers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.managers IS 'Менеджеры (БА)';
COMMENT ON COLUMN public.managers.name IS 'Имя менеджера';

-- Перенос уникальных значений из clients.manager в managers
INSERT INTO public.managers (name)
SELECT DISTINCT TRIM(manager)
FROM public.clients
WHERE manager IS NOT NULL AND TRIM(manager) != ''
ON CONFLICT (name) DO NOTHING;

-- Добавляем связь: в clients — внешний ключ на managers
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS manager_id BIGINT REFERENCES public.managers(id) ON DELETE SET NULL;

-- Заполняем manager_id по совпадению имени
UPDATE public.clients c
SET manager_id = m.id
FROM public.managers m
WHERE TRIM(c.manager) = m.name;

-- Удаляем старую текстовую колонку manager
ALTER TABLE public.clients
DROP COLUMN IF EXISTS manager;

-- Индекс для быстрого поиска клиентов по менеджеру
CREATE INDEX IF NOT EXISTS idx_clients_manager_id ON public.clients(manager_id);
