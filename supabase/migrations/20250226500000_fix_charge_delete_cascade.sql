-- Расширяем триггер удаления начисления: теперь чистим все связанные типы проводок,
-- включая cancellation, pause_reversal и charge_resume.
CREATE OR REPLACE FUNCTION public.on_charge_delete_clean_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE document_id = OLD.id
    AND document_type IN (
      'charge',
      'weekly_recognition',
      'cancellation',
      'pause_reversal',
      'charge_resume'
    );
  RETURN OLD;
END;
$$;

-- Разовая очистка: удаляем осиротевшие проводки всех типов по удалённым начислениям
DELETE FROM public.journal_entries j
WHERE document_type IN ('charge', 'weekly_recognition', 'cancellation', 'pause_reversal', 'charge_resume')
  AND NOT EXISTS (
    SELECT 1 FROM public.charges c WHERE c.id = j.document_id
  );
