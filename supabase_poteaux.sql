-- ─────────────────────────────────────────────────────────────────────────────
-- Poteaux des fiches OT déjà en base (installation et dérangement)
--
-- Règle (la même que l'application) :
--   • « non fait » avec « Besoin poteau » (1), « Besoin 2 poteaux » (2) ou « Poteau cassé » (1) :
--     poteaux NÉCESSAIRES ;
--   • la fiche est faite ensuite (après renvoi) : ces poteaux deviennent des poteaux POSÉS
--     (avant, « fait » remettait le nombre à 0 et les poteaux disparaissaient des statistiques).
-- Le poteau d'une installation faite donne aussi +1 point de plantation (calculé par l'application).
-- Le motif peut contenir autre chose (« Besoin poteau + CST … »). Un nombre déjà saisi n'est
-- jamais diminué. À exécuter une fois dans l'éditeur SQL de Supabase (tout le fichier d'un coup).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.poteaux_motif(m text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  -- tout motif qui contient « besoin … poteau » (« Besoin 2 poteaux », « besoin de poteau … »)
  SELECT CASE
    WHEN coalesce(m, '') ~* 'besoin\s+(de\s+|d''un\s+)?2\s*poteaux?' THEN 2
    WHEN coalesce(m, '') ~* 'besoin\s+(de\s+|d''un\s+)?poteaux?' THEN 1
    WHEN coalesce(m, '') ~* 'poteau\s+cass' THEN 1
    ELSE 0
  END
$$;

DROP TABLE IF EXISTS pg_temp.correction_poteaux;
CREATE TEMP TABLE correction_poteaux AS
WITH besoin_passe AS (
  -- « non fait » passés (fiches renvoyées depuis)
  SELECT situation_id, max(pg_temp.poteaux_motif(motif_cloture)) AS n
  FROM public.historique_clotures_detail
  WHERE statut = 'non_ok'
  GROUP BY situation_id
)
SELECT s.id, s.numero_ot, s.status, coalesce(s.poteau, 0) AS ancien,
       greatest(
         coalesce(s.poteau, 0),
         CASE WHEN s.status = 'non_ok' THEN pg_temp.poteaux_motif(s.motif_cloture) ELSE 0 END,
         CASE WHEN s.status = 'ok' THEN coalesce(b.n, 0) ELSE 0 END
       ) AS nouveau
FROM public.situations s
LEFT JOIN besoin_passe b ON b.situation_id = s.id
WHERE s.status IN ('ok', 'non_ok');

-- correction ; le résultat liste les fiches changées (n° OT, statut, ancien et nouveau nombre)
UPDATE public.situations s
SET poteau = c.nouveau
FROM correction_poteaux c
WHERE s.id = c.id
  AND c.nouveau > c.ancien
RETURNING c.numero_ot, c.status, c.ancien, c.nouveau;
