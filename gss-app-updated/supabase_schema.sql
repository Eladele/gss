-- ============================================================
-- GSS App — Supabase Schema FINAL
-- Exécuter section par section dans l'éditeur SQL de Supabase
-- ============================================================

-- 0. Supprimer si réexécution (optionnel)
-- DROP TABLE IF EXISTS public.programs, public.import_history, public.situations, public.profiles, public.teams CASCADE;
-- DROP TYPE IF EXISTS public.app_role;

-- ─── 1. ENUM DES RÔLES ──────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'superviseur', 'chef');

-- ─── 2. ÉQUIPES ──────────────────────────────────────────────
CREATE TABLE public.teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    leader_name TEXT,
    zones       TEXT[] DEFAULT '{}',
    color       TEXT DEFAULT '#1565C0',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. PROFILS UTILISATEURS ────────────────────────────────
CREATE TABLE public.profiles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    role          app_role NOT NULL DEFAULT 'chef',
    team_id       UUID REFERENCES public.teams(id),
    password_hash TEXT,                   -- mot de passe (plain text pour l'instant)
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. SITUATIONS ──────────────────────────────────────────
CREATE TABLE public.situations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fgp        TEXT NOT NULL UNIQUE,
    type       TEXT NOT NULL,
    zone       TEXT NOT NULL,
    equipe     TEXT,
    motif      TEXT DEFAULT '',
    date_depo  DATE,
    date_clt   DATE,
    delai      INTEGER DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','ok','non_ok','urgent')),
    comment    TEXT DEFAULT '',
    is_urgent  BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. HISTORIQUE DES IMPORTS ──────────────────────────────
CREATE TABLE public.import_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name   TEXT NOT NULL,
    import_date TEXT,
    row_count   INTEGER DEFAULT 0,
    imported_by TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. PROGRAMMES DISTRIBUÉS ───────────────────────────────
CREATE TABLE public.programs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT,
    assigned_by UUID REFERENCES public.profiles(id),
    team_id     UUID REFERENCES public.teams(id),
    file_url    TEXT,
    status      TEXT DEFAULT 'pending',
    due_date    DATE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 7. ROW LEVEL SECURITY ──────────────────────────────────
ALTER TABLE public.teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.situations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs       ENABLE ROW LEVEL SECURITY;

-- Policies lecture publique (clé anon)
CREATE POLICY "read_teams"          ON public.teams          FOR SELECT USING (true);
CREATE POLICY "read_profiles"       ON public.profiles       FOR SELECT USING (true);
CREATE POLICY "read_situations"     ON public.situations     FOR SELECT USING (true);
CREATE POLICY "read_import_history" ON public.import_history FOR SELECT USING (true);
CREATE POLICY "read_programs"       ON public.programs       FOR SELECT USING (true);

-- Policies écriture publique
CREATE POLICY "insert_situations"     ON public.situations     FOR INSERT WITH CHECK (true);
CREATE POLICY "update_situations"     ON public.situations     FOR UPDATE USING (true);
CREATE POLICY "insert_import_history" ON public.import_history FOR INSERT WITH CHECK (true);
CREATE POLICY "insert_programs"       ON public.programs       FOR INSERT WITH CHECK (true);
CREATE POLICY "update_programs"       ON public.programs       FOR UPDATE USING (true);
CREATE POLICY "update_teams"          ON public.teams          FOR UPDATE USING (true);

-- ─── 8. DONNÉES INITIALES ───────────────────────────────────

-- Équipes
INSERT INTO public.teams (name, leader_name, color, zones) VALUES
    ('hamadi',         'Hamadi',          '#2E7D32', ARRAY['CI1Z01','CP1Z01','CA1Z02','CA1Z04','KT1Z07','CV2Z03']),
    ('tiam',           'Tiam',            '#1565C0', ARRAY['CA1Z02','CA1Z04','CA3Z05','CA3Z13','CA3Z16']),
    ('mohamed dahmed', 'Mohamed Dahmed',  '#E65100', ARRAY['TZ3Z04','TZ3Z02','KT1Z07','SP1Z01','SP1Z03','CV2Z03']);

-- Admins (superviseurs) — mot de passe: gss2026
INSERT INTO public.profiles (name, role, password_hash) VALUES
    ('eladel', 'admin', 'gss2026'),
    ('habib',  'admin', 'gss2026');

-- Chefs d'équipe — Exécuter APRÈS avoir récupéré les UUIDs des équipes
-- Remplacer <uuid_hamadi>, <uuid_tiam>, <uuid_med> par les vrais UUIDs
-- Exemple:
-- INSERT INTO public.profiles (name, role, team_id, password_hash)
-- SELECT 'hamadi', 'chef', id, 'chef2026' FROM public.teams WHERE name = 'hamadi';
-- INSERT INTO public.profiles (name, role, team_id, password_hash)
-- SELECT 'tiam', 'chef', id, 'chef2026' FROM public.teams WHERE name = 'tiam';
-- INSERT INTO public.profiles (name, role, team_id, password_hash)
-- SELECT 'mohamed dahmed', 'chef', id, 'chef2026' FROM public.teams WHERE name = 'mohamed dahmed';

-- ─── 9. INSÉRER LES CHEFS D'ÉQUIPE (version automatique) ────
INSERT INTO public.profiles (name, role, team_id, password_hash)
SELECT 'hamadi', 'chef'::app_role, id, 'chef2026' FROM public.teams WHERE name = 'hamadi';

INSERT INTO public.profiles (name, role, team_id, password_hash)
SELECT 'tiam', 'chef'::app_role, id, 'chef2026' FROM public.teams WHERE name = 'tiam';

INSERT INTO public.profiles (name, role, team_id, password_hash)
SELECT 'mohamed dahmed', 'chef'::app_role, id, 'chef2026' FROM public.teams WHERE name = 'mohamed dahmed';
