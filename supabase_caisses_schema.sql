-- ============================================================================
-- MODULE CAISSES — dépenses terrain, alimentations Bankily, validation comptable
-- et notifications en temps réel.
--
-- Qui fait quoi :
--   • Titulaires de caisse (eladel, habib — rôle admin) : demandent des dépenses
--     et des alimentations, voient leur solde.
--   • Comptable (betoul — rôle rh) : reçoit une notification à chaque demande,
--     valide / refuse, et enregistre les alimentations (transfert Bankily + Trs ID).
--   • Les admins voient tout et peuvent valider les demandes des AUTRES titulaires.
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor, puis exécuter
-- supabase_caisses_import_sept2026.sql pour reprendre l'historique WhatsApp.
-- ============================================================================

-- ─── 1. CAISSES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caisses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom           TEXT NOT NULL,
    titulaire_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    telephone     TEXT DEFAULT '',          -- numéro Bankily qui reçoit les transferts
    seuil_alerte  INTEGER DEFAULT 5000,     -- en dessous : "solde bas"
    actif         BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. OPÉRATIONS (dépenses + alimentations) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.caisse_operations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id        UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK (type IN ('depense', 'alimentation')),
    montant          INTEGER NOT NULL CHECK (montant > 0),           -- MRU
    date_op          DATE NOT NULL DEFAULT CURRENT_DATE,
    libelle          TEXT NOT NULL DEFAULT '',
    categorie        TEXT NOT NULL DEFAULT 'autre',
    chantier         TEXT DEFAULT '',                                 -- ville / zone (Rosso, Kaédi, CI1Z01…)
    trs_id           TEXT,                                            -- référence du transfert Bankily
    statut           TEXT NOT NULL DEFAULT 'en_attente'
                         CHECK (statut IN ('en_attente', 'validee', 'rejetee', 'annulee')),
    demande_par      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    demande_par_nom  TEXT,
    traite_par       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    traite_par_nom   TEXT,
    traite_le        TIMESTAMPTZ,
    motif_rejet      TEXT,
    note             TEXT DEFAULT '',
    source           TEXT DEFAULT 'app',                              -- app | whatsapp | bankily
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Un même transfert Bankily ne peut pas être enregistré deux fois
CREATE UNIQUE INDEX IF NOT EXISTS caisse_operations_trs_id_uniq
    ON public.caisse_operations (trs_id) WHERE trs_id IS NOT NULL AND trs_id <> '';
CREATE INDEX IF NOT EXISTS caisse_operations_caisse_date_idx ON public.caisse_operations (caisse_id, date_op DESC);
CREATE INDEX IF NOT EXISTS caisse_operations_statut_idx      ON public.caisse_operations (statut);

CREATE OR REPLACE FUNCTION public.caisse_touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS caisse_operations_touch ON public.caisse_operations;
CREATE TRIGGER caisse_operations_touch BEFORE UPDATE ON public.caisse_operations
    FOR EACH ROW EXECUTE FUNCTION public.caisse_touch_updated_at();

-- ─── 3. NOTIFICATIONS (persistées, une ligne par destinataire) ────────────
CREATE TABLE IF NOT EXISTS public.app_notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destinataire_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    titre            TEXT NOT NULL,
    message          TEXT NOT NULL DEFAULT '',
    type             TEXT NOT NULL DEFAULT 'info',   -- demande_depense | demande_alimentation | validee | rejetee | alimentation
    module           TEXT NOT NULL DEFAULT 'caisse',
    ref_id           UUID,                            -- opération concernée
    lu               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_notifications_dest_idx ON public.app_notifications (destinataire_id, lu, created_at DESC);

-- ─── 4. NOTIFICATIONS AUTOMATIQUES (côté base, fiables même hors appli) ───
-- Format "20 000 MRU"
CREATE OR REPLACE FUNCTION public.fmt_mru(n BIGINT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(n::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g') || ' MRU'
$$;

-- a) À la création : une demande → comptable(s) + admins (sauf le demandeur).
--    Un collage WhatsApp de 8 lignes = UNE seule notification groupée.
--    Une alimentation enregistrée directement → le titulaire de la caisse.
CREATE OR REPLACE FUNCTION public.caisse_notify_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO app_notifications (destinataire_id, titre, message, type, ref_id)
    SELECT p.id,
           CASE WHEN g.type = 'depense'
                THEN CASE WHEN g.nb > 1 THEN g.nb || ' demandes de dépense' ELSE 'Demande de dépense' END
                ELSE 'Demande d''alimentation' END,
           COALESCE(g.demandeur, 'Un titulaire') || ' · ' || g.caisse || ' · ' || fmt_mru(g.total)
             || CASE WHEN g.nb = 1 AND g.libelle <> '' THEN ' — ' || g.libelle ELSE '' END,
           CASE WHEN g.type = 'depense' THEN 'demande_depense' ELSE 'demande_alimentation' END,
           g.ref_id
    FROM (
        SELECT n.type, n.demande_par, MAX(n.demande_par_nom) AS demandeur, c.nom AS caisse,
               COUNT(*) AS nb, SUM(n.montant) AS total, MAX(n.libelle) AS libelle,
               (ARRAY_AGG(n.id))[1] AS ref_id
        FROM nouvelles n JOIN caisses c ON c.id = n.caisse_id
        WHERE n.statut = 'en_attente'
        GROUP BY n.type, n.demande_par, c.nom
    ) g
    JOIN profiles p ON p.role::text IN ('rh', 'admin') AND p.id IS DISTINCT FROM g.demande_par;

    INSERT INTO app_notifications (destinataire_id, titre, message, type, ref_id)
    SELECT c.titulaire_id, 'Caisse alimentée',
           'Votre caisse ' || c.nom || ' a reçu ' || fmt_mru(n.montant)
             || COALESCE(' · Trs ' || NULLIF(n.trs_id, ''), '')
             || COALESCE(' · par ' || n.traite_par_nom, ''),
           'alimentation', n.id
    FROM nouvelles n JOIN caisses c ON c.id = n.caisse_id
    WHERE n.type = 'alimentation' AND n.statut = 'validee'
      AND c.titulaire_id IS NOT NULL AND c.titulaire_id IS DISTINCT FROM n.traite_par;
    RETURN NULL;
END $$;

-- b) À la validation / au refus : le demandeur est prévenu (groupé si validation en lot).
CREATE OR REPLACE FUNCTION public.caisse_notify_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO app_notifications (destinataire_id, titre, message, type, ref_id)
    SELECT g.demande_par,
           CASE
             WHEN g.statut = 'validee' AND g.type = 'depense'
               THEN CASE WHEN g.nb > 1 THEN g.nb || ' dépenses validées' ELSE 'Dépense validée' END
             WHEN g.statut = 'validee' THEN 'Alimentation effectuée'
             WHEN g.type = 'depense'
               THEN CASE WHEN g.nb > 1 THEN g.nb || ' dépenses refusées' ELSE 'Dépense refusée' END
             ELSE 'Demande d''alimentation refusée'
           END,
           fmt_mru(g.total)
             || CASE WHEN g.nb = 1 AND g.libelle <> '' AND g.type = 'depense' THEN ' — ' || g.libelle ELSE '' END
             || CASE WHEN g.statut = 'validee' AND g.type = 'alimentation' AND g.trs <> '' THEN ' · Trs ' || g.trs ELSE '' END
             || CASE WHEN g.statut = 'rejetee' AND g.motif <> '' THEN ' · Motif : ' || g.motif ELSE '' END
             || COALESCE(' · par ' || g.par, ''),
           CASE WHEN g.statut = 'validee' THEN 'validee' ELSE 'rejetee' END,
           g.ref_id
    FROM (
        SELECT n.demande_par, n.statut, n.type, COUNT(*) AS nb, SUM(n.montant) AS total,
               MAX(n.libelle) AS libelle, COALESCE(MAX(n.trs_id), '') AS trs,
               COALESCE(MAX(n.motif_rejet), '') AS motif, MAX(n.traite_par_nom) AS par,
               (ARRAY_AGG(n.id))[1] AS ref_id
        FROM nouvelles n JOIN anciennes o ON o.id = n.id
        WHERE o.statut = 'en_attente' AND n.statut IN ('validee', 'rejetee')
          AND n.demande_par IS NOT NULL AND n.demande_par IS DISTINCT FROM n.traite_par
        GROUP BY n.demande_par, n.statut, n.type
    ) g;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS caisse_operations_notify_ins ON public.caisse_operations;
CREATE TRIGGER caisse_operations_notify_ins AFTER INSERT ON public.caisse_operations
    REFERENCING NEW TABLE AS nouvelles
    FOR EACH STATEMENT EXECUTE FUNCTION public.caisse_notify_insert();

DROP TRIGGER IF EXISTS caisse_operations_notify_upd ON public.caisse_operations;
CREATE TRIGGER caisse_operations_notify_upd AFTER UPDATE ON public.caisse_operations
    REFERENCING OLD TABLE AS anciennes NEW TABLE AS nouvelles
    FOR EACH STATEMENT EXECUTE FUNCTION public.caisse_notify_update();

-- ─── 5. ROW LEVEL SECURITY (même modèle que le reste de l'appli : clé anon) ─
ALTER TABLE public.caisses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisse_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caisses_all"           ON public.caisses;
DROP POLICY IF EXISTS "caisse_operations_all" ON public.caisse_operations;
DROP POLICY IF EXISTS "app_notifications_all" ON public.app_notifications;
CREATE POLICY "caisses_all"           ON public.caisses           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "caisse_operations_all" ON public.caisse_operations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "app_notifications_all" ON public.app_notifications FOR ALL USING (true) WITH CHECK (true);

-- ─── 6. TEMPS RÉEL (badge + alerte instantanée dans l'appli) ──────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.caisse_operations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.caisses;           EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 7. CAISSES INITIALES ─────────────────────────────────────────────────
INSERT INTO public.caisses (nom, titulaire_id, telephone)
SELECT 'El Adel', p.id, '32103354' FROM public.profiles p
WHERE lower(p.name) = 'eladel'
  AND NOT EXISTS (SELECT 1 FROM public.caisses WHERE nom = 'El Adel');

INSERT INTO public.caisses (nom, titulaire_id, telephone)
SELECT 'Habib', p.id, '46746412' FROM public.profiles p
WHERE lower(p.name) = 'habib'
  AND NOT EXISTS (SELECT 1 FROM public.caisses WHERE nom = 'Habib');

-- Vérification : Betoul doit avoir le rôle 'rh' (comptable) pour recevoir les demandes.
-- SELECT id, name, role FROM public.profiles WHERE role::text IN ('admin', 'rh');
