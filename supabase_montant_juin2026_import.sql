-- ============================================================================
-- SALAIRES (montant) — mise à jour depuis les ordres de virement de Juin 2026
--   N°22/DG/GSS/2026 (SGM, 13 employés) et N°23/DG/GSS/2026 (BPM, 2 employés)
-- Aucun changement de design : le fichier Excel des congés utilise déjà le
-- champ employees.montant — cette mise à jour le remplit simplement.
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

UPDATE public.employees SET montant = 10674.00 WHERE mle = '2136'; -- Dethie Ahmad Fall
UPDATE public.employees SET montant = 13236.00 WHERE mle = '2178'; -- Fah Massira Diagana
UPDATE public.employees SET montant = 10674.00 WHERE mle = '2140'; -- Mohamed Ahmed Sidi Vall
UPDATE public.employees SET montant =  7204.00 WHERE mle = '2152'; -- Moussa Boubou Banor
UPDATE public.employees SET montant =  9950.00 WHERE mle = '2159'; -- Achour Moulaye Sy Mohamed
UPDATE public.employees SET montant = 10674.00 WHERE mle = '2129'; -- Fara BeiliL
UPDATE public.employees SET montant = 15123.00 WHERE mle = '2132'; -- Sidi Hamdan Boilil
UPDATE public.employees SET montant = 11489.00 WHERE mle = '2123'; -- Mohamed Moustapha Diagne
UPDATE public.employees SET montant =  7205.00 WHERE mle = '2151'; -- Abou Hamady Dia
UPDATE public.employees SET montant =  9691.00 WHERE mle = '2163'; -- Zeyde Mohamed El Moctar
UPDATE public.employees SET montant =  9269.00 WHERE mle = '2164'; -- Diop Aboubecrine
UPDATE public.employees SET montant = 11489.00 WHERE mle = '2138'; -- Amadou Tidjani Diamala Thiam
UPDATE public.employees SET montant =  8291.00 WHERE mle = '2150'; -- Hamady Samba Diallo

-- L'employé BPM sans matricule a maintenant le Mle 2205 (ordre N°23) : on le complète
UPDATE public.employees SET mle = '2205' WHERE mle IS NULL AND name ILIKE '%ebetta%';
