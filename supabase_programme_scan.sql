-- ============================================================================
-- LIAISON PROGRAMME (fiches OT) ↔ SCANS RÉSEAU (scan_results)
--
-- Le lien se fait par le numéro de série de l'ONT :
--   fiche OT : 48575443B2FCC9AE      fichier de scan : HWTCB2FCC9AE ou 48575443B2FCC9AE
--   (48575443 = « HWTC » écrit en hexadécimal : les deux formes sont reconnues)
--
-- Pour chaque fiche, la vue programme_ot_scan donne :
--   • scan_avant_*   : état de l'ONT dans le dernier import fait AVANT la réception de l'OT
--                      (dérangement : l'ONT était-il déjà non scanné avant la panne ?)
--   • scan_dernier_* : état de l'ONT dans le DERNIER import
--                      (installation : la nouvelle installation est-elle bien scannée ?)
--   résultat : 'SCANNE', 'NON SCANE', ou 'ABSENT' (ONT absent du fichier), NULL si aucun import.
--
-- C'est le fichier de scan qui fait foi : la case « Scanné » cochée par le chef est une
-- déclaration, comparée au fichier dans le rapport.
--
-- À exécuter dans Supabase → SQL Editor, après supabase_programme_ot_schema.sql.
-- Réexécutable sans risque.
-- ============================================================================

-- Numéro de série normalisé : majuscules, sans espaces ni tirets, préfixe fabricant
-- en lettres (HWTC, ZTEG…) converti en hexadécimal.
CREATE OR REPLACE FUNCTION public.norm_ont(sn TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN s ~ '^[A-Z]{4}[0-9A-F]{8}$' THEN upper(encode(convert_to(substr(s, 1, 4), 'UTF8'), 'hex')) || substr(s, 5)
        ELSE s
    END
    FROM (SELECT upper(regexp_replace(COALESCE(sn, ''), '[^A-Za-z0-9]', '', 'g')) AS s) x
$$;

CREATE INDEX IF NOT EXISTS idx_scan_results_norm_ont ON public.scan_results (import_id, (public.norm_ont(sn_mac)));

CREATE OR REPLACE VIEW public.programme_ot_scan AS
SELECT
    o.id,
    avant.import_date  AS scan_avant_import,
    avant.result       AS scan_avant_result,
    dernier.import_date AS scan_dernier_import,
    dernier.result      AS scan_dernier_result,
    dernier.scan_time   AS scan_dernier_time,
    dernier.rx_power    AS scan_dernier_rx
FROM public.programme_ot o
LEFT JOIN LATERAL (
    SELECT h.imported_at AS import_date,
           COALESCE(s.result, 'ABSENT') AS result
    FROM public.scan_import_history h
    LEFT JOIN LATERAL (
        SELECT r.result FROM public.scan_results r
        WHERE r.import_id = h.id
          AND public.norm_ont(r.sn_mac) IN (SELECT public.norm_ont(x) FROM unnest(o.ont_serials) x)
        ORDER BY (r.result = 'SCANNE') DESC
        LIMIT 1
    ) s ON TRUE
    WHERE cardinality(o.ont_serials) > 0
      AND h.imported_at < COALESCE(o.date_recu, o.date_programme)::timestamptz
    ORDER BY h.imported_at DESC
    LIMIT 1
) avant ON TRUE
LEFT JOIN LATERAL (
    SELECT h.imported_at AS import_date,
           COALESCE(s.result, 'ABSENT') AS result,
           s.scan_time, s.rx_power
    FROM public.scan_import_history h
    LEFT JOIN LATERAL (
        SELECT r.result, r.scan_time, r.rx_power FROM public.scan_results r
        WHERE r.import_id = h.id
          AND public.norm_ont(r.sn_mac) IN (SELECT public.norm_ont(x) FROM unnest(o.ont_serials) x)
        ORDER BY (r.result = 'SCANNE') DESC
        LIMIT 1
    ) s ON TRUE
    WHERE cardinality(o.ont_serials) > 0
    ORDER BY h.imported_at DESC
    LIMIT 1
) dernier ON TRUE;

GRANT SELECT ON public.programme_ot_scan TO anon, authenticated;
