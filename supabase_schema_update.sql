-- 1. Ajouter la colonne elements à la table teams (tableau de texte)
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS elements TEXT[] DEFAULT '{}';

-- 2. Ajouter la permission d'insertion pour les équipes
CREATE POLICY "insert_teams" ON public.teams FOR INSERT WITH CHECK (true);

-- 3. Ajouter la permission d'insertion pour les profils (pour pouvoir créer le profil du chef)
CREATE POLICY "insert_profiles" ON public.profiles FOR INSERT WITH CHECK (true);
