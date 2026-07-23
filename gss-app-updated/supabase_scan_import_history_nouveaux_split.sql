-- ============================================================================
-- Détail des "nouveaux ONU" par résultat de scan (scannés / non scannés),
-- pour affichage persistant dans la carte de comparaison.
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_nouveaux_scanne integer;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_nouveaux_non_scanne integer;
