-- Очистить таблицу начислений
DELETE FROM public.charges;

-- Удалить поля дат подписки из клиентов
ALTER TABLE public.clients
  DROP COLUMN IF EXISTS subscription_start,
  DROP COLUMN IF EXISTS subscription_end;
