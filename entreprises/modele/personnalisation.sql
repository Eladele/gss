-- ════════════════════════════════════════════════════════════════════════════
-- PERSONNALISATION D'UNE ENTREPRISE — modèle
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Copier ce dossier : entreprises/modele/  →  entreprises/<nom-entreprise>/
-- 2. Remplir les valeurs marquées  ⟵ À REMPLIR
-- 3. Exécuter dans l'éditeur SQL du projet Supabase de l'entreprise,
--    APRÈS supabase_schema.sql (le schéma commun).
--
-- Le nom, le logo, les couleurs, le barème, l'en-tête de virement, les motifs, les jours
-- fériés, les supervisions… se règlent dans l'application (Paramètres, Personnalisation).
-- Ce fichier ne contient que ce que l'application ne peut pas régler, et les fonctions
-- que cette entreprise veut différentes du schéma commun.
-- Il peut être relancé sans risque.
-- ════════════════════════════════════════════════════════════════════════════

DO $garde$
BEGIN
  IF to_regclass('public.situations') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord supabase_schema.sql (schéma commun) sur cette base.';
  END IF;
END $garde$;


-- ─── A. Notifications sur téléphone (FCM) — OBLIGATOIRE pour le mobile ──────────
-- URL : Supabase → Edge Functions → send-push (https://<ref-du-projet>.supabase.co/functions/v1/send-push)
-- Secret : la même valeur que le secret PUSH_SECRET de l'Edge Function send-push.
INSERT INTO public.push_config (id, function_url, secret, actif)
VALUES (1,
        'https://XXXXXXXX.supabase.co/functions/v1/send-push',   -- ⟵ À REMPLIR
        'METTRE-ICI-LE-PUSH_SECRET',                              -- ⟵ À REMPLIR
        true)
ON CONFLICT (id) DO UPDATE
  SET function_url = EXCLUDED.function_url, secret = EXCLUDED.secret, actif = EXCLUDED.actif, updated_at = now();


-- ─── B. Réglages de départ (facultatif — aussi modifiables dans l'application) ──
-- Décommenter pour partir d'autres valeurs que celles par défaut.

-- Barème des points (Paramètres → Barème). Clés possibles : voir la fonction bareme_defaut().
-- INSERT INTO public.app_settings (key, value)
-- VALUES ('bareme_points', '{"fait_dans_delai": 1, "fait_hors_delai": 0, "penalite_non_traitee": -1}')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Jours fériés connus à l'avance (Paramètres → Jours fériés)
-- INSERT INTO public.jours_feries (jour, libelle) VALUES
--   ('2027-01-01', 'Jour de l''an'),
--   ('2027-05-01', 'Fête du travail')
-- ON CONFLICT (jour) DO NOTHING;


-- ─── C. Code propre à cette entreprise (facultatif) ─────────────────────────────
-- Pour changer le comportement d'une fonction pour CETTE entreprise seulement :
-- copier la fonction depuis supabase_schema.sql (section 6), la coller ici, la modifier.
-- Elle remplace la version commune dans cette base uniquement.
-- À relancer après chaque mise à jour du schéma commun.

-- Exemple : contrôle du soir à 21 h au lieu de 22 h.
-- (changer aussi l'heure de la tâche planifiée : 0 21 * * * — heure UTC)
--
-- CREATE OR REPLACE FUNCTION public.heure_controle(p_jour date)
--  RETURNS timestamp with time zone
--  LANGUAGE sql
--  STABLE
-- AS $function$ SELECT (p_jour + time '21:00') AT TIME ZONE 'Africa/Nouakchott' $function$;
--
-- SELECT cron.schedule('controle-22h', '0 21 * * *', 'SELECT public.controle_soir()');
