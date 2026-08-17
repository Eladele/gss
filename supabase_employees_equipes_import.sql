-- ============================================================================
-- IMPORT EMPLOYÉS : relation Équipe ↔ Employés (chefs d'équipe + membres)
-- La relation avec une équipe se fait via employees.equipe_nom, qui doit
-- correspondre EXACTEMENT (insensible à la casse) au nom de l'équipe dans
-- la table `teams` (colonne `name`) pour s'afficher sur la page "Équipes".
-- Vérifiez/adaptez les valeurs d'equipe_nom ci-dessous si vos équipes dans
-- `teams` portent un nom différent de l'en-tête donné (ex: "NDB INSTALLATION").
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT v.mle, v.name, v.nni, v.telephone, v.poste, v.ville, v.equipe_nom, true
FROM (VALUES
  -- ÉQUIPE NDB INSTALLATION — Chef : Zeyde Med Elmoctar (Mle 2163)
  ('2163', 'Zeyde Med Elmoctar',            '1674961275', '47971515', 'Chef d''équipe', 'NDB',  'NDB INSTALLATION'),
  (NULL,   'Vall N''Diaye Aly',              '8258403267', '49952151', 'technicien',     'NDB',  'NDB INSTALLATION'),

  -- ÉQUIPE NDB MAINTENANCE — Chef : Fara BeiliL (Mle 2129)
  ('2129', 'Fara BeiliL',                   '4913024832', '46791052', 'Chef d''équipe', 'NDB',  'NDB MAINTENANCE'),
  ('2159', 'Achour Mohamed',                '9113484679', '46414526', 'technicien',     'NDB',  'NDB MAINTENANCE'),
  ('2123', 'Mohamed Moustapha Diagne',      '9580958012', '46889192', 'technicien',     'NDB',  'NDB MAINTENANCE'),

  -- ÉQUIPE ROSSO — Chef : Aboubakrine Moussa Diop (Mle 2164)
  ('2164', 'Aboubakrine Moussa Diop',       '3445044629', '46281818', 'Chef d''équipe', 'ROSSO', 'ROSSO'),
  (NULL,   'Lemrabott Chavie',               '739364653',  '46281818', 'technicien',     'ROSSO', 'ROSSO'),

  -- ÉQUIPE TVZ — Chef : Mohamed Ahmed Sidi Vall (Mle 2140)
  ('2140', 'Mohamed Ahmed Sidi Vall',       '798033357',  '46406612', 'Chef d''équipe', 'NKTT', 'TVZ'),
  (NULL,   'Djiby Alassane Dieye',           '2046365157', '41187602', 'technicien',     'NKTT', 'TVZ'),
  ('2147', 'Saidou Samba Dieng',            '3858427492', '46957553', 'technicien',     'NKTT', 'TVZ'),

  -- SUPERVISION NDB — Coordinateur : Fah Massira (Mle 2178)
  ('2178', 'Fah Massira',                   '7625886734', '44996699', 'Cordinteur',     'NDB',  'SUPERVISION NDB'),

  -- SUPERVISION NKTT — Superviseur : Hebiboullah Ebetta
  (NULL,   'Hebiboullah Ebetta',            '9898884824', '46746412', 'Cordinteur',     'NKTT', 'SUPERVISION NKTT'),
  (NULL,   'Fatimetou Mamadou Ba',          '6390957230', '41759201', 'Superviseur',    'NKTT', 'SUPERVISION NKTT'),
  (NULL,   'Eladel Mahmoudem El Adel',      '7977435201', '41348433', 'Superviseur',    'NKTT', 'SUPERVISION NKTT')
) AS v(mle, name, nni, telephone, poste, ville, equipe_nom)
WHERE NOT EXISTS (
  SELECT 1 FROM public.employees e
  WHERE lower(e.name) = lower(v.name)
     OR (v.mle IS NOT NULL AND e.mle = v.mle)
);
