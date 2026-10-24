-- ============================================================================
-- PROGRAMME PAR FICHES OT (PDF Mauritel : dérangements + installations)
--
-- 1. Le superviseur importe les PDF « OT Dérangement » / « OT Réseau ».
--    L'appli lit chaque fiche : N° OT, FGP, client, téléphones, adresse,
--    ONT (numéro de série), DIS (zone, PCO, port).
-- 2. Chaque fiche part à l'équipe de sa zone (mêmes zones que l'import Excel),
--    modifiable avant l'envoi.
-- 3. Le chef d'équipe reçoit une notification et voit son programme avec les
--    numéros à appeler ; il marque chaque fiche « Fait » ou « Non fait » (motif).
--    Un « Non fait » prévient les superviseurs.
--
-- À exécuter dans Supabase → SQL Editor. Réexécutable sans risque.
-- Prérequis : supabase_caisses_schema.sql (table app_notifications).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.programme_ot (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_ot         TEXT NOT NULL,                     -- "10/26 0103029"
    nature            TEXT NOT NULL CHECK (nature IN ('derangement', 'installation')),
    sous_type         TEXT DEFAULT '',                   -- défaut constaté / type d'OT réseau
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
    cable_fibre_m     INTEGER,                           -- câble fibre prévu (mètres)
    mise_en_service   TEXT DEFAULT '',
    equipe            TEXT DEFAULT '',                   -- nom de l'équipe (comme situations.equipe)
    statut            TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'non_fait')),
    commentaire       TEXT DEFAULT '',
    traite_par_nom    TEXT,
    traite_le         TIMESTAMPTZ,
    distribue_par_nom TEXT,
    source_fichier    TEXT DEFAULT '',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS cable_fibre_m INTEGER;

-- Une fiche OT n'est distribuée qu'une fois (réimporter le même PDF ne crée pas de doublon)
CREATE UNIQUE INDEX IF NOT EXISTS programme_ot_numero_uniq ON public.programme_ot (numero_ot);
CREATE INDEX IF NOT EXISTS programme_ot_equipe_idx ON public.programme_ot (lower(equipe), statut, date_programme DESC);
CREATE INDEX IF NOT EXISTS programme_ot_date_idx   ON public.programme_ot (date_programme DESC);
CREATE INDEX IF NOT EXISTS programme_ot_fgp_idx    ON public.programme_ot (fgp);

CREATE OR REPLACE FUNCTION public.programme_ot_touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS programme_ot_touch ON public.programme_ot;
CREATE TRIGGER programme_ot_touch BEFORE UPDATE ON public.programme_ot
    FOR EACH ROW EXECUTE FUNCTION public.programme_ot_touch();

-- ─── Notifications ────────────────────────────────────────────────────────
-- Chefs d'une équipe : profiles.role = 'chef' rattachés à teams.name = equipe
CREATE OR REPLACE FUNCTION public.programme_resume(nb_der BIGINT, nb_ins BIGINT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT concat_ws(' · ',
        CASE WHEN nb_der > 0 THEN nb_der || ' dérangement' || CASE WHEN nb_der > 1 THEN 's' ELSE '' END END,
        CASE WHEN nb_ins > 0 THEN nb_ins || ' installation' || CASE WHEN nb_ins > 1 THEN 's' ELSE '' END END)
$$;

-- a) Distribution : UNE notification par équipe et par import
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

-- b) Réaffectation à une autre équipe → le nouveau chef ;
--    fiche « Non fait » → superviseurs et admins (avec le motif)
CREATE OR REPLACE FUNCTION public.programme_notify_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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

    INSERT INTO app_notifications (destinataire_id, titre, message, type, module, ref_id)
    SELECT p.id,
           'Non fait — FGP ' || n.fgp,
           COALESCE(NULLIF(n.client_nom, ''), 'Client') || ' · équipe ' || COALESCE(NULLIF(n.equipe, ''), '?')
             || CASE WHEN COALESCE(n.commentaire, '') <> '' THEN ' · Motif : ' || n.commentaire ELSE '' END,
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

-- ─── Accès (même modèle que le reste de l'appli : clé anon) ──────────────
ALTER TABLE public.programme_ot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "programme_ot_all" ON public.programme_ot;
CREATE POLICY "programme_ot_all" ON public.programme_ot FOR ALL USING (true) WITH CHECK (true);

-- ─── Temps réel ───────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.programme_ot; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vérification : chaque chef doit être rattaché à son équipe (team_id) pour être notifié
-- SELECT p.name, p.role, t.name AS equipe FROM profiles p LEFT JOIN teams t ON t.id = p.team_id WHERE p.role::text = 'chef';
