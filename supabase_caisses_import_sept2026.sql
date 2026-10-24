-- ============================================================================
-- REPRISE DE L'HISTORIQUE — septembre 2026 (messages WhatsApp + reçus Bankily)
-- À exécuter APRÈS supabase_caisses_schema.sql. Réexécutable sans doublon :
-- les alimentations sont uniques par Trs ID, les dépenses par (caisse, date, libellé, montant).
-- Les opérations sont importées déjà VALIDÉES : les notifications sont coupées
-- pendant l'import pour ne pas réveiller tout le monde avec 42 alertes.
-- ============================================================================

ALTER TABLE public.caisse_operations DISABLE TRIGGER caisse_operations_notify_ins;

WITH src (caisse, type, montant, date_op, libelle, categorie, trs_id, titulaire, source, note) AS (VALUES
  ('El Adel', 'depense', 3200, '2026-09-03', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 600, '2026-09-03', '3 poteaux', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('Habib', 'depense', 1000, '2026-09-03', 'Transport matériel Kaédi', 'transport', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 3200, '2026-09-03', 'Transport matériel NDB', 'transport', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 700, '2026-09-03', 'Pneus Sidi Bylil', 'vehicule', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 600, '2026-09-03', 'Pneus Haroun', 'vehicule', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 600, '2026-09-04', 'Heures supplémentaires vendredi', 'main_oeuvre', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 800, '2026-09-04', 'Carburant samedi', 'carburant', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 1800, '2026-09-04', 'Journée samedi', 'main_oeuvre', NULL, 'habib', 'whatsapp', ''),
  ('El Adel', 'depense', 6500, '2026-09-07', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 1200, '2026-09-07', 'Batterie voiture', 'vehicule', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 1500, '2026-09-08', 'Laser', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 300, '2026-09-11', 'Poteau Rosso', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 3200, '2026-09-14', 'Carburant jeudi', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 900, '2026-09-14', 'Après-midi', 'main_oeuvre', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 2100, '2026-09-14', 'Journée samedi', 'main_oeuvre', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 800, '2026-09-14', 'Carburant samedi', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 700, '2026-09-14', 'Journée dimanche', 'main_oeuvre', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 6500, '2026-09-14', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 2500, '2026-09-14', 'Power mètre Rosso', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 900, '2026-09-14', 'Pince', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('Habib', 'depense', 1400, '2026-09-18', 'Projet Extension CI1Z01', 'projet', NULL, 'habib', 'whatsapp', ''),
  ('El Adel', 'depense', 3200, '2026-09-18', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 1500, '2026-09-18', 'Location dépôt', 'location', NULL, 'eladel', 'whatsapp', ''),
  ('Habib', 'depense', 800, '2026-09-21', 'Carburant samedi', 'carburant', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 1800, '2026-09-21', 'Journée samedi', 'main_oeuvre', NULL, 'habib', 'whatsapp', ''),
  ('El Adel', 'depense', 6500, '2026-09-21', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 500, '2026-09-21', 'Matériel Kaédi', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 3200, '2026-09-24', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 400, '2026-09-24', '2 poteaux Kaédi', 'materiel', NULL, 'eladel', 'whatsapp', ''),
  ('Habib', 'depense', 600, '2026-09-24', 'Pneu', 'vehicule', NULL, 'habib', 'whatsapp', ''),
  ('El Adel', 'depense', 4600, '2026-09-25', 'Téléphone', 'communication', NULL, 'eladel', 'whatsapp', ''),
  ('Habib', 'depense', 800, '2026-09-28', 'Carburant samedi', 'carburant', NULL, 'habib', 'whatsapp', ''),
  ('Habib', 'depense', 1800, '2026-09-28', 'Journée samedi', 'main_oeuvre', NULL, 'habib', 'whatsapp', ''),
  ('El Adel', 'depense', 6500, '2026-09-28', 'Carburant', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 3000, '2026-09-28', 'Carburant Rosso', 'carburant', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'depense', 3500, '2026-09-28', 'Crédit', 'communication', NULL, 'eladel', 'whatsapp', ''),
  ('El Adel', 'alimentation', 10000, '2026-09-04', 'Transfert Bankily', 'alimentation', '0826090413160817682', 'eladel', 'bankily', ''),
  ('El Adel', 'alimentation', 20000, '2026-09-07', 'Transfert Bankily', 'alimentation', '1026090712472605217', 'eladel', 'bankily', ''),
  ('El Adel', 'alimentation', 20000, '2026-09-14', 'Transfert Bankily', 'alimentation', '1026091419313094807', 'eladel', 'bankily', ''),
  ('El Adel', 'alimentation', 20000, '2026-09-24', 'Transfert Bankily', 'alimentation', '0426092409570264388', 'eladel', 'bankily', ''),
  ('Habib', 'alimentation', 10000, '2026-09-30', 'Transfert Bankily', 'alimentation', '0726093009460078549', 'habib', 'bankily', 'Reçu sur 46746412 — rattachement à vérifier')
)
INSERT INTO public.caisse_operations
    (caisse_id, type, montant, date_op, libelle, categorie, trs_id, statut,
     demande_par, demande_par_nom, traite_par_nom, traite_le, source, note)
SELECT c.id, s.type, s.montant, s.date_op::date, s.libelle, s.categorie, s.trs_id, 'validee',
       p.id, p.name, 'Reprise historique', NOW(), s.source, s.note
FROM src s
JOIN public.caisses c ON c.nom = s.caisse
LEFT JOIN public.profiles p ON lower(p.name) = s.titulaire
WHERE NOT EXISTS (
    SELECT 1 FROM public.caisse_operations o
    WHERE (s.trs_id IS NOT NULL AND o.trs_id = s.trs_id)
       OR (s.trs_id IS NULL AND o.caisse_id = c.id AND o.date_op = s.date_op::date
           AND o.libelle = s.libelle AND o.montant = s.montant)
);

ALTER TABLE public.caisse_operations ENABLE TRIGGER caisse_operations_notify_ins;

-- Contrôle attendu : El Adel reçu 70 000 / dépensé 63 800 / solde 6 200
--                    Habib   reçu 10 000 / dépensé 15 900 / solde −5 900
SELECT c.nom,
       SUM(CASE WHEN o.type = 'alimentation' THEN o.montant ELSE 0 END) AS recu,
       SUM(CASE WHEN o.type = 'depense'      THEN o.montant ELSE 0 END) AS depense,
       SUM(CASE WHEN o.type = 'alimentation' THEN o.montant ELSE -o.montant END) AS solde
FROM public.caisses c JOIN public.caisse_operations o ON o.caisse_id = c.id AND o.statut = 'validee'
GROUP BY c.nom ORDER BY c.nom;
