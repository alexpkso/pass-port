-- Услуга "Тариф 12 месяцев" 104000 руб. (если ещё нет)
INSERT INTO public.services (name, base_cost)
SELECT 'Тариф 12 месяцев', 104000
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Тариф 12 месяцев');

-- У всех клиентов: даты подписки = период тарифа 12 месяцев
UPDATE public.clients
SET
  subscription_start = '2025-03-01',
  subscription_end   = '2026-02-28';

-- Удаляем старые начисления и добавляем по одному начислению на клиента: Тариф 12 месяцев, 104000 ₽
DELETE FROM public.charges;

INSERT INTO public.charges (client_id, service_name, start_date, end_date, amount)
SELECT id, 'Тариф 12 месяцев', '2025-03-01', '2026-02-28', 104000
FROM public.clients;
