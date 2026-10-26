-- ============================================================================
-- PROGRAMME PAR FICHES OT & SCANS RÉSEAU (FUSION COMPLÈTE)
--
-- 1. MODULE PROGRAMME OT :
--    - Table public.programme_ot (dérangements + installations)
--    - Gestion des fiches : N° OT, client, contacts, PCO/DIS/Port, ONT, etc.
--    - Clôture par les chefs (motif, décharge, scan, changement de constitution, poteaux)
--    - Date d'assignation dynamique (calcul du délai / points)
--    - Notifications automatiques vers les chefs et superviseurs (app_notifications)
--    - Politiques de sécurité RLS et activation Supabase Realtime
--
-- 2. LIAISON AVEC LES SCANS RÉSEAU :
--    - Fonction de normalisation des numéros de série ONT (norm_ont)
--    - Index optimisé sur scan_results
--    - Vue public.programme_ot_scan (état de l'ONT avant OT vs dernier scan)
--    - Permissions d'accès à la vue (anon, authenticated)
--
-- À exécuter dans Supabase → SQL Editor. Réexécutable sans risque (idempotent).
-- Prérequis : supabase_caisses_schema.sql (table app_notifications) et scan_results.
-- ============================================================================

-- ============================================================================
-- 1. TABLE PROGRAMME_OT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.programme_ot (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_ot         TEXT NOT NULL,                     -- "10/26 0103029"
    nature            TEXT NOT NULL CHECK (nature IN ('derangement', 'installation')),
    sous_type         TEXT DEFAULT '',                   -- défaut constaté / type d'OT réseau
    type_ot           TEXT DEFAULT '',                   -- CPL, CLS, TRL, RLR, CST, ANS, DRG...
    type_ligne        TEXT DEFAULT 'FGP',                -- FGP (fibre) ou TPH (téléphone)
    date_recu         DATE,                              -- « OT reçu le »
    date_programme    DATE NOT NULL DEFAULT CURRENT_DATE,
    fgp               TEXT DEFAULT '',
    client_code       TEXT DEFAULT '',
    client_nom        TEXT DEFAULT '',
    client_info       TEXT DEFAULT '',
    telephones        TEXT[] DEFAULT '{}',
    adresse           TEXT DEFAULT '',
    zone              TEXT DEFAULT '',
    pco               TEXT DEFAULT '',
    port              TEXT DEFAULT '',
    dis               TEXT DEFAULT '',
    ancien_dis        TEXT DEFAULT '',
    ont_serials       TEXT[] DEFAULT '{}',
    defaut            TEXT DEFAULT '',
    abonnement        TEXT DEFAULT '',
    cable_fibre_m     INTEGER,                           -- installation : câble fibre prévu (m)
    mise_en_service   TEXT DEFAULT '',
    equipe            TEXT DEFAULT '',                   -- nom de l'équipe (comme situations.equipe)
    statut            TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'non_fait')),
    motif             TEXT DEFAULT '',                   -- motif de clôture / non fait
    commentaire       TEXT DEFAULT '',
    decharge          BOOLEAN,                           -- décharge signée (fait)
    scanne            BOOLEAN,                           -- ONT scanné déclaré (fait)
    cst_change        BOOLEAN DEFAULT FALSE,             -- fait avec changement de constitution
    nouveau_dis       TEXT DEFAULT '',
    nouvel_ont        TEXT DEFAULT '',
    poteaux           INTEGER DEFAULT 0,                 -- poteaux comptés dans les statistiques
    assigne_le        TIMESTAMPTZ DEFAULT NOW(),         -- date de remise à l'équipe
    traite_par_nom    TEXT,
    traite_le         TIMESTAMPTZ,
    distribue_par_nom TEXT,
    source_fichier    TEXT DEFAULT '',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Rétrocompatibilité si la table existait déjà avec un schéma partiel
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS cable_fibre_m INTEGER;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS type_ot       TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS type_ligne    TEXT DEFAULT 'FGP';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS motif         TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS decharge      BOOLEAN;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS scanne        BOOLEAN;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS cst_change    BOOLEAN DEFAULT FALSE;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS nouveau_dis   TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS nouvel_ont    TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS poteaux       INTEGER DEFAULT 0;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS assigne_le    TIMESTAMPTZ;

-- Initialisation de assigne_le pour les enregistrements existants
UPDATE public.programme_ot SET assigne_le = created_at WHERE assigne_le IS NULL;

-- Index sur poteaux (> 0 pour les statistiques)
CREATE INDEX IF NOT EXISTS programme_ot_poteaux_idx ON public.programme_ot (poteaux) WHERE poteaux > 0;

-- Déclencheur pour mettre à jour assigne_le lors de l'insertion ou du changement d'équipe
CREATE OR REPLACE FUNCTION public.programme_ot_assigne() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.assigne_le := COALESCE(NEW.assigne_le, NOW());
    ELSIF lower(COALESCE(NEW.equipe, '')) <> lower(COALESCE(OLD.equipe, '')) THEN
        NEW.assigne_le := NOW();
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS programme_ot_assigne ON public.programme_ot;
CREATE TRIGGER programme_ot_assigne BEFORE INSERT OR UPDATE ON public.programme_ot
    FOR EACH ROW EXECUTE FUNCTION public.programme_ot_assigne();

-- Index principaux
CREATE UNIQUE INDEX IF NOT EXISTS programme_ot_numero_uniq ON public.programme_ot (numero_ot);
CREATE INDEX IF NOT EXISTS programme_ot_equipe_idx ON public.programme_ot (lower(equipe), statut, date_programme DESC);
CREATE INDEX IF NOT EXISTS programme_ot_date_idx   ON public.programme_ot (date_programme DESC);
CREATE INDEX IF NOT EXISTS programme_ot_fgp_idx    ON public.programme_ot (fgp);

-- Déclencheur updated_at
CREATE OR REPLACE FUNCTION public.programme_ot_touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS programme_ot_touch ON public.programme_ot;
CREATE TRIGGER programme_ot_touch BEFORE UPDATE ON public.programme_ot
    FOR EACH ROW EXECUTE FUNCTION public.programme_ot_touch();

-- ============================================================================
-- 2. NOTIFICATIONS AUTOMATIQUES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.programme_resume(nb_der BIGINT, nb_ins BIGINT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT concat_ws(' · ',
        CASE WHEN nb_der > 0 THEN nb_der || ' dérangement' || CASE WHEN nb_der > 1 THEN 's' ELSE '' END END,
        CASE WHEN nb_ins > 0 THEN nb_ins || ' installation' || CASE WHEN nb_ins > 1 THEN 's' ELSE '' END END)
$$;

-- a) Distribution : notification envoyée au(x) chef(s) d'équipe lors d'un import
CREATE OR REPLACE FUNCTION public.programme_notify_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO app_notifications (destinataire_id, titre, message, type, module, ref_id)
    SELECT p.id,
           'Programme du ' || to_char(g.jour, 'DD/MM'),
           programme_resume(g.nb_der, g.nb_ins) || ' pour l''équipe ' || g.equipe
             || COALESCE(' · envoyé par ' || g.par, ''),
           'programme', 'programme', g.ref_id
    FROM (
        SELECT MAX(n.equipe) AS equipe, n.date_programme AS jour, MAX(n.distribue_par_nom) AS par,
               COUNT(*) FILTER (WHERE n.nature = 'derangement') AS nb_der,
               COUNT(*) FILTER (WHERE n.nature = 'installation') AS nb_ins,
               (ARRAY_AGG(n.id))[1] AS ref_id
        FROM nouvelles n
        WHERE COALESCE(n.equipe, '') <> ''
        GROUP BY lower(n.equipe), n.date_programme
    ) g
    JOIN teams t ON lower(t.name) = lower(g.equipe)
    JOIN profiles p ON p.team_id = t.id AND p.role::text = 'chef';
    RETURN NULL;
END $$;

-- b) Réaffectation à une autre équipe OU signalement « Non fait »
CREATE OR REPLACE FUNCTION public.programme_notify_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Notification au nouveau chef si l'équipe a changé
    INSERT INTO app_notifications (destinataire_id, titre, message, type, module, ref_id)
    SELECT p.id,
           'Programme du ' || to_char(g.jour, 'DD/MM') || ' : ajout',
           programme_resume(g.nb_der, g.nb_ins) || ' ajouté' || CASE WHEN g.nb_der + g.nb_ins > 1 THEN 's' ELSE '' END
             || ' à votre programme',
           'programme', 'programme', g.ref_id
    FROM (
        SELECT MAX(n.equipe) AS equipe, n.date_programme AS jour,
               COUNT(*) FILTER (WHERE n.nature = 'derangement') AS nb_der,
               COUNT(*) FILTER (WHERE n.nature = 'installation') AS nb_ins,
               (ARRAY_AGG(n.id))[1] AS ref_id
        FROM nouvelles n JOIN anciennes o ON o.id = n.id
        WHERE lower(COALESCE(n.equipe, '')) <> lower(COALESCE(o.equipe, '')) AND COALESCE(n.equipe, '') <> ''
        GROUP BY lower(n.equipe), n.date_programme
    ) g
    JOIN teams t ON lower(t.name) = lower(g.equipe)
    JOIN profiles p ON p.team_id = t.id AND p.role::text = 'chef';

    -- Notification aux superviseurs / admins si marqué « non fait »
    INSERT INTO app_notifications (destinataire_id, titre, message, type, module, ref_id)
    SELECT p.id,
           'Non fait — ' || COALESCE(NULLIF(n.type_ligne, ''), 'FGP') || ' ' || n.fgp,
           COALESCE(NULLIF(n.client_nom, ''), 'Client') || ' · équipe ' || COALESCE(NULLIF(n.equipe, ''), '?')
             || CASE WHEN COALESCE(n.motif, '') <> '' THEN ' · Motif : ' || n.motif ELSE '' END
             || CASE WHEN COALESCE(n.commentaire, '') <> '' THEN ' · ' || n.commentaire ELSE '' END,
           'programme_non_fait', 'programme', n.id
    FROM nouvelles n JOIN anciennes o ON o.id = n.id
    JOIN profiles p ON p.role::text IN ('admin', 'superviseur')
    WHERE n.statut = 'non_fait' AND o.statut <> 'non_fait';
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS programme_ot_notify_ins ON public.programme_ot;
CREATE TRIGGER programme_ot_notify_ins AFTER INSERT ON public.programme_ot
    REFERENCING NEW TABLE AS nouvelles
    FOR EACH STATEMENT EXECUTE FUNCTION public.programme_notify_insert();

DROP TRIGGER IF EXISTS programme_ot_notify_upd ON public.programme_ot;
CREATE TRIGGER programme_ot_notify_upd AFTER UPDATE ON public.programme_ot
    REFERENCING OLD TABLE AS anciennes NEW TABLE AS nouvelles
    FOR EACH STATEMENT EXECUTE FUNCTION public.programme_notify_update();

-- ============================================================================
-- 3. SÉCURITÉ RLS & TEMPS RÉEL
-- ============================================================================

ALTER TABLE public.programme_ot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "programme_ot_all" ON public.programme_ot;
CREATE POLICY "programme_ot_all" ON public.programme_ot FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.programme_ot;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 4. LIAISON PROGRAMME (fiches OT) ↔ SCANS RÉSEAU (scan_results)
-- ============================================================================

-- Normalisation du numéro de série ONT (majuscules, alphanumérique, préfixe converti)
CREATE OR REPLACE FUNCTION public.norm_ont(sn TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN s ~ '^[A-Z]{4}[0-9A-F]{8}$' THEN upper(encode(convert_to(substr(s, 1, 4), 'UTF8'), 'hex')) || substr(s, 5)
        ELSE s
    END
    FROM (SELECT upper(regexp_replace(COALESCE(sn, ''), '[^A-Za-z0-9]', '', 'g')) AS s) x
$$;

-- Index fonctionnel pour accélérer la recherche par ONT normalisé
CREATE INDEX IF NOT EXISTS idx_scan_results_norm_ont ON public.scan_results (import_id, (public.norm_ont(sn_mac)));

-- Vue faisant la correspondance entre les OT et les scans avant/après
CREATE OR REPLACE VIEW public.programme_ot_scan AS
SELECT
    o.id,
    avant.import_date   AS scan_avant_import,
    avant.result        AS scan_avant_result,
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

-- Permissions d'accès à la vue pour l'API Supabase
GRANT SELECT ON public.programme_ot_scan TO anon, authenticated;
