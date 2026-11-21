-- ─────────────────────────────────────────────────────────────────────────────
-- Commentaire du superviseur pour le chef d'équipe, sur une fiche OT
--
-- Saisi à la distribution (PDF) ou plus tard dans le suivi ; le chef le voit sur sa fiche.
-- Colonne de la table situations (lue directement, la vue situations_detail n'est pas modifiée).
-- À exécuter une fois dans l'éditeur SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS note_chef text NOT NULL DEFAULT '';

-- recharge le cache de l'API pour que la nouvelle colonne soit visible tout de suite
NOTIFY pgrst, 'reload schema';
