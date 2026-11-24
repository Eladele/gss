-- ─────────────────────────────────────────────────────────────────────────────
-- Correction (à exécuter une fois dans Supabase) :
-- Ahmed Werzeg R'Chid (2 000 MRU) et El betoul limam (3 000 MRU), prêts du 26/10/2026,
-- ont été retenus sur le salaire d'OCTOBRE. Les prélèvements d'octobre sont déjà
-- enregistrés ; on supprime ceux de novembre (doublons) → prêts soldés en octobre.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.loan_payments
WHERE id IN ('17ad75c5-fb6b-4371-b780-b9a551a5b03a',   -- El betoul limam, nov. 2026, 3 000
             'e35bef20-7d02-4567-a6c8-f5661d1f76fe');  -- Ahmed Werzeg R'Chid, nov. 2026, 2 000

-- l'annulation d'une distribution doit pouvoir supprimer des prélèvements
ALTER FUNCTION public.annuler_distribution_salaire(text) SECURITY DEFINER;
ALTER FUNCTION public.annuler_distribution_salaire(text) SET search_path = public;
ALTER FUNCTION public.valider_distribution_salaire(text, date, text, numeric, jsonb) SECURITY DEFINER;
ALTER FUNCTION public.valider_distribution_salaire(text, date, text, numeric, jsonb) SET search_path = public;

-- contrôle : 1 prélèvement en 2026-10 chacun, soldé, fin 2026-10, durée 1 mois
SELECT l.id, l.montant_total, l.reste, l.statut, l.mois_premier_prelevement, l.mois_fin_prevue, l.duree_mois,
       (SELECT string_agg(p.month || ' : ' || p.montant, ', ') FROM public.loan_payments p WHERE p.loan_id = l.id) AS prelevements
FROM public.loans l
WHERE l.id IN ('feb6bea8-f574-4c12-9c32-6247fa0624ab', 'a63d1448-988a-4466-9bc7-3d6ced6af230');
