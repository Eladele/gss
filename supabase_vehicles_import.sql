-- ============================================================================
-- MODULE VÉHICULES : table + import des 11 véhicules du fichier GSS NKTT
-- À exécuter dans Supabase SQL Editor APRÈS les migrations précédentes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,                 -- modèle : L200, GANGO, EXPRESS, NISSAN...
  immatriculation text UNIQUE,
  statut text NOT NULL DEFAULT 'active'
    CHECK (statut = ANY (ARRAY['active'::text, 'reserve'::text, 'maintenance'::text])),
  equipe_nom text,                    -- équipe RH assignée (texte libre, comme employees.equipe_nom)
  chauffeur_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vehicles_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_equipe_nom ON public.vehicles (equipe_nom);

-- Import protégé contre les doublons (par immatriculation)
WITH new_vehicles (type, immatriculation, statut, equipe_nom) AS (
  VALUES
  ('GANGO',   '8804BC00', 'active',  'ARAFAT'),
  ('EXPRESS', '7409AA02', 'active',  'CENTRE VILLE'),
  ('L200',    '3524AU00', 'active',  'Déploiement'),
  ('L200',    '6169AU00', 'active',  'kaedi'),
  ('GANGO',   '7412AA02', 'active',  'NKTT maintenance'),
  ('L200',    '0228AR00', 'active',  'NDB intallation'),
  ('GANGO',   '5258AZ00', 'active',  'NDB Maitenance'),
  ('NISSAN',  '6031AF00', 'reserve', 'reserve'),
  ('GANGO',   '1412AA02', 'reserve', 'reserve'),
  ('L200',    '7243AU00', 'active',  'ROSSO'),
  ('L200',    '5567AU00', 'active',  'TVZ')
)
INSERT INTO public.vehicles (type, immatriculation, statut, equipe_nom)
SELECT nv.type, nv.immatriculation, nv.statut, nv.equipe_nom
FROM new_vehicles nv
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicles v WHERE v.immatriculation = nv.immatriculation
);
