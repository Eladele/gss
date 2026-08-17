-- Ajouter la colonne closed_by à la table situations
-- Enregistre le nom de l'utilisateur qui a clôturé la situation en statut OK
ALTER TABLE public.situations
ADD COLUMN IF NOT EXISTS closed_by TEXT;
