-- ============================================================================
-- MATÉRIEL : ajout du champ `code` (référence interne pour affecter/partager
-- précisément un matériel à une équipe)
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.materiels ADD COLUMN IF NOT EXISTS code text;
CREATE INDEX IF NOT EXISTS idx_materiels_code ON public.materiels (code);

-- Attribution d'un code séquentiel aux matériels déjà importés qui n'en ont pas
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY nom) AS rn
  FROM public.materiels
  WHERE code IS NULL OR code = ''
)
UPDATE public.materiels m
SET code = 'MAT-' || lpad(numbered.rn::text, 3, '0')
FROM numbered
WHERE m.id = numbered.id;
