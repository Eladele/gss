-- ============================================================================
-- Ajoute une colonne persistée indiquant si un ONU est "nouveau" par rapport à
-- l'import précédent, pour pouvoir filtrer la liste (survit à un refresh).
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.scan_results ADD COLUMN IF NOT EXISTS change_type text;
CREATE INDEX IF NOT EXISTS idx_scan_results_change_type ON public.scan_results (change_type);
