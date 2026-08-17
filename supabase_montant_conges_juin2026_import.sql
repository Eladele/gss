-- ============================================================================
-- COMPLÉMENT JUIN 2026 (version corrigée : cast explicite des dates)
-- ============================================================================

-- 1) Montants BPM juin 2026 (total virement N°23 = 110 352 MRU)
UPDATE public.employees SET montant = 88000.00 WHERE mle = '2021'; -- Mohamed Yahya Limam
UPDATE public.employees SET montant = 22352.00 WHERE mle = '2205'; -- Habiboullah Mohamed Val Ebetta

-- 2) Congé juin 2026 (mois complet par défaut — à corriger si tu as les dates exactes)
INSERT INTO public.employee_leaves (employee_id, type, date_debut, date_fin, jours, motif, created_by)
SELECT id, 'annuel', '2026-06-01'::date, '2026-06-30'::date, 22,
       'Congé juin 2026 — déduit de son absence du virement de paie N°22/DG/GSS/2026', 'admin'
FROM public.employees WHERE mle = '2129'  -- Fara BeiliL
UNION ALL
SELECT id, 'annuel', '2026-06-01'::date, '2026-06-30'::date, 22,
       'Congé juin 2026 — déduit de son absence du virement de paie N°22/DG/GSS/2026', 'admin'
FROM public.employees WHERE mle = '2147'; -- Saidou Samba Dieng
