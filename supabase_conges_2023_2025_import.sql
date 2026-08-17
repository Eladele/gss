-- ============================================================================
-- IMPORT CONGÉS 2023-2025 — depuis Liste_Conges_GSS_2024_2025.xlsx
-- (doublons "Septembre 2025 (doublon)" ignorés ; Mle 21253 ignoré car
-- introuvable dans la table employees)
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

INSERT INTO public.employee_leaves (employee_id, type, date_debut, date_fin, jours, motif, created_by)
SELECT e.id, 'annuel', v.date_debut::date, v.date_fin::date, v.jours, v.motif, 'admin'
FROM (VALUES
  ('2124', '2023-04-03', '2023-05-03', 22, 'Congé annuel — Avril 2024'),
  ('2132', '2023-04-03', '2023-05-03', 22, 'Congé annuel — Avril 2024'),
  ('2140', '2024-02-01', '2024-03-04', 22, 'Congé annuel — Février 2024'),
  ('2159', '2024-02-01', '2024-03-04', 22, 'Congé annuel — Février 2024'),
  ('2152', '2024-02-01', '2024-03-04', 22, 'Congé annuel — Février 2024'),
  ('2129', '2024-06-03', '2024-07-03', 22, 'Congé annuel — Juin 2024'),
  ('2147', '2024-06-03', '2024-07-03', 22, 'Congé annuel — Juin 2024'),
  ('2151', '2024-05-01', '2024-05-31', 22, 'Congé annuel — Mai 2024'),
  ('2163', '2024-05-01', '2024-05-31', 22, 'Congé annuel — Mai 2024'),
  ('2136', '2023-11-01', '2023-12-04', 22, 'Congé annuel — Novembre 2024'),
  ('2138', '2023-09-01', '2023-10-02', 22, 'Congé annuel — Septembre 2023'),
  ('2178', '2023-09-01', '2023-10-02', 22, 'Congé annuel — Septembre 2023'),
  ('2150', '2024-12-01', '2025-01-02', 22, 'Congé annuel — Décembre 2024'),
  ('2164', '2024-03-01', '2024-04-02', 22, 'Congé annuel — Mars 2024'),
  ('2123', '2024-03-01', '2024-04-02', 22, 'Congé annuel — Mars 2024')
) AS v(mle, date_debut, date_fin, jours, motif)
JOIN public.employees e ON e.mle = v.mle
WHERE NOT EXISTS (
  SELECT 1 FROM public.employee_leaves l
  WHERE l.employee_id = e.id AND l.date_debut = v.date_debut::date
);
