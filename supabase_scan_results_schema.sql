-- ============================================================================
-- NOUVELLE TABLE : scan_results (contrôle réseau ONU/OLT)
-- Séparée de `situations` : données techniques de scan fibre (10 000+ lignes,
-- rafraîchies à chaque import), rien à voir avec le suivi des interventions.
-- À exécuter dans Supabase SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scan_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  zone text,
  stt text,
  result text NOT NULL DEFAULT 'NON SCANE' CHECK (result = ANY (ARRAY['SCANNE'::text, 'NON SCANE'::text])),
  scan_time timestamptz,
  port_id integer,
  onu_id integer,
  onu_name text,
  software_version text,
  sn_mac text,
  time_added_to_nms timestamptz,
  rx_power numeric,          -- Rx Optical Power (dBm)
  ranging numeric,           -- distance en mètres
  remarque text,
  imported_at timestamptz DEFAULT now(),
  CONSTRAINT scan_results_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_scan_results_zone   ON public.scan_results (zone);
CREATE INDEX IF NOT EXISTS idx_scan_results_result ON public.scan_results (result);
CREATE INDEX IF NOT EXISTS idx_scan_results_rxpower ON public.scan_results (rx_power);
CREATE INDEX IF NOT EXISTS idx_scan_results_snmac  ON public.scan_results (sn_mac);
