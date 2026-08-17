-- Ajouter la colonne import_id à la table situations si elle n'existe pas, avec contrainte de clé étrangère ON DELETE CASCADE
ALTER TABLE public.situations 
ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.import_history(id) ON DELETE CASCADE;
