-- 1) При удалении оплаты удалять связанную проводку Дт 51 Кт 62 (если триггер ещё не был применён)
CREATE OR REPLACE FUNCTION public.on_payment_delete_clean_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE document_type = 'payment' AND document_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_delete_journal ON public.payments;
CREATE TRIGGER trg_payment_delete_journal
  BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_delete_clean_journal();

-- 2) Разовая очистка: удалить проводки по оплатам, которые уже удалены из payments
DELETE FROM public.journal_entries j
WHERE j.document_type = 'payment'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = j.document_id);
