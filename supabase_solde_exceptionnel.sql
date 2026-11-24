-- ─────────────────────────────────────────────────────────────────────────────
-- Solder un prêt sans prélèvement (cas exceptionnel) — à exécuter une fois dans Supabase
-- (après supabase_prets_distribution.sql).
--
-- Le prêt se termine : le reste n'est plus retenu sur le salaire.
--  • les prélèvements des mois PAS ENCORE distribués sont retirés (rien n'est retenu ce mois-ci) ;
--  • les mois déjà distribués restent (l'argent a réellement été retenu) ;
--  • le montant restant est compté comme réglé hors salaire (deja_rembourse) → reste 0, soldé.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS motif_solde text;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS solde_hors_salaire_le timestamptz;

CREATE OR REPLACE FUNCTION public.solder_pret_exceptionnel(p_loan uuid, p_motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paye numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.loans WHERE id = p_loan) THEN
    RAISE EXCEPTION 'Prêt introuvable';
  END IF;

  DELETE FROM public.loan_payments p
  WHERE p.loan_id = p_loan
    AND NOT EXISTS (SELECT 1 FROM public.salary_months s WHERE s.mois = p.month AND s.statut = 'distribue');

  SELECT COALESCE(SUM(montant), 0) INTO v_paye FROM public.loan_payments WHERE loan_id = p_loan;

  UPDATE public.loans
  SET deja_rembourse = GREATEST(0, montant_total - v_paye),
      motif_solde = NULLIF(trim(COALESCE(p_motif, '')), ''),
      solde_hors_salaire_le = now()
  WHERE id = p_loan; -- le trigger calcul_pret recalcule reste (0), statut (soldé), fin et durée
END;
$$;
GRANT EXECUTE ON FUNCTION public.solder_pret_exceptionnel(uuid, text) TO anon, authenticated;

-- ─── Hamady Samba Diallo (Mle 2150) — prêt 7 000 MRU du 30/04/2026 ───────────
-- retire la mensualité de novembre 2026 (pas encore distribué) ; soldé, fin oct. 2026.
SELECT public.solder_pret_exceptionnel('9a59818b-abd6-4e8a-89e4-a954f6990e1e', 'Cas exceptionnel : prêt soldé sans prélèvement');

-- contrôle
SELECT l.montant_total, l.reste, l.statut, l.deja_rembourse, l.mois_fin_prevue, l.duree_mois, l.motif_solde,
       (SELECT string_agg(p.month || ' : ' || p.montant, ', ' ORDER BY p.month) FROM public.loan_payments p WHERE p.loan_id = l.id) AS prelevements
FROM public.loans l WHERE l.id = '9a59818b-abd6-4e8a-89e4-a954f6990e1e';
