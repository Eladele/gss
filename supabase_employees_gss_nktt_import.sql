-- ============================================================================
-- IMPORT : Liste des employés de GSS à NKTT (fichier Excel fourni)
-- À exécuter dans Supabase SQL Editor APRÈS supabase_schema_stats_employees.sql
-- ============================================================================

-- 1) Colonnes complémentaires sur la table employees (NNI, ville, équipe RH)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS nni text,
  ADD COLUMN IF NOT EXISTS ville text,
  ADD COLUMN IF NOT EXISTS equipe_nom text;

-- 2) Import des 26 employés du fichier "Liste_des_employés_de_GSS_à_NKTT_.xlsx"
--    (colonnes A-G de la feuille "Feuil1" : Matricule, Nom, Fonction, Téléphone, NNI, Ville, Équipe)
--    Protégé contre les doublons : n'insère que les employés absents (par nom).
WITH new_employees (mle, name, poste, telephone, nni, ville, equipe_nom) AS (
  VALUES
  ('2123', 'Mohamed Moustapha Diagne', 'technicien', '46889192', '9580958012', 'NDB', 'NDB Maitenance'),
  ('2124', 'Moussa Saidou Gadio', 'technicien', '46461802', '276818989', 'NKTT', 'CENTRE VILLE'),
  ('2129', 'Fara BeiliL', 'Chef d''équipe', '46791052', '4913024832', 'NDB', 'NDB Maitenance'),
  ('2132', 'Sidy Beilil Hamdan', 'Chef d''équipe', '49804980', '9115850966', 'NKTT', 'Déploiement'),
  ('2136', 'Dhethie Ahmed Fall Fall', 'technicien', '42041935', '1242693288', 'NKTT', 'Déploiement'),
  ('2138', 'Amadou Tidjani Diamala', 'Chef d''équipe', '46087823', '2296430478', 'NKTT', 'ARAFAT'),
  ('2140', 'Mohamed Ahmed Sidi Vall', 'Chef d''équipe', '46406612', '798033357', 'NKTT', 'TVZ'),
  ('2147', 'Saidou Samba Dieng', 'technicien', '46957553', '3858427492', 'NKTT', 'TVZ'),
  ('2150', 'Hamady Samba Diallo', 'Chef d''équipe', '46446091', '4584472783', 'NKTT', 'CENTRE VILLE'),
  ('2151', 'Abou Hamadi Dia', 'technicien', '44013585', '6207821036', 'NKTT', 'Déploiement'),
  ('2152', 'Moussa Boubou Banor', 'technicien', '46075111', '1318386656', 'NKTT', 'ARAFAT'),
  ('2159', 'Achour Mohamed', 'technicien', '46414526', '9113484679', 'NDB', 'NDB Maitenance'),
  ('2163', 'Zeyde Med Elmoctar', 'Chef d''équipe', '47971515', '1674961275', 'NDB', 'ndb intallation'),
  ('2164', 'Aboubakrine Moussa Diop', 'Chef d''équipe', '46281818', '3445044629', 'ROSSO', 'ROSSO'),
  ('2178', 'Fah Massira', 'Cordinteur', '44996699', '7625886734', 'NDB', 'Supervision NDB'),
  (NULL, 'Fatimetou Mamadou Ba', 'Superviseur', '41759201', '6390957230', 'NKTT', 'SUpervision NKTT'),
  (NULL, 'Ahmed Werzeg R''Chid', 'technicien', '32120212', '1878043773', 'NKTT', 'ARAFAT'),
  (NULL, 'Abdramane Niang', 'technicien', '46859658', NULL, 'KEADI', 'KEADI'),
  (NULL, 'Ahmedou Mohamed Ejbe', 'Chef d''équipe', '49808880', '9181809026', 'KEADI', 'KEADI'),
  (NULL, 'Harouna Moussa Bah', 'Chef d''équipe', '46218719', '5176409366', 'NKTT', 'maintenance'),
  (NULL, 'Saidou Oumar Sy', 'technicien', '44773133', '2611929865', 'NKTT', 'maintenance'),
  (NULL, 'Vall N''Diaye Aly', 'technicien', '49952151', '8258403267', 'NDB', 'ndb intallation'),
  (NULL, 'Lemrabott Chavie', 'technicien', '46281818', '739364653', 'ROSSO', 'ROSSO'),
  (NULL, 'Eladel Mahmoudem El Adel', 'Superviseur', '41348433', '7977435201', 'NKTT', 'SUpervision NKTT'),
  (NULL, 'Hebiboullah Ebetta', 'Cordinteur', '46746412', '9898884824', 'NKTT', 'SUpervision NKTT'),
  (NULL, 'Djiby Alassane Dieye', 'technicien', '41187602', '2046365157', 'NKTT', 'TVZ')
)
INSERT INTO public.employees (mle, name, poste, telephone, nni, ville, equipe_nom, actif)
SELECT ne.mle, ne.name, ne.poste, ne.telephone, ne.nni, ne.ville, ne.equipe_nom, true
FROM new_employees ne
WHERE NOT EXISTS (
  SELECT 1 FROM public.employees e WHERE lower(e.name) = lower(ne.name)
);

