-- ============================================================================
-- GSS APP — SCHÉMA DE BASE DE DONNÉES COMPLET (FICHIER UNIQUE)
--
-- STRUCTURE DU FICHIER :
--   1. EXTENSIONS & TYPES ENUM
--   2. CRÉATION DES TABLES (20 tables ordonnées par dépendance)
--   3. COLONNES COMPLÉMENTAIRES (ALTER TABLE IF NOT EXISTS)
--   4. INDEX D'OPTIMISATION DE RECHERCHE ET PERFORMANCE
--   5. FONCTIONS MÉTIER & DÉCLENCHEURS AUTOMATIQUES (TRIGGERS)
--   6. SÉCURITÉ ROW LEVEL SECURITY (RLS) & PERMISSIONS
--   7. SYNCHRONISATION EN TEMPS RÉEL (SUPABASE REALTIME)
--   8. VUES (LIAISON PROGRAMME OT ↔ SCANS RÉSEAU)
--   9. DONNÉES INITIALES INDISPENSABLES (ÉQUIPES, PROFILS, CAISSES, CHARGES FIXES)
--
-- Réexécutable sans risque dans l'éditeur SQL de Supabase (idempotent).
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS & TYPES ENUM
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'superviseur', 'chef', 'rh');
EXCEPTION
    WHEN duplicate_object THEN
        -- S'assurer que le rôle 'rh' existe si l'enum existait déjà
        BEGIN
            ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rh';
        EXCEPTION WHEN others THEN NULL;
        END;
END $$;


-- ============================================================================
-- 2. CRÉATION DES TABLES
-- ============================================================================

-- ─── 2.1 Équipes terrain ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    leader_name TEXT,
    zones       TEXT[] DEFAULT '{}',
    elements    TEXT[] DEFAULT '{}',
    color       TEXT DEFAULT '#1565C0',
    ville       TEXT NOT NULL DEFAULT 'Nouakchott',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.2 Profils utilisateurs (authentification application) ────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    role          public.app_role NOT NULL DEFAULT 'chef',
    team_id       UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    password_hash TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.3 Historique des imports Excel de suivi ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name   TEXT NOT NULL,
    import_date TEXT,
    row_count   INTEGER DEFAULT 0,
    imported_by TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.4 Situations d'interventions (dérangements & installations) ───────────
CREATE TABLE IF NOT EXISTS public.situations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fgp                 TEXT NOT NULL,
    type                TEXT NOT NULL,
    zone                TEXT NOT NULL,
    equipe              TEXT,
    motif               TEXT DEFAULT '',
    date_depo           DATE,
    date_clt            DATE,
    delai               INTEGER DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'ok', 'non_ok', 'urgent')),
    comment             TEXT DEFAULT '',
    is_urgent           BOOLEAN DEFAULT FALSE,
    closed_by           TEXT,
    date_message        DATE,
    service_destination TEXT,
    nature              TEXT NOT NULL DEFAULT 'installation'
                            CHECK (nature IN ('installation', 'derangement')),
    conformite          TEXT CHECK (conformite IS NULL OR conformite IN ('TLID', 'HorsDelais')),
    import_id           UUID REFERENCES public.import_history(id) ON DELETE CASCADE,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.5 Programmes distribués (fichiers/plans) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.programs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_id     UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    file_url    TEXT,
    status      TEXT DEFAULT 'pending',
    due_date    DATE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.6 Employés RH ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mle           TEXT,
    name          TEXT NOT NULL,
    poste         TEXT,
    banque        TEXT,
    rib           TEXT,
    montant       NUMERIC,
    telephone     TEXT,
    date_embauche DATE,
    actif         BOOLEAN NOT NULL DEFAULT TRUE,
    equipe_nom    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.7 Congés employés ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_leaves (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'annuel'
                    CHECK (type IN ('annuel','maladie','sans_solde','exceptionnel','maternite','autre')),
    date_debut  DATE NOT NULL,
    date_fin    DATE NOT NULL,
    jours       INTEGER NOT NULL DEFAULT 0,
    motif       TEXT DEFAULT '',
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.8 Prêts employés ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    montant_total NUMERIC NOT NULL,
    mensualite    NUMERIC NOT NULL,
    date_debut    DATE NOT NULL,
    duree_mois    INTEGER,
    reste         NUMERIC NOT NULL,
    banque_caisse TEXT,
    statut        TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'solde')),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.9 Échéances des mensualités de prêts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loan_payments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id    UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    month      TEXT NOT NULL, -- Format 'YYYY-MM'
    montant    NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT loan_payments_loan_month_uniq UNIQUE (loan_id, month)
);

-- ─── 2.10 Véhicules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL,
    immatriculation TEXT UNIQUE,
    statut          TEXT NOT NULL DEFAULT 'active'
                        CHECK (statut IN ('active', 'reserve', 'maintenance')),
    statut_depuis   TIMESTAMPTZ DEFAULT NOW(),
    equipe_nom      TEXT,
    chauffeur_id    UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    notes           TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.11 Matériels & Outillage ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.materiels (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT,
    nom        TEXT NOT NULL,
    equipe_nom TEXT,
    quantite   INTEGER NOT NULL DEFAULT 1,
    etat       TEXT NOT NULL DEFAULT 'bon'
                   CHECK (etat IN ('neuf', 'bon', 'a_reparer', 'hors_service')),
    notes      TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.12 Chantiers de déploiement ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chantiers (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                        TEXT NOT NULL,
    zone                       TEXT,
    ville                      TEXT,
    equipe_nom                 TEXT,
    type_deploiement           TEXT DEFAULT 'aerien' CHECK (type_deploiement IN ('aerien', 'souterrain')),
    statut                     TEXT NOT NULL DEFAULT 'en_cours',
    date_debut                 DATE,
    date_fin_prevue            DATE,
    poteaux_prevus             INTEGER DEFAULT 0,
    poteaux_poses              INTEGER DEFAULT 0,
    tranchee_prevue_m          NUMERIC DEFAULT 0,
    tranchee_posee_m           NUMERIC DEFAULT 0,
    blocage_prevu              INTEGER DEFAULT 0,
    blocage_fait               INTEGER DEFAULT 0,
    ouverture_prevue           INTEGER DEFAULT 0,
    ouverture_faite            INTEGER DEFAULT 0,
    closer_mpo_prevu           INTEGER DEFAULT 0,
    closer_mpo_fait            INTEGER DEFAULT 0,
    closer_dis_prevu           INTEGER DEFAULT 0,
    closer_dis_fait            INTEGER DEFAULT 0,
    x_box_prevus               INTEGER DEFAULT 0,
    x_box_poses                INTEGER DEFAULT 0,
    hub_box_prevus             INTEGER DEFAULT 0,
    hub_box_poses              INTEGER DEFAULT 0,
    sub_box_prevus             INTEGER DEFAULT 0,
    sub_box_poses              INTEGER DEFAULT 0,
    end_box_prevus             INTEGER DEFAULT 0,
    end_box_poses              INTEGER DEFAULT 0,
    cable_mpo_prevu_m          NUMERIC DEFAULT 0,
    cable_mpo_pose_m           NUMERIC DEFAULT 0,
    cable_distribution_prevu_m NUMERIC DEFAULT 0,
    cable_distribution_pose_m  NUMERIC DEFAULT 0,
    notes                      TEXT,
    updated_at                 TIMESTAMPTZ DEFAULT NOW(),
    created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.13 Arborescence Réseau Fibre ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reseau_noeuds (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone                   TEXT,
    type                   TEXT,
    nom                    TEXT NOT NULL,
    sn                     TEXT,
    parent_id              UUID REFERENCES public.reseau_noeuds(id) ON DELETE SET NULL,
    parent_port            TEXT,
    cable_sn               TEXT,
    cable_longueur_m       NUMERIC,
    cable_distance_reelle_m NUMERIC,
    nb_ports               INTEGER DEFAULT 8,
    ports_occupes          INTEGER DEFAULT 0,
    coordonnees            TEXT,
    puissance_optique_dbm  NUMERIC,
    notes                  TEXT,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.14 Caisses de dépenses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caisses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom          TEXT NOT NULL,
    titulaire_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    telephone    TEXT DEFAULT '',
    seuil_alerte INTEGER DEFAULT 5000,
    actif        BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.15 Opérations de Caisse ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caisse_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id       UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('depense', 'alimentation')),
    montant         INTEGER NOT NULL CHECK (montant > 0),
    date_op         DATE NOT NULL DEFAULT CURRENT_DATE,
    libelle         TEXT NOT NULL DEFAULT '',
    categorie       TEXT NOT NULL DEFAULT 'autre',
    chantier        TEXT DEFAULT '',
    trs_id          TEXT,
    statut          TEXT NOT NULL DEFAULT 'en_attente'
                        CHECK (statut IN ('en_attente', 'validee', 'rejetee', 'annulee')),
    demande_par     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    demande_par_nom TEXT,
    traite_par      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    traite_par_nom  TEXT,
    traite_le       TIMESTAMPTZ,
    motif_rejet     TEXT,
    note            TEXT DEFAULT '',
    source          TEXT DEFAULT 'app',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.16 Charges fixes périodiques ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caisse_charges_fixes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id             UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
    libelle               TEXT NOT NULL,
    montant               INTEGER NOT NULL CHECK (montant > 0),
    categorie             TEXT NOT NULL DEFAULT 'carburant',
    chantier              TEXT DEFAULT '',
    frequence             TEXT NOT NULL CHECK (frequence IN ('hebdo', 'mensuel')),
    jour_semaine          INTEGER CHECK (jour_semaine BETWEEN 1 AND 7),
    jour_mois             INTEGER CHECK (jour_mois BETWEEN 1 AND 31),
    actif                 BOOLEAN NOT NULL DEFAULT TRUE,
    dernier_declenchement DATE,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.17 Notifications persistées de l'application ──────────────────────────
CREATE TABLE IF NOT EXISTS public.app_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destinataire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    titre           TEXT NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    type            TEXT NOT NULL DEFAULT 'info',
    module          TEXT NOT NULL DEFAULT 'caisse',
    ref_id          UUID,
    lu              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.18 Historique des imports de scans ONU/OLT ────────────────────────────
CREATE TABLE IF NOT EXISTS public.scan_import_history (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imported_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total                    INTEGER NOT NULL DEFAULT 0,
    scanne                   INTEGER NOT NULL DEFAULT 0,
    non_scanne               INTEGER NOT NULL DEFAULT 0,
    excellent                INTEGER NOT NULL DEFAULT 0,
    moyen                    INTEGER NOT NULL DEFAULT 0,
    degrade                  INTEGER NOT NULL DEFAULT 0,
    pct_scanne               NUMERIC,
    diff_nouveaux            INTEGER,
    diff_disparus            INTEGER,
    diff_passes_non_scanne   INTEGER,
    diff_passes_scanne       INTEGER,
    diff_signal_degrade      INTEGER,
    diff_signal_ameliore     INTEGER,
    diff_nouveaux_scanne     INTEGER,
    diff_nouveaux_non_scanne INTEGER
);

-- ─── 2.19 Résultats de scan réseau ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scan_results (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id         UUID REFERENCES public.scan_import_history(id) ON DELETE CASCADE,
    zone              TEXT,
    stt               TEXT,
    result            TEXT NOT NULL DEFAULT 'NON SCANE' CHECK (result IN ('SCANNE', 'NON SCANE')),
    scan_time         TIMESTAMPTZ,
    port_id           INTEGER,
    onu_id            INTEGER,
    onu_name          TEXT,
    software_version  TEXT,
    sn_mac            TEXT,
    time_added_to_nms TIMESTAMPTZ,
    rx_power          NUMERIC,
    ranging           NUMERIC,
    remarque          TEXT,
    change_type       TEXT,
    imported_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2.20 Fiches du Programme par OT ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.programme_ot (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_ot         TEXT NOT NULL,
    nature            TEXT NOT NULL CHECK (nature IN ('derangement', 'installation')),
    sous_type         TEXT DEFAULT '',
    type_ot           TEXT DEFAULT '',
    type_ligne        TEXT DEFAULT 'FGP',
    date_recu         DATE,
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
    cable_fibre_m     INTEGER,
    mise_en_service   TEXT DEFAULT '',
    equipe            TEXT DEFAULT '',
    statut            TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'non_fait')),
    motif             TEXT DEFAULT '',
    commentaire       TEXT DEFAULT '',
    decharge          BOOLEAN,
    scanne            BOOLEAN,
    cst_change        BOOLEAN DEFAULT FALSE,
    nouveau_dis       TEXT DEFAULT '',
    nouvel_ont        TEXT DEFAULT '',
    poteaux           INTEGER DEFAULT 0,
    assigne_le        TIMESTAMPTZ DEFAULT NOW(),
    traite_par_nom    TEXT,
    traite_le         TIMESTAMPTZ,
    distribue_par_nom TEXT,
    source_fichier    TEXT DEFAULT '',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- 3. RÉTROCOMPATIBILITÉ (si les tables existaient déjà)
-- ============================================================================

-- teams
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS elements TEXT[] DEFAULT '{}';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS ville TEXT NOT NULL DEFAULT 'Nouakchott';

-- situations
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.import_history(id) ON DELETE CASCADE;
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS nature TEXT NOT NULL DEFAULT 'installation';
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS conformite TEXT;
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS date_message DATE;
ALTER TABLE public.situations ADD COLUMN IF NOT EXISTS service_destination TEXT;

-- employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS equipe_nom TEXT;

-- vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS statut_depuis TIMESTAMPTZ DEFAULT NOW();

-- materiels
ALTER TABLE public.materiels ADD COLUMN IF NOT EXISTS code TEXT;

-- scan_import_history
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_nouveaux INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_disparus INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_passes_non_scanne INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_passes_scanne INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_signal_degrade INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_signal_ameliore INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_nouveaux_scanne INTEGER;
ALTER TABLE public.scan_import_history ADD COLUMN IF NOT EXISTS diff_nouveaux_non_scanne INTEGER;

-- scan_results
ALTER TABLE public.scan_results ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.scan_import_history(id) ON DELETE CASCADE;
ALTER TABLE public.scan_results ADD COLUMN IF NOT EXISTS change_type TEXT;

-- programme_ot
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS cable_fibre_m INTEGER;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS type_ot TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS type_ligne TEXT DEFAULT 'FGP';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS motif TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS decharge BOOLEAN;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS scanne BOOLEAN;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS cst_change BOOLEAN DEFAULT FALSE;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS nouveau_dis TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS nouvel_ont TEXT DEFAULT '';
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS poteaux INTEGER DEFAULT 0;
ALTER TABLE public.programme_ot ADD COLUMN IF NOT EXISTS assigne_le TIMESTAMPTZ DEFAULT NOW();


-- ============================================================================
-- 4. INDEX DE PERFORMANCE
-- ============================================================================

-- situations
CREATE INDEX IF NOT EXISTS idx_situations_nature ON public.situations (nature);
CREATE INDEX IF NOT EXISTS idx_situations_date_depo ON public.situations (date_depo);
CREATE INDEX IF NOT EXISTS idx_situations_equipe ON public.situations (equipe);
CREATE INDEX IF NOT EXISTS idx_situations_import_id ON public.situations (import_id);

-- employees & leaves & loans
CREATE INDEX IF NOT EXISTS idx_employee_leaves_employee_id ON public.employee_leaves (employee_id);
CREATE INDEX IF NOT EXISTS idx_loans_employee_id ON public.loans (employee_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON public.loan_payments (loan_id);

-- materiels & vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_equipe_nom ON public.vehicles (equipe_nom);
CREATE INDEX IF NOT EXISTS idx_materiels_equipe_nom ON public.materiels (equipe_nom);
CREATE INDEX IF NOT EXISTS idx_materiels_code ON public.materiels (code);

-- caisses & operations & notifications
CREATE UNIQUE INDEX IF NOT EXISTS caisse_operations_trs_id_uniq ON public.caisse_operations (trs_id) WHERE trs_id IS NOT NULL AND trs_id <> '';
CREATE INDEX IF NOT EXISTS caisse_operations_caisse_date_idx ON public.caisse_operations (caisse_id, date_op DESC);
CREATE INDEX IF NOT EXISTS caisse_operations_statut_idx ON public.caisse_operations (statut);
CREATE INDEX IF NOT EXISTS caisse_charges_fixes_caisse_idx ON public.caisse_charges_fixes (caisse_id);
CREATE INDEX IF NOT EXISTS caisse_charges_fixes_actif_idx ON public.caisse_charges_fixes (actif);
CREATE INDEX IF NOT EXISTS app_notifications_dest_idx ON public.app_notifications (destinataire_id, lu, created_at DESC);

-- scans
CREATE INDEX IF NOT EXISTS idx_scan_import_history_date ON public.scan_import_history (imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_results_import_id ON public.scan_results (import_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_zone ON public.scan_results (zone);
CREATE INDEX IF NOT EXISTS idx_scan_results_result ON public.scan_results (result);
CREATE INDEX IF NOT EXISTS idx_scan_results_rxpower ON public.scan_results (rx_power);
CREATE INDEX IF NOT EXISTS idx_scan_results_snmac ON public.scan_results (sn_mac);
CREATE INDEX IF NOT EXISTS idx_scan_results_change_type ON public.scan_results (change_type);

-- programme_ot
CREATE UNIQUE INDEX IF NOT EXISTS programme_ot_numero_uniq ON public.programme_ot (numero_ot);
CREATE INDEX IF NOT EXISTS programme_ot_equipe_idx ON public.programme_ot (lower(equipe), statut, date_programme DESC);
CREATE INDEX IF NOT EXISTS programme_ot_date_idx ON public.programme_ot (date_programme DESC);
CREATE INDEX IF NOT EXISTS programme_ot_fgp_idx ON public.programme_ot (fgp);
CREATE INDEX IF NOT EXISTS programme_ot_poteaux_idx ON public.programme_ot (poteaux) WHERE poteaux > 0;


-- ============================================================================
-- 5. FONCTIONS & DÉCLENCHEURS (TRIGGERS)
-- ============================================================================

-- ─── 5.1 Formatage monétaire ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fmt_mru(n BIGINT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(n::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g') || ' MRU'
$$;

-- ─── 5.2 Triggers mise à jour date (updated_at) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS caisse_operations_touch ON public.caisse_operations;
CREATE TRIGGER caisse_operations_touch BEFORE UPDATE ON public.caisse_operations
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS programme_ot_touch ON public.programme_ot;
CREATE TRIGGER programme_ot_touch BEFORE UPDATE ON public.programme_ot
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 5.3 Notifications de Caisse ─────────────────────────────────────────────
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

-- ─── 5.4 Déclenchement automatique des charges fixes ─────────────────────────
CREATE OR REPLACE FUNCTION public.declencher_charges_fixes(p_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_count INTEGER := 0;
    v_dow INTEGER;
    v_dom INTEGER;
    v_due BOOLEAN;
BEGIN
    v_dow := EXTRACT(ISODOW FROM p_date);
    v_dom := EXTRACT(DAY FROM p_date);

    FOR r IN
        SELECT cf.*, c.titulaire_id, p.name AS titulaire_nom, c.nom AS caisse_nom
        FROM public.caisse_charges_fixes cf
        JOIN public.caisses c ON c.id = cf.caisse_id
        LEFT JOIN public.profiles p ON p.id = c.titulaire_id
        WHERE cf.actif = TRUE
    LOOP
        v_due := FALSE;

        IF r.frequence = 'hebdo' AND r.jour_semaine = v_dow THEN
            IF r.dernier_declenchement IS NULL OR r.dernier_declenchement < p_date THEN
                v_due := TRUE;
            END IF;
        ELSIF r.frequence = 'mensuel' AND r.jour_mois = v_dom THEN
            IF r.dernier_declenchement IS NULL OR date_trunc('month', r.dernier_declenchement) < date_trunc('month', p_date) THEN
                v_due := TRUE;
            END IF;
        END IF;

        IF v_due THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.caisse_operations
                WHERE caisse_id = r.caisse_id
                  AND date_op = p_date
                  AND libelle = r.libelle
                  AND montant = r.montant
            ) THEN
                INSERT INTO public.caisse_operations
                    (caisse_id, type, montant, date_op, libelle, categorie, chantier,
                     statut, demande_par, demande_par_nom, note, source)
                VALUES
                    (r.caisse_id, 'depense', r.montant, p_date, r.libelle, r.categorie, COALESCE(r.chantier, ''),
                     'en_attente', r.titulaire_id, COALESCE(r.titulaire_nom, 'Charge Fixe'),
                     'Demande automatique (charge fixe)', 'charge_fixe');

                UPDATE public.caisse_charges_fixes
                SET dernier_declenchement = p_date
                WHERE id = r.id;

                v_count := v_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ─── 5.5 Assignation automatique des OT ───────────────────────────────────────
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

-- ─── 5.6 Notifications de Programme OT ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.programme_resume(nb_der BIGINT, nb_ins BIGINT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT concat_ws(' · ',
        CASE WHEN nb_der > 0 THEN nb_der || ' dérangement' || CASE WHEN nb_der > 1 THEN 's' ELSE '' END END,
        CASE WHEN nb_ins > 0 THEN nb_ins || ' installation' || CASE WHEN nb_ins > 1 THEN 's' ELSE '' END END)
$$;

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

-- ─── 5.7 Normalisation des numéros de série ONT ──────────────────────────────
CREATE OR REPLACE FUNCTION public.norm_ont(sn TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN s ~ '^[A-Z]{4}[0-9A-F]{8}$' THEN upper(encode(convert_to(substr(s, 1, 4), 'UTF8'), 'hex')) || substr(s, 5)
        ELSE s
    END
    FROM (SELECT upper(regexp_replace(COALESCE(sn, ''), '[^A-Za-z0-9]', '', 'g')) AS s) x
$$;

CREATE INDEX IF NOT EXISTS idx_scan_results_norm_ont ON public.scan_results (import_id, (public.norm_ont(sn_mac)));


-- ============================================================================
-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS) & DROITS D'ACCÈS
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'teams', 'profiles', 'import_history', 'situations', 'programs',
            'employees', 'employee_leaves', 'loans', 'loan_payments',
            'vehicles', 'materiels', 'chantiers', 'reseau_noeuds',
            'caisses', 'caisse_operations', 'caisse_charges_fixes',
            'app_notifications', 'scan_import_history', 'scan_results', 'programme_ot'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_all', tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl || '_all', tbl);
    END LOOP;
END $$;


-- ============================================================================
-- 7. TEMPS RÉEL SUPABASE (REALTIME)
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'app_notifications', 'caisse_operations', 'caisses', 'caisse_charges_fixes',
            'programme_ot', 'situations', 'loans', 'vehicles', 'chantiers'
        ])
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN others THEN NULL;
        END;
    END LOOP;
END $$;


-- ============================================================================
-- 8. VUES (LIAISON PROGRAMME OT ↔ SCANS RÉSEAU)
-- ============================================================================

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

GRANT SELECT ON public.programme_ot_scan TO anon, authenticated;


-- ============================================================================
-- 9. DONNÉES INITIALES ESSENTIELLES (IDEMPOTENTES)
-- ============================================================================

-- ─── 9.1 Équipes initiales ───────────────────────────────────────────────────
INSERT INTO public.teams (name, leader_name, color, zones, ville)
SELECT v.name, v.leader_name, v.color, v.zones, v.ville
FROM (VALUES
    ('hamadi',         'Hamadi',          '#2E7D32', ARRAY['CI1Z01','CP1Z01','CA1Z02','CA1Z04','KT1Z07','CV2Z03'], 'Nouakchott'),
    ('tiam',           'Tiam',            '#1565C0', ARRAY['CA1Z02','CA1Z04','CA3Z05','CA3Z13','CA3Z16'],          'Nouakchott'),
    ('mohamed dahmed', 'Mohamed Dahmed',  '#E65100', ARRAY['TZ3Z04','TZ3Z02','KT1Z07','SP1Z01','SP1Z03','CV2Z03'], 'Nouakchott'),
    ('mohamedou',      'Mohamedou',       '#4CAF50', ARRAY[]::TEXT[],                                                'Kaédi'),
    ('diop',           'Diop',            '#9C27B0', ARRAY[]::TEXT[],                                                'Rosso'),
    ('ndaye',          'Ndaye',           '#00BCD4', ARRAY[]::TEXT[],                                                'Nouadhibou')
) AS v(name, leader_name, color, zones, ville)
WHERE NOT EXISTS (
    SELECT 1 FROM public.teams t WHERE lower(t.name) = lower(v.name)
);

-- ─── 9.2 Profils Administrateurs, Superviseurs & RH ─────────────────────────
INSERT INTO public.profiles (name, role, password_hash)
SELECT 'eladel', 'admin'::public.app_role, 'gss2026'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = 'eladel');

INSERT INTO public.profiles (name, role, password_hash)
SELECT 'habib', 'admin'::public.app_role, 'gss2026'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = 'habib');

INSERT INTO public.profiles (name, role, password_hash)
SELECT 'Fatimata', 'superviseur'::public.app_role, 'superviseur2026'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = 'fatimata');

INSERT INTO public.profiles (name, role, password_hash)
SELECT 'Betoul', 'rh'::public.app_role, 'rh2026'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = 'betoul');

-- ─── 9.3 Profils Chefs d'équipe ──────────────────────────────────────────────
INSERT INTO public.profiles (name, role, team_id, password_hash)
SELECT t.name, 'chef'::public.app_role, t.id, 'chef2026'
FROM public.teams t
WHERE lower(t.name) IN ('hamadi', 'tiam', 'mohamed dahmed', 'mohamedou', 'diop', 'ndaye')
  AND NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE lower(p.name) = lower(t.name)
  );

-- ─── 9.4 Caisses initiales (El Adel, Habib, Betoul) ─────────────────────────
INSERT INTO public.caisses (nom, titulaire_id, telephone, seuil_alerte, actif)
SELECT 'El Adel', p.id, '32103354', 5000, true
FROM public.profiles p WHERE lower(p.name) = 'eladel'
AND NOT EXISTS (SELECT 1 FROM public.caisses WHERE lower(nom) = 'el adel');

INSERT INTO public.caisses (nom, titulaire_id, telephone, seuil_alerte, actif)
SELECT 'Habib', p.id, '46746412', 5000, true
FROM public.profiles p WHERE lower(p.name) = 'habib'
AND NOT EXISTS (SELECT 1 FROM public.caisses WHERE lower(nom) = 'habib');

INSERT INTO public.caisses (nom, titulaire_id, telephone, seuil_alerte, actif)
SELECT 'Betoul', p.id, '', 5000, true
FROM public.profiles p WHERE lower(p.name) = 'betoul'
AND NOT EXISTS (SELECT 1 FROM public.caisses WHERE lower(nom) = 'betoul');

-- ─── 9.5 Charges fixes récurrentes configurées pour Betoul ───────────────────
WITH caisse_betoul AS (
    SELECT id FROM public.caisses WHERE lower(nom) = 'betoul' LIMIT 1
)
INSERT INTO public.caisse_charges_fixes
    (caisse_id, libelle, montant, categorie, chantier, frequence, jour_semaine, jour_mois, actif)
SELECT
    cb.id, v.libelle, v.montant, v.categorie, v.chantier, v.frequence, v.jour_semaine, v.jour_mois, true
FROM caisse_betoul cb, (VALUES
    ('Carburant lundi', 6500, 'carburant', '',        'hebdo',   1,    NULL),
    ('Carburant jeudi', 3200, 'carburant', '',        'hebdo',   4,    NULL),
    ('Carburant Rosso', 3000, 'carburant', 'Rosso',   'mensuel', NULL, 1),
    ('Carburant Kaédi', 3000, 'carburant', 'Kaédi',   'mensuel', NULL, 1),
    ('Crédit',          3500, 'communication', '',    'mensuel', NULL, 1)
) AS v(libelle, montant, categorie, chantier, frequence, jour_semaine, jour_mois)
WHERE NOT EXISTS (
    SELECT 1 FROM public.caisse_charges_fixes cf
    WHERE cf.caisse_id = cb.id AND cf.libelle = v.libelle
);
