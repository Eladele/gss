-- ============================================================================
-- MIGRATION : Statistiques par équipe/ville + Module Employés
-- À exécuter dans Supabase SQL Editor (après le schema existant)
-- ============================================================================

-- 1) SITUATIONS — ajout nature (installation / dérangement) + conformité délai
ALTER TABLE public.situations
  ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'installation'
    CHECK (nature = ANY (ARRAY['installation'::text, 'derangement'::text])),
  ADD COLUMN IF NOT EXISTS conformite text
    CHECK (conformite IS NULL OR conformite = ANY (ARRAY['TLID'::text, 'HorsDelais'::text]));

CREATE INDEX IF NOT EXISTS idx_situations_nature ON public.situations (nature);
CREATE INDEX IF NOT EXISTS idx_situations_date_depo ON public.situations (date_depo);
CREATE INDEX IF NOT EXISTS idx_situations_equipe ON public.situations (equipe);

-- 2) TEAMS — ajout ville (utilisée pour les rapports "par ville")
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS ville text NOT NULL DEFAULT 'Nouakchott';

-- Mapping initial demandé : Mohamedou -> Kaédi, Diop -> Rosso, Ndaye -> Nouadhibou,
-- toutes les autres équipes restent sur Nouakchott (valeur par défaut ci-dessus).
UPDATE public.teams SET ville = 'Kaédi'      WHERE lower(name) = 'mohamedou';
UPDATE public.teams SET ville = 'Rosso'      WHERE lower(name) = 'diop';
UPDATE public.teams SET ville = 'Nouadhibou' WHERE lower(name) = 'ndaye';

-- 3) EMPLOYÉS — module indépendant, géré uniquement par l'admin
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mle text,
  name text NOT NULL,
  poste text,
  banque text,
  rib text,
  montant numeric,
  telephone text,
  date_embauche date,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employees_pkey PRIMARY KEY (id)
);

-- 4) CONGÉS — gérés manuellement par l'admin, liés à un employé
CREATE TABLE IF NOT EXISTS public.employee_leaves (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'annuel'
    CHECK (type = ANY (ARRAY['annuel'::text,'maladie'::text,'sans_solde'::text,'exceptionnel'::text,'maternite'::text,'autre'::text])),
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  jours integer NOT NULL DEFAULT 0,
  motif text DEFAULT ''::text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employee_leaves_pkey PRIMARY KEY (id),
  CONSTRAINT employee_leaves_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_employee_id ON public.employee_leaves (employee_id);

-- 5) Rôle superviseur "Fatimata" (si le profil n'existe pas déjà)
-- Remplacer le mot de passe par défaut après la première connexion.
INSERT INTO public.profiles (name, role, team_id, password_hash)
SELECT 'Fatimata', 'superviseur', NULL, 'superviseur2026'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = 'fatimata');
