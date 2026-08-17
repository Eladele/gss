-- ============================================================================
-- CORRECTION BANQUE uniquement (le virement de juin contient déjà le +10% de
-- salaire, inutile de le réappliquer — les montants de juin sont déjà à jour
-- via supabase_montant_juin2026_import.sql)
-- ============================================================================

UPDATE public.employees SET banque = 'SGM' WHERE mle IN (
  '2136', '2178', '2140', '2152', '2159', '2129', '2147',
  '2132', '2123', '2151', '2163', '2124', '2138', '2150', '2164'
);

UPDATE public.employees SET banque = 'BPM' WHERE mle IN ('2021', '2205');
