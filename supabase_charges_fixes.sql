-- ============================================================================
-- MODULE CAISSES : CHARGES FIXES & DEMANDES AUTOMATIQUES (BETOUL)
-- Date de création : 2026-10-21
--
-- Ce script configure les charges fixes automatiques demandées à Betoul :
--   1. Carburant lundi : 6 500 MRU (chaque lundi matin)
--   2. Carburant jeudi : 3 200 MRU (chaque jeudi matin)
--   3. Carburant Rosso : 3 000 MRU (le 1er de chaque mois)
--   4. Carburant Kaédi : 3 000 MRU (le 1er de chaque mois)
--   5. Crédit téléphone : 3 500 MRU (le 1er de chaque mois)
--
-- Rattachées à la Caisse Betoul (les demandes sont créées en statut 'en_attente',
-- ce qui déclenche la notification temps réel pour validation comptable).
-- ============================================================================

BEGIN;

-- ─── 1. S'assurer que la Caisse Betoul existe ──────────────────────────────
INSERT INTO public.caisses (nom, titulaire_id, telephone, seuil_alerte, actif)
SELECT 'Betoul', p.id, '', 5000, true
FROM public.profiles p
WHERE lower(p.name) LIKE '%betoul%'
  AND NOT EXISTS (SELECT 1 FROM public.caisses WHERE lower(nom) = 'betoul')
LIMIT 1;

-- Si aucun profil nommé Betoul n'existe encore, créer la caisse Betoul directement
INSERT INTO public.caisses (nom, telephone, seuil_alerte, actif)
SELECT 'Betoul', '', 5000, true
WHERE NOT EXISTS (SELECT 1 FROM public.caisses WHERE lower(nom) = 'betoul');

-- ─── 2. Création de la table caisse_charges_fixes ─────────────────────────
CREATE TABLE IF NOT EXISTS public.caisse_charges_fixes (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id              UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
    libelle                TEXT NOT NULL,
    montant                INTEGER NOT NULL CHECK (montant > 0),
    categorie              TEXT NOT NULL DEFAULT 'carburant',
    chantier               TEXT DEFAULT '',
    frequence              TEXT NOT NULL CHECK (frequence IN ('hebdo', 'mensuel')),
    jour_semaine           INTEGER CHECK (jour_semaine BETWEEN 1 AND 7),  -- 1 = Lundi, 4 = Jeudi
    jour_mois              INTEGER CHECK (jour_mois BETWEEN 1 AND 31),    -- 1 = 1er du mois
    actif                  BOOLEAN NOT NULL DEFAULT TRUE,
    dernier_declenchement  DATE,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS caisse_charges_fixes_caisse_idx ON public.caisse_charges_fixes (caisse_id);
CREATE INDEX IF NOT EXISTS caisse_charges_fixes_actif_idx  ON public.caisse_charges_fixes (actif);

-- ─── 3. Sécurité RLS et Temps Réel ────────────────────────────────────────
ALTER TABLE public.caisse_charges_fixes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "caisse_charges_fixes_all" ON public.caisse_charges_fixes;
CREATE POLICY "caisse_charges_fixes_all" ON public.caisse_charges_fixes FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caisse_charges_fixes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 4. Insertion des 5 charges fixes configurées pour Betoul ─────────────
WITH caisse_cible AS (
    SELECT id FROM public.caisses WHERE lower(nom) = 'betoul' LIMIT 1
)
INSERT INTO public.caisse_charges_fixes
    (caisse_id, libelle, montant, categorie, chantier, frequence, jour_semaine, jour_mois, actif)
SELECT
    c.id, v.libelle, v.montant, v.categorie, v.chantier, v.frequence, v.jour_semaine, v.jour_mois, true
FROM caisse_cible c, (VALUES
    ('Carburant lundi', 6500, 'carburant', '',        'hebdo',   1,    NULL),
    ('Carburant jeudi', 3200, 'carburant', '',        'hebdo',   4,    NULL),
    ('Carburant Rosso', 3000, 'carburant', 'Rosso',   'mensuel', NULL, 1),
    ('Carburant Kaédi', 3000, 'carburant', 'Kaédi',   'mensuel', NULL, 1),
    ('Crédit',          3500, 'communication', '',    'mensuel', NULL, 1)
) AS v(libelle, montant, categorie, chantier, frequence, jour_semaine, jour_mois)
WHERE NOT EXISTS (
    SELECT 1 FROM public.caisse_charges_fixes cf
    WHERE cf.caisse_id = c.id AND cf.libelle = v.libelle
);

-- ─── 5. Fonction de déclenchement automatique (PostgreSQL / Supabase) ──────
-- Vérifie les charges dues pour la date donnée (par défaut aujourd'hui)
-- et insère les demandes en statut 'en_attente' (notifie Betoul automatiquement).
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
    v_dow := EXTRACT(ISODOW FROM p_date); -- 1 = Lundi, 4 = Jeudi, 7 = Dimanche
    v_dom := EXTRACT(DAY FROM p_date);    -- 1 = 1er du mois

    FOR r IN
        SELECT cf.*, c.titulaire_id, p.name AS titulaire_nom, c.nom AS caisse_nom
        FROM public.caisse_charges_fixes cf
        JOIN public.caisses c ON c.id = cf.caisse_id
        LEFT JOIN public.profiles p ON p.id = c.titulaire_id
        WHERE cf.actif = TRUE
    LOOP
        v_due := FALSE;

        -- Vérification hebdomadaire (ex: Lundi = 1, Jeudi = 4)
        IF r.frequence = 'hebdo' AND r.jour_semaine = v_dow THEN
            IF r.dernier_declenchement IS NULL OR r.dernier_declenchement < p_date THEN
                v_due := TRUE;
            END IF;
        -- Vérification mensuelle (ex: 1er du mois = 1)
        ELSIF r.frequence = 'mensuel' AND r.jour_mois = v_dom THEN
            IF r.dernier_declenchement IS NULL OR date_trunc('month', r.dernier_declenchement) < date_trunc('month', p_date) THEN
                v_due := TRUE;
            END IF;
        END IF;

        IF v_due THEN
            -- Vérifier qu'une opération identique n'existe pas déjà pour aujourd'hui
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

COMMIT;

-- ─── 6. Contrôle & test ────────────────────────────────────────────────────
-- Afficher les charges fixes enregistrées :
SELECT cf.id, c.nom AS caisse, cf.libelle, cf.montant, cf.categorie, cf.chantier,
       cf.frequence, cf.jour_semaine, cf.jour_mois, cf.actif
FROM public.caisse_charges_fixes cf
JOIN public.caisses c ON c.id = cf.caisse_id
ORDER BY cf.frequence, cf.jour_semaine, cf.jour_mois;

-- Pour tester manuellement le déclenchement pour une date précise :
-- SELECT public.declencher_charges_fixes(CURRENT_DATE);

-- Optionnel : avec pg_cron (Supabase Pro / Enterprise) pour exécuter tous les matins à 07:00 UTC :
-- SELECT cron.schedule('declenchement-charges-fixes-07h', '0 7 * * *', 'SELECT public.declencher_charges_fixes();');
