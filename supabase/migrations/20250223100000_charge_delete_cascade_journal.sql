-- При удалении начисления удалять связанные проводки (Дт 62 Кт 98 и все Дт 98 Кт 90 по этому начислению)

CREATE OR REPLACE FUNCTION public.on_charge_delete_clean_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE (document_type = 'charge' AND document_id = OLD.id)
     OR (document_type = 'weekly_recognition' AND document_id = OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_charge_delete_journal ON public.charges;
CREATE TRIGGER trg_charge_delete_journal
  BEFORE DELETE ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.on_charge_delete_clean_journal();

-- Очистить проводки, оставшиеся от уже удалённых начислений (разовая очистка)
DELETE FROM public.journal_entries j
WHERE (j.document_type = 'charge' AND NOT EXISTS (SELECT 1 FROM public.charges c WHERE c.id = j.document_id))
   OR (j.document_type = 'weekly_recognition' AND NOT EXISTS (SELECT 1 FROM public.charges c WHERE c.id = j.document_id));
