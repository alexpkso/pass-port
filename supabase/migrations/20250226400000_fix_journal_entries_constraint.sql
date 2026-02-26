-- Hotfix: обновляем check constraint до полного набора document_type.
-- Запустить если pause/cancellation дают ошибку constraint violation.
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_document_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_document_type_check
  CHECK (document_type IN (
    'charge',
    'payment',
    'weekly_recognition',
    'cancellation',
    'pause_reversal',
    'charge_resume'
  ));
