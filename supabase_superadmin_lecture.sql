-- ─────────────────────────────────────────────────────────────────────────────
-- Lecture du drapeau super-administrateur (à exécuter une fois dans Supabase)
-- La table profiles est protégée (mots de passe) : l'application ne peut pas la lire,
-- elle voyait donc toujours « pas super-administrateur ». Cette fonction renvoie
-- seulement oui / non pour un compte, sans rien exposer d'autre.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS est_superadmin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.est_superadmin(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.est_superadmin FROM public.profiles p WHERE p.id = p_user), false);
$$;

GRANT EXECUTE ON FUNCTION public.est_superadmin(uuid) TO anon, authenticated;
