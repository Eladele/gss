-- ============================================================================
-- MODULE MATÉRIEL / OUTILLAGE DES ÉQUIPES : table + import de l'inventaire
-- À exécuter dans Supabase SQL Editor APRÈS les migrations précédentes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.materiels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nom text NOT NULL,                  -- Marteau, Pince, Cliveuse fibre optique, Source Laser...
  equipe_nom text,                    -- équipe RH assignée (NULL = stock central)
  quantite integer NOT NULL DEFAULT 1,
  etat text NOT NULL DEFAULT 'bon'
    CHECK (etat = ANY (ARRAY['neuf'::text, 'bon'::text, 'a_reparer'::text, 'hors_service'::text])),
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT materiels_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_materiels_equipe_nom ON public.materiels (equipe_nom);

-- Import de l'inventaire initial (stock central, à réaffecter ensuite par équipe si besoin)
INSERT INTO public.materiels (nom, quantite, etat, notes) VALUES
  ('Soudeuse fibre optique', 2, 'bon', ''),
  ('Soudeuse fibre optique', 1, 'neuf', ''),
  ('Cliveuse fibre optique', 9, 'bon', ''),
  ('OTDR', 1, 'bon', ''),
  ('Power Meter', 10, 'bon', ''),
  ('Source Laser', 10, 'bon', ''),
  ('Stylo optique (VFL)', 1, 'bon', ''),
  ('Pince', 10, 'bon', ''),
  ('Échelle', 1, 'bon', ''),
  ('Grimpettes', 10, 'bon', ''),
  ('Aiguille de tirage 300 m', 1, 'bon', ''),
  ('Dévidoir de câble', 1, 'bon', ''),
  ('Boîte à outils', 1, 'bon', ''),
  ('Mètre ruban', 1, 'bon', ''),
  ('Marteau', 10, 'bon', ''),
  ('Tournevis (jeu complet)', 10, 'bon', ''),
  ('Coupe-câble fibre', 2, 'bon', ''),
  ('Nettoyeur de connecteurs fibre', 1, 'bon', ''),
  ('Alcool isopropylique', 1, 'bon', ''),
  ('Lingettes non pelucheuses', 1, 'bon', '1 boîte'),
  ('EPI (Casque, gants, gilet, chaussures)', 1, 'bon', '1 kit par agent');
