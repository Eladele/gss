-- ─────────────────────────────────────────────────────────────────────────────
-- Suspension du salaire d'un employé (à exécuter une fois dans Supabase)
-- L'admin ou le directeur suspend le salaire : l'employé n'est plus dans les
-- exports de salaire (ordres de virement, caisse, récap) jusqu'à ce qu'il soit rétabli.
-- Le contrôle du rôle (admin / directeur) est fait par l'application : la connexion
-- n'utilise pas Supabase Auth, la base ne connaît donc pas l'utilisateur (auth.uid() vide).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS salaire_suspendu boolean NOT NULL DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS motif_suspension text NOT NULL DEFAULT '';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS suspendu_le timestamptz;

-- Ancienne version : ce contrôle bloquait tout le monde (auth.uid() toujours vide) → supprimé
DROP TRIGGER IF EXISTS trg_controle_suspension_salaire ON public.employees;
DROP FUNCTION IF EXISTS public.controle_suspension_salaire();
