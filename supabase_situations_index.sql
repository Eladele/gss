-- Index pour le chargement des situations page par page (curseur created_at DESC, id ASC)
-- dans la vue situations_detail : évite l'erreur 500 (délai dépassé) sur les dernières pages.
-- À exécuter une fois dans l'éditeur SQL de Supabase.
CREATE INDEX IF NOT EXISTS situations_created_id_idx ON public.situations (created_at DESC, id ASC);
ANALYZE public.situations;
