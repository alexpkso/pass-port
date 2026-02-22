-- Таблица "Должности"
CREATE TABLE IF NOT EXISTS public.positions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.positions IS 'Должности';

INSERT INTO public.positions (name) VALUES
  ('менеджер по продажам'),
  ('менеджер отдела производства'),
  ('менеджер по лидам'),
  ('операционный директор')
ON CONFLICT (name) DO NOTHING;

-- Переименовываем "Менеджеры" в "Сотрудники" и добавляем поле "Должность"
ALTER TABLE IF EXISTS public.managers RENAME TO employees;

COMMENT ON TABLE public.employees IS 'Сотрудники';

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS position_id BIGINT REFERENCES public.positions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.name IS 'Имя';
COMMENT ON COLUMN public.employees.position_id IS 'Должность';

-- Для существующих сотрудников ставим первую должность по умолчанию
UPDATE public.employees
SET position_id = (SELECT id FROM public.positions LIMIT 1)
WHERE position_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_position_id ON public.employees(position_id);
