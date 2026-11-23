-- ─────────────────────────────────────────────────────────────────────────────
-- Photo du programme de chaque jour : fiches encore en cours pour chaque équipe
--
-- La table programme_photo garde, pour chaque jour, les fiches OT encore ouvertes (à faire /
-- en cours / urgentes) avec leur équipe, telles qu'elles étaient en fin de journée. La
-- surveillance s'en sert pour un jour passé (ex. PDF du samedi 21 : ce qui était en cours
-- pour chaque équipe ce jour-là).
--
-- • La photo du jour est refaite à chaque changement de la table situations (distribution,
--   réaffectation, suppression, clôture…) et à l'ouverture des pages programme : la dernière
--   photo d'un jour est donc l'état de fin de journée. Les jours passés ne sont jamais modifiés.
-- • Jours passés avant cette mise en place : reconstitués une fois (30 derniers jours) à partir
--   des dates de remise et de clôture ; l'équipe est celle d'aujourd'hui (une réaffectation
--   faite depuis n'est pas connue).
--
-- À exécuter une fois dans l'éditeur SQL de Supabase (tout le fichier d'un coup).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.programme_photo (
  jour date NOT NULL,
  situation_id text NOT NULL,
  donnees jsonb NOT NULL, -- la ligne de situations_detail à ce moment-là
  pris_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jour, situation_id)
);

ALTER TABLE public.programme_photo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS programme_photo_lecture ON public.programme_photo;
CREATE POLICY programme_photo_lecture ON public.programme_photo FOR SELECT TO authenticated USING (true);
-- écriture seulement par la fonction ci-dessous

-- Refait la photo du jour (UTC, comme l'application) ; renvoie le nombre de fiches en cours
CREATE OR REPLACE FUNCTION public.photographier_programme()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jour date := (now() AT TIME ZONE 'UTC')::date;
  n integer;
BEGIN
  DELETE FROM public.programme_photo WHERE jour = v_jour;
  INSERT INTO public.programme_photo (jour, situation_id, donnees)
  SELECT v_jour, d.id::text, to_jsonb(d)
  FROM public.situations_detail d
  WHERE d.numero_ot IS NOT NULL
    AND d.team_id IS NOT NULL
    AND d.status IN ('pending', 'in_progress', 'urgent')
  ON CONFLICT (jour, situation_id) DO UPDATE SET donnees = EXCLUDED.donnees, pris_le = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.photographier_programme() TO authenticated;

-- Après chaque modification de situations (une fois par requête, pas par ligne) : la photo
-- du jour suit. Une erreur ici ne bloque jamais la modification elle-même.
CREATE OR REPLACE FUNCTION public.photo_programme_apres_modif()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.photographier_programme();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS photo_programme ON public.situations;
CREATE TRIGGER photo_programme
AFTER INSERT OR UPDATE OR DELETE ON public.situations
FOR EACH STATEMENT EXECUTE FUNCTION public.photo_programme_apres_modif();

-- Reconstitution des 30 derniers jours (une seule fois : les jours déjà photographiés sont
-- gardés). Une fiche était en cours le jour J si elle avait été remise à l'équipe au plus tard
-- ce jour-là et n'était pas encore clôturée à la fin du jour J.
INSERT INTO public.programme_photo (jour, situation_id, donnees)
SELECT j.jour::date, d.id::text,
       to_jsonb(d) || jsonb_build_object('status', 'pending', 'traite_le', NULL, 'motif_cloture', NULL)
FROM generate_series((now() AT TIME ZONE 'UTC')::date - 30, (now() AT TIME ZONE 'UTC')::date - 1, interval '1 day') AS j(jour)
JOIN public.situations_detail d
  ON d.numero_ot IS NOT NULL
 AND d.team_id IS NOT NULL
 AND COALESCE(d.assigne_le, d.created_at)::date <= j.jour::date
 AND (
   d.status IN ('pending', 'in_progress', 'urgent')
   OR COALESCE(d.traite_le, d.updated_at)::date > j.jour::date
 )
ON CONFLICT (jour, situation_id) DO NOTHING;

-- photo d'aujourd'hui tout de suite
SELECT public.photographier_programme();

NOTIFY pgrst, 'reload schema';
