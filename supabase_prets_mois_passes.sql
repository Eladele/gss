-- ─────────────────────────────────────────────────────────────────────────────
-- Prêts actifs : chaque mois passé doit avoir son prélèvement réel
-- (à exécuter dans Supabase, après supabase_prets_distribution.sql).
--
-- Pour chaque prêt ACTIF, du mois du 1er prélèvement jusqu'au mois dernier :
--  • mois de congé de l'employé (congé qui commence ce mois) → pas de salaire, pas de prélèvement ;
--  • mois sans prélèvement enregistré :
--      1) d'abord couvert par le « déjà remboursé » (remboursements d'avant l'application,
--         qui n'avaient pas de mois) → le montant ne change pas, il est juste rangé dans le mois ;
--      2) sinon la mensualité est prélevée (rattrapage) → le reste dû baisse.
--  • les mois passés sont marqués « salaires distribués ».
-- Le mois en cours n'est pas touché : il est prélevé à la validation de sa distribution.
-- Les prêts soldés (dont les soldés sans prélèvement) ne sont pas touchés.
-- Relancer ce fichier ne fait rien de plus (les mois déjà prélevés sont ignorés).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fin    text := to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM'); -- dernier mois passé
  l        record;
  m        text;
  v_deja   numeric;
  v_reste  numeric;
  v_mt     numeric;
BEGIN
  FOR l IN SELECT * FROM public.loans WHERE statut = 'actif' AND mois_premier_prelevement <= v_fin ORDER BY date_debut LOOP
    v_deja := COALESCE(l.deja_rembourse, 0);
    SELECT l.montant_total - v_deja - COALESCE(SUM(p.montant), 0) INTO v_reste
    FROM public.loan_payments p WHERE p.loan_id = l.id;

    m := l.mois_premier_prelevement;
    WHILE m <= v_fin LOOP
      IF NOT EXISTS (SELECT 1 FROM public.loan_payments p WHERE p.loan_id = l.id AND p.month = m)
         AND NOT EXISTS (SELECT 1 FROM public.employee_leaves c
                         WHERE c.employee_id = l.employee_id AND to_char(c.date_debut, 'YYYY-MM') = m) THEN
        IF v_deja >= l.mensualite THEN
          -- remboursement d'avant l'application, rangé dans ce mois
          INSERT INTO public.loan_payments (loan_id, month, montant, source) VALUES (l.id, m, l.mensualite, 'reprise');
          v_deja := v_deja - l.mensualite;
        ELSIF v_reste > 0 THEN
          -- mois passé non prélevé : rattrapage de la mensualité
          v_mt := LEAST(l.mensualite, v_reste);
          INSERT INTO public.loan_payments (loan_id, month, montant, source) VALUES (l.id, m, v_mt, 'reprise');
          v_reste := v_reste - v_mt;
        END IF;
      END IF;
      m := public.mois_plus(m, 1);
    END LOOP;

    UPDATE public.loans SET deja_rembourse = v_deja WHERE id = l.id; -- recalcul reste / statut / fin / durée
  END LOOP;

  -- mois passés couverts par les prêts → salaires distribués
  INSERT INTO public.salary_months (mois, date_distribution, statut, distribue_le, distribue_par)
  SELECT DISTINCT p.month,
         (to_date(p.month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date,
         'distribue', now(), 'reprise historique'
  FROM public.loan_payments p
  WHERE p.month <= v_fin
  ON CONFLICT (mois) DO NOTHING;

  UPDATE public.loans SET id = id; -- recalcul final de tous les prêts
END $$;

-- contrôle : échéances prélevées et reste dû de chaque prêt
SELECT e.name, l.montant_total, l.mensualite, l.reste, l.statut, l.deja_rembourse,
       l.mois_premier_prelevement AS premier, l.mois_fin_prevue AS fin, l.duree_mois,
       (SELECT count(*) FROM public.loan_payments p WHERE p.loan_id = l.id) AS nb_preleves,
       (SELECT string_agg(p.month, ', ' ORDER BY p.month) FROM public.loan_payments p WHERE p.loan_id = l.id) AS mois_preleves
FROM public.loans l JOIN public.employees e ON e.id = l.employee_id
ORDER BY l.statut, e.name;
