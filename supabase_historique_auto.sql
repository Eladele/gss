-- ─────────────────────────────────────────────────────────────────────────────
-- Historique des « non fait » toujours gardé (à exécuter une fois dans Supabase)
--
-- Avant : le motif et le commentaire « non fait » d'une fiche n'étaient archivés
-- (historique_clotures) que par le renvoi normal. Ils étaient perdus, sans trace, quand :
--   - le chef remettait la fiche « à faire » ou la reclôturait (fait / autre motif) ;
--   - la supervision l'affectait en cas urgent ;
--   - la fiche était modifiée depuis la page Situations.
-- Maintenant, la base archive elle-même le « non fait » dès qu'il est remplacé.
-- Exception : correction d'un clic par erreur (remise « à faire » moins de 30 min après).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.archiver_non_fait()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'non_ok'
     AND (NEW.status IS DISTINCT FROM 'non_ok' OR NEW.motif_cloture IS DISTINCT FROM OLD.motif_cloture)
     -- clic par erreur corrigé tout de suite : rien à garder
     AND NOT (NEW.status IN ('pending', 'urgent') AND OLD.traite_le IS NOT NULL AND now() - OLD.traite_le < interval '30 minutes'
              AND NEW.date_programme IS NOT DISTINCT FROM OLD.date_programme)
     -- déjà archivé (renvoi normal)
     AND NOT EXISTS (
       SELECT 1 FROM public.historique_clotures h
       WHERE h.situation_id = OLD.id AND h.traite_le IS NOT DISTINCT FROM OLD.traite_le
     )
  THEN
    INSERT INTO public.historique_clotures
      (situation_id, team_id, statut, motif_cloture, commentaire, poteau, date_programme, traite_par, traite_le, renvoye_par, renvoye_le)
    VALUES
      (OLD.id, OLD.team_id, 'non_ok', COALESCE(OLD.motif_cloture, ''), COALESCE(OLD.comment, ''), COALESCE(OLD.poteau, 0),
       -- la connexion n'utilise pas Supabase Auth (auth.uid() vide) : « renvoyé par » = la personne qui a changé la fiche
       OLD.date_programme, OLD.traite_par, OLD.traite_le, COALESCE(NEW.traite_par, NEW.distribue_par, OLD.traite_par), now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archiver_non_fait ON public.situations;
CREATE TRIGGER trg_archiver_non_fait
  AFTER UPDATE OF status, motif_cloture ON public.situations
  FOR EACH ROW EXECUTE FUNCTION public.archiver_non_fait();

-- Pas de doublon : si le renvoi normal archive la même clôture après le déclencheur, on l'ignore
CREATE OR REPLACE FUNCTION public.historique_sans_doublon()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.historique_clotures h
    WHERE h.situation_id = NEW.situation_id AND h.traite_le IS NOT DISTINCT FROM NEW.traite_le
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_historique_sans_doublon ON public.historique_clotures;
CREATE TRIGGER trg_historique_sans_doublon
  BEFORE INSERT ON public.historique_clotures
  FOR EACH ROW EXECUTE FUNCTION public.historique_sans_doublon();
