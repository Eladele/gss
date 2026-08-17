-- ============================================================================
-- HISTORIQUE DES IMPORTS DE SCAN RÉSEAU — pour suivre l'évolution semaine par
-- semaine (% scanné, répartition du signal) sans garder toutes les lignes de
-- chaque ancien fichier.
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scan_import_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  imported_at timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL DEFAULT 0,
  scanne integer NOT NULL DEFAULT 0,
  non_scanne integer NOT NULL DEFAULT 0,
  excellent integer NOT NULL DEFAULT 0,
  moyen integer NOT NULL DEFAULT 0,
  degrade integer NOT NULL DEFAULT 0,
  pct_scanne numeric,
  CONSTRAINT scan_import_history_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_scan_import_history_date ON public.scan_import_history (imported_at);
