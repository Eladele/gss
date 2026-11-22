-- ─────────────────────────────────────────────────────────────────────────────
-- Fiches OT déjà renvoyées (installation et dérangement) : nouvelle date « OT reçu le »
--
-- Règle (la même que l'application) :
--   • fiche dite « non faite » DANS son délai officiel → au renvoi, « OT reçu le » = jour du
--     renvoi (ex. installation reçue le 16, non faite le 16, renvoyée le 17, faite le 18 :
--     délai compté depuis le 17 → dans le délai) ;
--   • fiche dite « non faite » APRÈS son délai (ex. reçue le 16, échéance le 18, non faite le
--     19) → elle garde sa date et reste hors délai ;
--   • fiche dite « non faite » SANS motif → elle garde sa date (rien ne prouve un problème du
--     client).
-- Peut être exécuté de nouveau sans risque : une date n'est jamais reculée.
-- Délai officiel : dérangement 1 jour ouvré, installation 2. Ne comptent pas : les dimanches,
-- les jours fériés de l'application et ceux ajoutés dans la page Paramètres.
-- Plusieurs renvois : appliqués dans l'ordre. La date n'est jamais reculée, ni mise après le
-- jour du programme.
-- À exécuter une fois dans l'éditeur SQL de Supabase (tout le fichier d'un coup).
-- ─────────────────────────────────────────────────────────────────────────────

-- jours fériés ajoutés par l'administrateur (page Paramètres : app_settings « parametres_generaux »)
DROP TABLE IF EXISTS pg_temp.feries_parametres;
CREATE TEMP TABLE feries_parametres AS
SELECT DISTINCT j::date AS jour
FROM (
  SELECT CASE WHEN jsonb_typeof(v) = 'string' THEN (v #>> '{}')::jsonb ELSE v END AS o
  FROM (SELECT value::text::jsonb AS v FROM public.app_settings WHERE key = 'parametres_generaux') a
) b,
LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(b.o -> 'jours_feries') = 'array' THEN b.o -> 'jours_feries' ELSE '[]'::jsonb END
) AS j
WHERE j ~ '^\d{4}-\d{2}-\d{2}$';

-- jour ouvré : ni dimanche, ni jour férié de l'application (src/utils/stats.ts), ni jour férié
-- ajouté dans Paramètres
CREATE OR REPLACE FUNCTION pg_temp.ouvre(d date) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT extract(dow FROM d) <> 0
    AND NOT EXISTS (SELECT 1 FROM pg_temp.feries_parametres f WHERE f.jour = d)
    AND d <> ALL (ARRAY[
    '2026-01-01','2026-05-01','2026-05-25','2026-11-28','2026-03-20','2026-03-21','2026-05-27','2026-05-28','2026-06-16','2026-08-25',
    '2027-01-01','2027-05-01','2027-05-25','2027-11-28','2027-03-10','2027-03-11','2027-05-17','2027-05-18','2027-06-06','2027-08-15',
    '2028-01-01','2028-05-01','2028-05-25','2028-11-28','2028-02-27','2028-02-28','2028-05-05','2028-05-06','2028-08-03',
    '2029-01-01','2029-05-01','2029-05-25','2029-11-28','2029-02-15','2029-02-16','2029-04-24','2029-04-25','2029-05-14','2029-07-23',
    '2030-01-01','2030-05-01','2030-05-25','2030-11-28','2030-02-04','2030-02-05','2030-04-13','2030-04-14','2030-05-03','2030-07-12'
  ]::date[])
$$;

-- échéance officielle : n-ième jour ouvré après la réception
CREATE OR REPLACE FUNCTION pg_temp.echeance_off(d date, n int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT x::date
  FROM generate_series(d + 1, d + 40, interval '1 day') AS x
  WHERE pg_temp.ouvre(x::date)
  ORDER BY x
  OFFSET n - 1 LIMIT 1
$$;

DROP TABLE IF EXISTS pg_temp.correction_renvoi;
CREATE TEMP TABLE correction_renvoi AS
WITH RECURSIVE
renvois AS (
  SELECT h.situation_id,
         (h.traite_le  AT TIME ZONE 'Africa/Nouakchott')::date AS jour_non_fait,
         (h.renvoye_le AT TIME ZONE 'Africa/Nouakchott')::date AS jour_renvoi,
         row_number() OVER (PARTITION BY h.situation_id ORDER BY h.renvoye_le) AS k
  FROM public.historique_clotures_detail h
  WHERE h.renvoye_le IS NOT NULL AND h.statut = 'non_ok'
    -- « non fait » sans motif : pas de nouvelle date (rien ne prouve un problème du client)
    AND coalesce(trim(h.motif_cloture), '') <> ''
),
marche AS (
  -- départ : date actuelle de la fiche
  SELECT s.id, 0::bigint AS k, COALESCE(s.date_recu, s.date_message) AS jour,
         CASE WHEN s.nature = 'installation' THEN 2 ELSE 1 END AS n,
         s.date_programme
  FROM public.situations s
  WHERE COALESCE(s.date_recu, s.date_message) IS NOT NULL
    AND EXISTS (SELECT 1 FROM renvois r WHERE r.situation_id = s.id)
  UNION ALL
  -- chaque renvoi, dans l'ordre : nouvelle date seulement si « non faite » dans le délai
  SELECT m.id, r.k,
         CASE
           WHEN r.jour_renvoi > m.jour
            AND r.jour_non_fait <= pg_temp.echeance_off(m.jour, m.n)
           THEN LEAST(r.jour_renvoi, COALESCE(m.date_programme, r.jour_renvoi))
           ELSE m.jour
         END,
         m.n, m.date_programme
  FROM marche m
  JOIN renvois r ON r.situation_id = m.id AND r.k = m.k + 1
)
SELECT DISTINCT ON (m.id) m.id, s.numero_ot, s.nature, COALESCE(s.date_recu, s.date_message) AS ancienne, m.jour AS nouvelle
FROM marche m
JOIN public.situations s ON s.id = m.id
ORDER BY m.id, m.k DESC;

-- correction ; le résultat liste les fiches changées (n° OT, nature, ancienne et nouvelle date)
UPDATE public.situations s
SET date_recu = c.nouvelle,
    date_message = c.nouvelle
FROM correction_renvoi c
WHERE s.id = c.id
  AND c.nouvelle > c.ancienne
RETURNING c.numero_ot, c.nature, c.ancienne, c.nouvelle;
