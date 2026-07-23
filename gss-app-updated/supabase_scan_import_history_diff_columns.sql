-- ============================================================================
-- Persistance de la comparaison (diff) avec le fichier précédent, pour qu'elle
-- reste visible après un refresh de la page (elle n'était qu'en mémoire avant).
-- À exécuter dans Supabase SQL Editor, APRÈS supabase_scan_import_history_schema.sql
-- ============================================================================

ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_nouveaux integer;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_disparus integer;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_passes_non_scanne integer;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_passes_scanne integer;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_signal_degrade integer;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_signal_ameliore integer;
