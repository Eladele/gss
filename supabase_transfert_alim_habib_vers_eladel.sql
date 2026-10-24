-- ============================================================================
-- TRANSFERT COMPLET : Habib → El Adel (alimentation + dépenses)
-- Date d'exécution : 2026-10-20
-- Motif : La caisse Habib est fermée. Toutes ses opérations sont rattachées
--         à El Adel : l'alimentation (10 000 MRU) s'ajoute à El Adel,
--         les dépenses (15 900 MRU) diminuent El Adel.
-- ============================================================================

BEGIN;

-- 1. Vérification avant modification : toutes les opérations de la caisse Habib
SELECT o.id, c.nom AS caisse, o.type, o.montant, o.date_op, o.libelle, o.trs_id
FROM public.caisse_operations o
JOIN public.caisses c ON c.id = o.caisse_id
WHERE c.nom = 'Habib'
ORDER BY o.date_op;

-- 2. Déplacer TOUTES les opérations de Habib vers El Adel
--    (alimentation 10 000 MRU + dépenses 15 900 MRU)
UPDATE public.caisse_operations
SET caisse_id = (SELECT id FROM public.caisses WHERE nom = 'El Adel')
WHERE caisse_id = (SELECT id FROM public.caisses WHERE nom = 'Habib');

-- 3. Désactiver la caisse Habib
UPDATE public.caisses
SET actif = false
WHERE nom = 'Habib';

-- 4. Contrôle après modification
--    El Adel : reçu += 10 000 / dépensé += 15 900 / impact net = −5 900 sur le solde El Adel
SELECT c.nom,
       SUM(CASE WHEN o.type = 'alimentation' THEN o.montant ELSE 0 END)          AS recu,
       SUM(CASE WHEN o.type = 'depense'      THEN o.montant ELSE 0 END)          AS depense,
       SUM(CASE WHEN o.type = 'alimentation' THEN o.montant ELSE -o.montant END) AS solde
FROM public.caisses c
JOIN public.caisse_operations o ON o.caisse_id = c.id AND o.statut = 'validee'
WHERE c.nom = 'El Adel'
GROUP BY c.nom;

COMMIT;
