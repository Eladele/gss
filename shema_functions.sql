_penalite_points

BEGIN
    NEW.points := COALESCE(bareme_valeur('penalite_' || NEW.motif), -1);
    RETURN NEW;
END 
_penaliser

DECLARE n INTEGER;
BEGIN
    INSERT INTO penalites (situation_id, team_id, jour, motif, cree_par)
    SELECT s.id, s.team_id, aujourdhui(), p_motif, p_par
    FROM situations s
    WHERE s.id = ANY(p_ids)
      AND s.numero_ot IS NOT NULL AND s.team_id IS NOT NULL
      AND s.team_id IS DISTINCT FROM p_sauf_team
      AND s.status IN ('pending', 'in_progress', 'urgent')
      AND NOT EXISTS (SELECT 1 FROM penalites x
                      WHERE x.situation_id = s.id AND x.team_id = s.team_id AND x.motif <> 'faux_ok'
                        AND x.jour >= dernier_controle())
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END 
_entete_virement_valide

DECLARE
    champs TEXT[] := ARRAY['siege', 'rc', 'nif', 'ville', 'destinataire', 'compte', 'motif', 'faveur', 'signataire'];
    c TEXT;
    r JSONB := '{}'::jsonb;
    b JSONB := '{}'::jsonb;
    k TEXT;
    x JSONB;
BEGIN
    IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'En-tête invalide'; END IF;
    FOREACH c IN ARRAY champs LOOP
        IF v ? c THEN
            IF jsonb_typeof(v -> c) <> 'string' OR length(v ->> c) > 300 THEN
                RAISE EXCEPTION 'Champ « % » invalide (texte de 300 caractères au plus)', c;
            END IF;
            r := r || jsonb_build_object(c, btrim(v ->> c));
        END IF;
    END LOOP;
    IF v ? 'banques' THEN
        IF jsonb_typeof(v -> 'banques') <> 'object' THEN RAISE EXCEPTION 'Banques invalides'; END IF;
        FOR k, x IN SELECT * FROM jsonb_each(v -> 'banques') LOOP
            IF length(k) > 30 OR jsonb_typeof(x) <> 'object'
               OR (x ? 'destinataire' AND (jsonb_typeof(x -> 'destinataire') <> 'string' OR length(x ->> 'destinataire') > 300))
               OR (x ? 'compte' AND (jsonb_typeof(x -> 'compte') <> 'string' OR length(x ->> 'compte') > 300)) THEN
                RAISE EXCEPTION 'Banque « % » invalide', k;
            END IF;
            b := b || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object(
                'destinataire', NULLIF(btrim(x ->> 'destinataire'), ''),
                'compte', NULLIF(btrim(x ->> 'compte'), ''))));
        END LOOP;
        r := r || jsonb_build_object('banques', b);
    END IF;
    RETURN r;
END 
_zone_presque_finie

DECLARE
    z        TEXT;
    j        DATE := aujourdhui();
    reste    INTEGER;
    faites   INTEGER;
    nfaites  INTEGER;
    der      RECORD;
    equipe   TEXT;
BEGIN
    IF NEW.team_id IS NULL OR NEW.numero_ot IS NULL
       OR NEW.status NOT IN ('ok', 'non_ok') OR OLD.status IN ('ok', 'non_ok') THEN
        RETURN NULL;
    END IF;
    SELECT NULLIF(btrim(zone), '') INTO z FROM lignes WHERE id = NEW.ligne_id;
    IF z IS NULL THEN RETURN NULL; END IF;

    -- fiches encore ouvertes de l'équipe dans cette zone, à faire aujourd'hui (ou en retard)
    SELECT count(*) INTO reste
    FROM situations s JOIN lignes l ON l.id = s.ligne_id
    WHERE s.team_id = NEW.team_id AND l.zone = z AND s.numero_ot IS NOT NULL
      AND s.status IN ('pending', 'in_progress', 'urgent')
      AND jour_remise(COALESCE(s.assigne_le, s.created_at), s.date_programme) <= j;
    IF reste <> 1 THEN RETURN NULL; END IF;

    -- une seule fois par équipe, zone et jour
    SELECT s.id, s.nature, l.fgp, l.type_ligne, l.client_nom, NULLIF(split_part(substr(l.dis, 7), '-', 1), '') AS pco INTO der
    FROM situations s JOIN lignes l ON l.id = s.ligne_id
    WHERE s.team_id = NEW.team_id AND l.zone = z AND s.numero_ot IS NOT NULL
      AND s.status IN ('pending', 'in_progress', 'urgent')
      AND jour_remise(COALESCE(s.assigne_le, s.created_at), s.date_programme) <= j
    LIMIT 1;
    INSERT INTO zones_presque_finies (team_id, zone, jour, reste_id) VALUES (NEW.team_id, z, j, der.id)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT count(*) FILTER (WHERE s.status = 'ok'), count(*) FILTER (WHERE s.status = 'non_ok')
    INTO faites, nfaites
    FROM situations s JOIN lignes l ON l.id = s.ligne_id
    WHERE s.team_id = NEW.team_id AND l.zone = z AND s.numero_ot IS NOT NULL
      AND s.status IN ('ok', 'non_ok') AND (s.traite_le AT TIME ZONE 'Africa/Nouakchott')::date = j;
    SELECT name INTO equipe FROM teams WHERE id = NEW.team_id;

    INSERT INTO app_notifications (destinataire_id, titre, message, type, module, ref_id)
    SELECT p.id,
           'Zone ' || z || ' : dernière fiche pour ' || COALESCE(equipe, 'l''équipe'),
           COALESCE(equipe, 'L''équipe') || ' a traité ' || (faites + nfaites) || ' fiche' || CASE WHEN faites + nfaites > 1 THEN 's' ELSE '' END
             || ' de la zone ' || z || ' aujourd''hui (' || faites || ' faite' || CASE WHEN faites > 1 THEN 's' ELSE '' END
             || ', ' || nfaites || ' non faite' || CASE WHEN nfaites > 1 THEN 's' ELSE '' END || '). Il ne reste que '
             || COALESCE(der.type_ligne, 'FGP') || ' ' || COALESCE(der.fgp, '') || ' ('
             || CASE der.nature WHEN 'derangement' THEN 'dérangement' ELSE 'installation' END
             || COALESCE(', ' || NULLIF(der.client_nom, ''), '') || COALESCE(', PCO ' || NULLIF(der.pco, ''), '')
             || ') : préparez la suite (autre zone ou nouveau programme).',
           'programme', 'programme', der.id
    FROM profiles p WHERE p.role::text IN ('admin', 'superviseur');
    RETURN NULL;
END 
valider_distribution_salaire

BEGIN
  IF EXISTS (SELECT 1 FROM public.salary_months WHERE mois = p_mois AND statut = 'distribue') THEN
    RAISE EXCEPTION 'Les salaires de % sont déjà distribués', p_mois;
  END IF;

  INSERT INTO public.salary_months (mois, date_distribution, statut, distribue_le, distribue_par, total_net)
  VALUES (p_mois, p_date, 'distribue', now(), p_par, p_total)
  ON CONFLICT (mois) DO UPDATE
    SET date_distribution = EXCLUDED.date_distribution, statut = 'distribue',
        distribue_le = now(), distribue_par = EXCLUDED.distribue_par, total_net = EXCLUDED.total_net;

  INSERT INTO public.loan_payments (loan_id, month, montant, source)
  SELECT (x->>'loan_id')::uuid, p_mois, (x->>'montant')::numeric, 'distribution'
  FROM jsonb_array_elements(COALESCE(p_prelevements, '[]'::jsonb)) x
  WHERE (x->>'montant')::numeric > 0
  ON CONFLICT (loan_id, month) DO NOTHING;
END;
