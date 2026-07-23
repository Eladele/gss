-- ============================================================================
-- SITUATIONS : ajout des colonnes des fichiers d'installation (ex: INSTALLATION_JUIN.xlsx)
--   - date_message : date du message initial ("DETE MESSAGE")
--   - service_destination : colonne "Service Destination" (ex: GSS)
-- La colonne "DATE DEPOT" de ces fichiers n'est volontairement PAS importée
-- (date_depo reste vide pour ces lignes) — le délai se base sur date_message.
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS date_message date;
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS service_destination text;
