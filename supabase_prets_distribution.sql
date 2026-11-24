-- ─────────────────────────────────────────────────────────────────────────────
-- Prêts, distribution des salaires et congés (à exécuter une fois dans Supabase)
--
-- Règles appliquées :
--  1. 1er prélèvement d'un prêt = le MOIS DU PRÊT.
--     Si les salaires de ce mois sont déjà distribués, on passe au premier mois pas encore distribué.
--     → une avance (mensualité = montant total) est soldée en entier sur ce salaire.
--  2. Le jour de distribution des salaires n'est pas fixe : chaque mois a sa propre
--     date (table salary_months). Valider la distribution enregistre les prélèvements.
--  3. Durée automatique : échéances = montant ÷ mensualité (arrondi au-dessus).
--     Un mois distribué SANS prélèvement (congé, salaire suspendu, salaire insuffisant)
--     repousse la fin du prêt d'un mois. reste / statut / durée / fin prévue sont
--     recalculés par la base à chaque prélèvement ou distribution.
--  4. Données existantes conservées : ce qui a été remboursé avant l'application
--     (reste déjà plus bas que les prélèvements enregistrés) va dans deja_rembourse,
--     le reste dû actuel de chaque prêt ne change donc pas.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Colonnes ─────────────────────────────────────────────────────────────
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS mois_premier_prelevement text;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS mois_fin_prevue text;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS deja_rembourse numeric NOT NULL DEFAULT 0;
ALTER TABLE public.loan_payments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manuel';

-- ─── 2. Mois de paie (date de distribution libre) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_months (
    mois              text PRIMARY KEY CHECK (mois ~ '^\d{4}-\d{2}$'), -- 'YYYY-MM'
    date_distribution date NOT NULL,
    statut            text NOT NULL DEFAULT 'prevu' CHECK (statut IN ('prevu', 'distribue')),
    distribue_le      timestamptz,
    distribue_par     text,
    total_net         numeric,
    created_at        timestamptz DEFAULT now()
);
ALTER TABLE public.salary_months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS salary_months_all ON public.salary_months;
CREATE POLICY salary_months_all ON public.salary_months FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. Outils mois 'YYYY-MM' ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mois_plus(p_mois text, p_n int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(to_date(p_mois || '-01', 'YYYY-MM-DD') + make_interval(months => p_n), 'YYYY-MM');
$$;

-- nombre de mois de a vers b (b - a)
CREATE OR REPLACE FUNCTION public.mois_ecart(a text, b text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT (split_part(b, '-', 1)::int * 12 + split_part(b, '-', 2)::int)
       - (split_part(a, '-', 1)::int * 12 + split_part(a, '-', 2)::int);
$$;

-- ─── 4. Reprise des données existantes (AVANT les déclencheurs) ─────────────
-- 4a. remboursé hors application = montant - reste actuel - prélèvements enregistrés
UPDATE public.loans l
SET deja_rembourse = GREATEST(0, l.montant_total - l.reste - COALESCE(p.total, 0))
FROM (SELECT loan_id, SUM(montant) AS total FROM public.loan_payments GROUP BY loan_id) p
WHERE p.loan_id = l.id;
UPDATE public.loans l
SET deja_rembourse = GREATEST(0, l.montant_total - l.reste)
WHERE NOT EXISTS (SELECT 1 FROM public.loan_payments p WHERE p.loan_id = l.id);

-- 4b. mois passés où des prélèvements ont eu lieu → salaires distribués
--     (date réelle inconnue : dernier jour du mois, modifiable dans l'application)
INSERT INTO public.salary_months (mois, date_distribution, statut, distribue_le, distribue_par)
SELECT DISTINCT p.month,
       (to_date(p.month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date,
       'distribue', now(), 'reprise historique'
FROM public.loan_payments p
WHERE p.month < to_char(now(), 'YYYY-MM')
ON CONFLICT (mois) DO NOTHING;

-- 1er prélèvement automatique : mois du prêt, ou le premier mois pas encore distribué
CREATE OR REPLACE FUNCTION public.mois_premier_auto(p_date date)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v text := to_char(p_date, 'YYYY-MM');
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.salary_months s WHERE s.mois = v AND s.statut = 'distribue') LOOP
    v := public.mois_plus(v, 1);
  END LOOP;
  RETURN v;
END;
$$;

-- 4c. 1er prélèvement = mois du prêt (ou le 1er prélèvement réellement fait s'il est plus tôt).
--     Appliqué à tous les prêts : corrige aussi une exécution précédente de ce fichier.
UPDATE public.loans l
SET mois_premier_prelevement = LEAST(
      public.mois_premier_auto(l.date_debut),
      COALESCE((SELECT MIN(p.month) FROM public.loan_payments p WHERE p.loan_id = l.id), '9999-12'));

-- ─── 5. Calcul automatique d'un prêt ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcul_pret()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_paye     numeric;
  v_dernier  text;
  v_dist     text;
  v_proch    text;
BEGIN
  IF NEW.mensualite IS NULL OR NEW.mensualite <= 0 THEN
    RAISE EXCEPTION 'La mensualité doit être supérieure à 0';
  END IF;
  NEW.deja_rembourse := COALESCE(NEW.deja_rembourse, 0);

  -- 1er prélèvement : mois du prêt, ou le premier mois pas encore distribué
  IF NEW.mois_premier_prelevement IS NULL OR NEW.mois_premier_prelevement = '' THEN
    NEW.mois_premier_prelevement := public.mois_premier_auto(NEW.date_debut);
  END IF;

  SELECT COALESCE(SUM(p.montant), 0), MAX(p.month) INTO v_paye, v_dernier
  FROM public.loan_payments p WHERE p.loan_id = NEW.id;

  NEW.reste  := GREATEST(0, NEW.montant_total - NEW.deja_rembourse - v_paye);
  NEW.statut := CASE WHEN NEW.reste <= 0 THEN 'solde' ELSE 'actif' END;

  IF NEW.reste <= 0 THEN
    NEW.mois_fin_prevue := COALESCE(v_dernier,
      public.mois_plus(NEW.mois_premier_prelevement, GREATEST(1, CEIL(NEW.montant_total / NEW.mensualite)::int) - 1));
  ELSE
    -- prochain mois prélevable : après le dernier mois distribué et le dernier prélèvement
    SELECT MAX(s.mois) INTO v_dist FROM public.salary_months s WHERE s.statut = 'distribue';
    v_proch := GREATEST(NEW.mois_premier_prelevement,
                        COALESCE(public.mois_plus(v_dist, 1), ''),
                        COALESCE(public.mois_plus(v_dernier, 1), ''));
    NEW.mois_fin_prevue := public.mois_plus(v_proch, CEIL(NEW.reste / NEW.mensualite)::int - 1);
  END IF;

  -- durée réelle (inclut les mois non prélevés)
  NEW.duree_mois := GREATEST(1, public.mois_ecart(NEW.mois_premier_prelevement, NEW.mois_fin_prevue) + 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calcul_pret ON public.loans;
CREATE TRIGGER trg_calcul_pret BEFORE INSERT OR UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.calcul_pret();

-- un prélèvement ajouté / supprimé → recalcul du prêt
CREATE OR REPLACE FUNCTION public.recalcul_pret_apres_paiement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.loans SET id = id WHERE id = COALESCE(NEW.loan_id, OLD.loan_id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_recalcul_pret_paiement ON public.loan_payments;
CREATE TRIGGER trg_recalcul_pret_paiement AFTER INSERT OR UPDATE OR DELETE ON public.loan_payments
FOR EACH ROW EXECUTE FUNCTION public.recalcul_pret_apres_paiement();

-- une distribution validée / annulée → recalcul des prêts (fin prévue, durée)
CREATE OR REPLACE FUNCTION public.recalcul_prets_apres_distribution()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.loans SET id = id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_recalcul_prets_distribution ON public.salary_months;
CREATE TRIGGER trg_recalcul_prets_distribution AFTER INSERT OR UPDATE OR DELETE ON public.salary_months
FOR EACH STATEMENT EXECUTE FUNCTION public.recalcul_prets_apres_distribution();

-- ─── 6. Valider / annuler la distribution d'un mois ─────────────────────────
-- p_prelevements : [{ "loan_id": "...", "montant": 1000 }, ...] calculé par l'application
-- (congés, salaire suspendu, salaire insuffisant déjà pris en compte).
CREATE OR REPLACE FUNCTION public.valider_distribution_salaire(
  p_mois text, p_date date, p_par text, p_total numeric, p_prelevements jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.salary_months WHERE mois = p_mois AND statut = 'distribue') THEN
    RAISE EXCEPTION 'Les salaires de % sont déjà distribués', p_mois;
  END IF;

  INSERT INTO public.salary_months (mois, date_distribution, statut, distribue_le, distribue_par, total_net)
  VALUES (p_mois, p_date, 'distribue', now(), p_par, p_total)
  ON CONFLICT (mois) DO UPDATE
    SET date_distribution = EXCLUDED.date_distribution, statut = 'distribue',
        distribue_le = now(), distribue_par = EXCLUDED.distribue_par, total_net = EXCLUDED.total_net;

  INSERT INTO public.loan_payments (loan_id, month, montant, source)
  SELECT (x->>'loan_id')::uuid, p_mois, (x->>'montant')::numeric, 'distribution'
  FROM jsonb_array_elements(COALESCE(p_prelevements, '[]'::jsonb)) x
  WHERE (x->>'montant')::numeric > 0
  ON CONFLICT (loan_id, month) DO NOTHING;
END;
$$;

-- Annulation : seulement le dernier mois distribué ; supprime les prélèvements
-- créés par la distribution (les prélèvements manuels restent).
-- SECURITY DEFINER : la clé de l'application ne peut pas supprimer dans loan_payments.
CREATE OR REPLACE FUNCTION public.annuler_distribution_salaire(p_mois text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.salary_months WHERE statut = 'distribue' AND mois > p_mois) THEN
    RAISE EXCEPTION 'Annulez d''abord les distributions des mois suivants';
  END IF;
  DELETE FROM public.loan_payments WHERE month = p_mois AND source = 'distribution';
  UPDATE public.salary_months
  SET statut = 'prevu', distribue_le = NULL, distribue_par = NULL, total_net = NULL
  WHERE mois = p_mois;
END;
$$;

GRANT EXECUTE ON FUNCTION public.valider_distribution_salaire(text, date, text, numeric, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annuler_distribution_salaire(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mois_plus(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mois_ecart(text, text) TO anon, authenticated;

-- ─── 7. Recalcul de tous les prêts existants ────────────────────────────────
UPDATE public.loans SET id = id;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_months;
EXCEPTION WHEN others THEN NULL;
END $$;
