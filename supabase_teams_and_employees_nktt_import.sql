-- ============================================================================
-- REMPLACEMENT COMPLET DE LA TABLE `teams` + RELATION EMPLOYÉ ↔ ÉQUIPE
-- Source : "Liste_des_employés_de_GSS_à_NKTT.xlsx" (4 feuilles lues :
-- Liste des employés, liste des voitures, Par équipe, Materiél)
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

-- 0) La colonne `ville` n'existe pas forcément encore sur `teams`
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS ville text DEFAULT 'Nouakchott';

-- 1) On détache les profils (comptes chef) de leur équipe avant suppression,
--    sinon la suppression échoue (contrainte de clé étrangère profiles.team_id)
UPDATE public.profiles SET team_id = NULL;

-- 2) Suppression complète des équipes existantes (données de test/anciennes)
DELETE FROM public.teams;

-- 3) Insertion des 11 équipes réelles (feuille "Par équipe")
INSERT INTO public.teams (name, leader_name, ville, color) VALUES
  ('ARAFAT',            'Amadou Tidjani Diamala',   'NKTT', '#1565C0'),
  ('CENTRE VILLE',      'Hamady Samba Diallo',      'NKTT', '#2E7D32'),
  ('DÉPLOIEMENT',       'Sidy Beilil Hamdan',       'NKTT', '#E65100'),
  ('KAEDI',             'Ahmedou Mohamed Ejbe',     'Kaédi','#6A1B9A'),
  ('MAINTENANCE',       'Harouna Moussa Bah',       'NKTT', '#00838F'),
  ('NDB INSTALLATION',  'Zeyde Med Elmoctar',       'NDB',  '#C62828'),
  ('NDB MAINTENANCE',   'Fara BeiliL',              'NDB',  '#F9A825'),
  ('ROSSO',             'Aboubakrine Moussa Diop',  'Rosso','#455A64'),
  ('TVZ',               'Mohamed Ahmed Sidi Vall',  'NKTT', '#00ACC1'),
  ('SUPERVISION NDB',   'Fah Massira',              'NDB',  '#5D4037'),
  ('SUPERVISION NKTT',  'Hebiboullah Ebetta',       'NKTT', '#7B1FA2');

-- 4) Relation Employé ↔ Équipe (26 employés — mise à jour si le Mle existe déjà,
--    sinon création). equipe_nom correspond EXACTEMENT aux noms ci-dessus.
UPDATE public.employees SET name = 'Md Moustapha Diagne', nni = '9580958012', telephone = '46889192', poste = 'technicien', ville = 'NDB', equipe_nom = 'NDB MAINTENANCE' WHERE mle = '2123';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2123', 'Md Moustapha Diagne', '9580958012', '46889192', 'technicien', 'NDB', 'NDB MAINTENANCE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2123');

UPDATE public.employees SET name = 'Moussa Saidou Gadio', nni = '276818989', telephone = '46461802', poste = 'technicien', ville = 'NKTT', equipe_nom = 'CENTRE VILLE' WHERE mle = '2124';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2124', 'Moussa Saidou Gadio', '276818989', '46461802', 'technicien', 'NKTT', 'CENTRE VILLE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2124');

UPDATE public.employees SET name = 'Fara BeiliL', nni = '4913024832', telephone = '46791052', poste = 'Chef d''équipe', ville = 'NDB', equipe_nom = 'NDB MAINTENANCE' WHERE mle = '2129';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2129', 'Fara BeiliL', '4913024832', '46791052', 'Chef d''équipe', 'NDB', 'NDB MAINTENANCE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2129');

UPDATE public.employees SET name = 'Sidy Beilil Hamdan', nni = '9115850966', telephone = '49804980', poste = 'Chef d''équipe', ville = 'NKTT', equipe_nom = 'DÉPLOIEMENT' WHERE mle = '2132';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2132', 'Sidy Beilil Hamdan', '9115850966', '49804980', 'Chef d''équipe', 'NKTT', 'DÉPLOIEMENT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2132');

UPDATE public.employees SET name = 'Dhethie Ahmed Fall Fall', nni = '1242693288', telephone = '42041935', poste = 'technicien', ville = 'NKTT', equipe_nom = 'DÉPLOIEMENT' WHERE mle = '2136';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2136', 'Dhethie Ahmed Fall Fall', '1242693288', '42041935', 'technicien', 'NKTT', 'DÉPLOIEMENT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2136');

UPDATE public.employees SET name = 'Amadou Tidjani Diamala', nni = '2296430478', telephone = '46087823', poste = 'Chef d''équipe', ville = 'NKTT', equipe_nom = 'ARAFAT' WHERE mle = '2138';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2138', 'Amadou Tidjani Diamala', '2296430478', '46087823', 'Chef d''équipe', 'NKTT', 'ARAFAT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2138');

UPDATE public.employees SET name = 'Mohamed Ahmed Sidi Vall', nni = '798033357', telephone = '46406612', poste = 'Chef d''équipe', ville = 'NKTT', equipe_nom = 'TVZ' WHERE mle = '2140';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2140', 'Mohamed Ahmed Sidi Vall', '798033357', '46406612', 'Chef d''équipe', 'NKTT', 'TVZ', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2140');

UPDATE public.employees SET name = 'Saidou Samba Dieng', nni = '3858427492', telephone = '46957553', poste = 'technicien', ville = 'NKTT', equipe_nom = 'TVZ' WHERE mle = '2147';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2147', 'Saidou Samba Dieng', '3858427492', '46957553', 'technicien', 'NKTT', 'TVZ', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2147');

UPDATE public.employees SET name = 'Hamady Samba Diallo', nni = '4584472783', telephone = '46446091', poste = 'Chef d''équipe', ville = 'NKTT', equipe_nom = 'CENTRE VILLE' WHERE mle = '2150';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2150', 'Hamady Samba Diallo', '4584472783', '46446091', 'Chef d''équipe', 'NKTT', 'CENTRE VILLE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2150');

UPDATE public.employees SET name = 'Abou Hamadi Dia', nni = '6207821036', telephone = '44013585', poste = 'technicien', ville = 'NKTT', equipe_nom = 'DÉPLOIEMENT' WHERE mle = '2151';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2151', 'Abou Hamadi Dia', '6207821036', '44013585', 'technicien', 'NKTT', 'DÉPLOIEMENT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2151');

UPDATE public.employees SET name = 'Moussa Boubou Banor', nni = '1318386656', telephone = '46075111', poste = 'technicien', ville = 'NKTT', equipe_nom = 'ARAFAT' WHERE mle = '2152';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2152', 'Moussa Boubou Banor', '1318386656', '46075111', 'technicien', 'NKTT', 'ARAFAT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2152');

UPDATE public.employees SET name = 'Achour Mohamed', nni = '9113484679', telephone = '46414526', poste = 'technicien', ville = 'NDB', equipe_nom = 'NDB MAINTENANCE' WHERE mle = '2159';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2159', 'Achour Mohamed', '9113484679', '46414526', 'technicien', 'NDB', 'NDB MAINTENANCE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2159');

UPDATE public.employees SET name = 'Zeyde Med Elmoctar', nni = '1674961275', telephone = '47971515', poste = 'Chef d''équipe', ville = 'NDB', equipe_nom = 'NDB INSTALLATION' WHERE mle = '2163';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2163', 'Zeyde Med Elmoctar', '1674961275', '47971515', 'Chef d''équipe', 'NDB', 'NDB INSTALLATION', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2163');

UPDATE public.employees SET name = 'Aboubakrine Moussa Diop', nni = '3445044629', telephone = '46281818', poste = 'Chef d''équipe', ville = 'ROSSO', equipe_nom = 'ROSSO' WHERE mle = '2164';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2164', 'Aboubakrine Moussa Diop', '3445044629', '46281818', 'Chef d''équipe', 'ROSSO', 'ROSSO', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2164');

UPDATE public.employees SET name = 'Abdramane Niang', nni = NULL, telephone = '46859658', poste = 'technicien', ville = 'KEADI', equipe_nom = 'KAEDI' WHERE mle = '2167';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2167', 'Abdramane Niang', NULL, '46859658', 'technicien', 'KEADI', 'KAEDI', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2167');

UPDATE public.employees SET name = 'Fah Massira', nni = '7625886734', telephone = '44996699', poste = 'Cordinteur', ville = 'NDB', equipe_nom = 'SUPERVISION NDB' WHERE mle = '2178';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2178', 'Fah Massira', '7625886734', '44996699', 'Cordinteur', 'NDB', 'SUPERVISION NDB', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2178');

UPDATE public.employees SET name = 'Hebiboullah Ebetta', nni = '9898884824', telephone = '46746412', poste = 'Cordinteur', ville = 'NKTT', equipe_nom = 'SUPERVISION NKTT' WHERE mle = '2205';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2205', 'Hebiboullah Ebetta', '9898884824', '46746412', 'Cordinteur', 'NKTT', 'SUPERVISION NKTT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2205');

UPDATE public.employees SET name = 'Vall N''Diaye Aly', nni = '8258403267', telephone = '49952151', poste = 'technicien', ville = 'NDB', equipe_nom = 'NDB INSTALLATION' WHERE mle = '2209';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2209', 'Vall N''Diaye Aly', '8258403267', '49952151', 'technicien', 'NDB', 'NDB INSTALLATION', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2209');

UPDATE public.employees SET name = 'Djiby Alassane Dieye', nni = '2046365157', telephone = '41187602', poste = 'technicien', ville = 'NKTT', equipe_nom = 'TVZ' WHERE mle = '2210';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2210', 'Djiby Alassane Dieye', '2046365157', '41187602', 'technicien', 'NKTT', 'TVZ', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2210');

UPDATE public.employees SET name = 'Ahmedou Mohamed Ejbe', nni = '9181809026', telephone = '49808880', poste = 'Chef d''équipe', ville = 'KEADI', equipe_nom = 'KAEDI' WHERE mle = '2211';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2211', 'Ahmedou Mohamed Ejbe', '9181809026', '49808880', 'Chef d''équipe', 'KEADI', 'KAEDI', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2211');

UPDATE public.employees SET name = 'Fatimetou Mamadou Ba', nni = '6390957230', telephone = '41759201', poste = 'Superviseur', ville = 'NKTT', equipe_nom = 'SUPERVISION NKTT' WHERE mle = '2215';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2215', 'Fatimetou Mamadou Ba', '6390957230', '41759201', 'Superviseur', 'NKTT', 'SUPERVISION NKTT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2215');

UPDATE public.employees SET name = 'Ahmed Werzeg R''Chid', nni = '1878043773', telephone = '32120212', poste = 'technicien', ville = 'NKTT', equipe_nom = 'ARAFAT' WHERE mle = '2216';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2216', 'Ahmed Werzeg R''Chid', '1878043773', '32120212', 'technicien', 'NKTT', 'ARAFAT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2216');

UPDATE public.employees SET name = 'Harouna Moussa Bah', nni = '5176409366', telephone = '46218719', poste = 'Chef d''équipe', ville = 'NKTT', equipe_nom = 'MAINTENANCE' WHERE mle = '2217';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2217', 'Harouna Moussa Bah', '5176409366', '46218719', 'Chef d''équipe', 'NKTT', 'MAINTENANCE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2217');

UPDATE public.employees SET name = 'Saidou Oumar Sy', nni = '2611929865', telephone = '44773133', poste = 'technicien', ville = 'NKTT', equipe_nom = 'MAINTENANCE' WHERE mle = '2218';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2218', 'Saidou Oumar Sy', '2611929865', '44773133', 'technicien', 'NKTT', 'MAINTENANCE', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2218');

UPDATE public.employees SET name = 'Lemrabott Chavie', nni = '739364653', telephone = '46281818', poste = 'technicien', ville = 'ROSSO', equipe_nom = 'ROSSO' WHERE mle = '2219';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2219', 'Lemrabott Chavie', '739364653', '46281818', 'technicien', 'ROSSO', 'ROSSO', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2219');

UPDATE public.employees SET name = 'Eladel Mahmoudem El Adel', nni = '7977435201', telephone = '41348433', poste = 'Superviseur', ville = 'NKTT', equipe_nom = 'SUPERVISION NKTT' WHERE mle = '2220';
INSERT INTO public.employees (mle, name, nni, telephone, poste, ville, equipe_nom, actif)
SELECT '2220', 'Eladel Mahmoudem El Adel', '7977435201', '41348433', 'Superviseur', 'NKTT', 'SUPERVISION NKTT', true
WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE mle = '2220');
