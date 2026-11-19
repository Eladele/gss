-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 (diagnostic, ne modifie rien) : où la base calcule « echeance_equipe » et « prioritaire »
--
-- Ces deux valeurs ne sont pas des colonnes de la table situations : elles sont calculées
-- ailleurs (vue situations_detail et/ou une fonction). Exécuter cette requête dans l'éditeur SQL
-- de Supabase et copier le résultat (toutes les lignes, colonne « definition ») : la correction
-- de la règle « installation prioritaire le dernier jour du délai » sera écrite à partir de là.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'colonne' AS type, table_name || '.' || column_name AS definition
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name IN ('echeance_equipe', 'prioritaire')

UNION ALL
SELECT 'vue situations_detail', pg_get_viewdef('public.situations_detail'::regclass, true)

UNION ALL
SELECT 'fonction ' || p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (p.prosrc ILIKE '%echeance_equipe%' OR p.prosrc ILIKE '%prioritaire%' OR p.prosrc ILIKE '%echeance%');
