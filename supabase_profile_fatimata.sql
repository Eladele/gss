-- ============================================================================
-- ACCÈS SUPERVISEUR POUR FATIMATA (Fatimetou Mamadou Ba — Superviseur NKTT)
-- Lui donne le droit de gérer les situations (marquer OK / NON OK) comme
-- n'importe quel superviseur (page "Situations", déjà disponible pour ce rôle).
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

INSERT INTO public.profiles (name, role, team_id, password_hash)
SELECT 'Fatimetou Mamadou Ba', 'superviseur', NULL, 'superviseur2026'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE lower(name) = lower('Fatimetou Mamadou Ba')
);

-- Connexion : nom = "Fatimetou Mamadou Ba", mot de passe = "superviseur2026"
-- (à faire changer par l'utilisatrice si besoin — le mot de passe est en clair pour l'instant)
