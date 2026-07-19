-- ============================================================================
-- BANQUE / RIB DES EMPLOYÉS — d'après les ordres de virement GSS
--   N°003/DG/GSS (SGM) et N°004/DG/GSS/2026 (BPM)
-- Tous les autres employés (non listés dans ces virements) passent
-- par défaut sur la banque "Caisse".
-- À exécuter dans Supabase SQL Editor, APRÈS supabase_employees_equipes_import.sql
-- ============================================================================

-- 1) Employés des virements absents du tableau des équipes : on les crée
INSERT INTO public.employees (mle, name, banque, rib, actif)
SELECT v.mle, v.name, v.banque, v.rib, true
FROM (VALUES
  ('2136', 'Dethie Ahmad Fall',            'SGM', '00012 00001 00000071906 91'),
  ('2152', 'Moussa Boubou Banor',          'SGM', '00012 00001 00000072280 36'),
  ('2132', 'Sidi Hamdan Boilil',           'SGM', '00012 00001 00000071725 52'),
  ('2151', 'Abou Hamady Dia',              'SGM', '00012 00001 00000072286 18'),
  ('2124', 'Moussa Saidou Gadio',          'SGM', '00012 00001 00000071727 46'),
  ('2138', 'Amadou Tidjani Diamala Thiam', 'SGM', '00012 00001 00000071588 75'),
  ('2150', 'Hamady Samba Diallo',          'SGM', '00012 00001 00000071728 43'),
  ('2021', 'Mohamed Yahya Limam',          'BPM', '10202547')
) AS v(mle, name, banque, rib)
WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.mle = v.mle);

-- 2) Employés déjà existants (import équipes) : on complète banque + RIB, par Mle
UPDATE public.employees SET banque = 'SGM', rib = '00012 00002 00000224627 44' WHERE mle = '2178'; -- Fah Massira
UPDATE public.employees SET banque = 'SGM', rib = '00012 00001 00000071729 40' WHERE mle = '2140'; -- Mohamed Ahmed Sidi Vall
UPDATE public.employees SET banque = 'SGM', rib = '00012 00001 00000145206 90' WHERE mle = '2159'; -- Achour Mohamed
UPDATE public.employees SET banque = 'SGM', rib = '00012 00001 00000071578 08' WHERE mle = '2129'; -- Fara BeiliL
UPDATE public.employees SET banque = 'SGM', rib = '00012 00001 00000072177 54' WHERE mle = '2147'; -- Saïdou Samba Dieng
UPDATE public.employees SET banque = 'SGM', rib = '00012 00001 00000071904 97' WHERE mle = '2123'; -- Mohamed Moustapha Diagne
UPDATE public.employees SET banque = 'SGM', rib = '00012 00001 00000153535 32' WHERE mle = '2163'; -- Zeyde Med Elmoctar
UPDATE public.employees SET banque = 'SGM', rib = '00012 06001 00000166040 72' WHERE mle = '2164'; -- Aboubakrine Moussa Diop

-- Employé sans matricule (supervision NKTT), identifié par nom
UPDATE public.employees SET banque = 'BPM', rib = '10135439'
WHERE mle IS NULL AND name ILIKE '%ebetta%';

-- 3) Tous les autres employés (banque non renseignée) : par défaut Caisse
UPDATE public.employees SET banque = 'Caisse' WHERE banque IS NULL OR banque = '';
