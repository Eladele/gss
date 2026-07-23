-- ============================================================================
-- VÉHICULES : ajout du suivi de date de changement de statut
-- Permet de calculer le nombre de jours qu'un véhicule passe en maintenance
-- (garage) depuis le dernier changement de statut.
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS statut_depuis timestamptz DEFAULT now();

-- Initialise la date pour les véhicules déjà existants
UPDATE public.vehicles SET statut_depuis = created_at WHERE statut_depuis IS NULL;
