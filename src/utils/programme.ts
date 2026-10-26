// Libellés et couleurs communs aux pages Programme et Distribution
export const NATURE_LABEL = { derangement: 'Dérangement', installation: 'Installation' } as const;
export const NATURE_CLASS = {
  derangement: 'bg-orange-50 text-orange-800 border-orange-200',
  installation: 'bg-sky-50 text-sky-800 border-sky-200',
} as const;
export const STATUT_OT = {
  a_faire: { label: 'À faire', cls: 'bg-slate-100 text-slate-600 border-slate-200', border: 'border-l-slate-300' },
  fait: { label: 'Fait', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', border: 'border-l-emerald-500' },
  non_fait: { label: 'Non fait', cls: 'bg-red-50 text-red-700 border-red-200', border: 'border-l-red-500' },
} as const;

/** 49617103 → « 49 61 71 03 » (plus lisible au téléphone) */
export const fmtTel = (t: string) => t.replace(/(\d{2})(?=\d)/g, '$1 ');

// ─── Types d'OT (mêmes codes que les situations) ─────────────────────────────
export const TYPE_OT_LABEL: Record<string, string> = {
  CPL: 'Création première ligne',
  CLS: 'Ajout nouvelle ligne',
  TRL: 'Transfert local',
  RLR: 'Recréation ligne résiliée',
  CST: 'Changement de constitution',
  ANS: 'Ajout numéro supplémentaire',
  DRG: 'Dérangement',
};

// ─── Motifs de clôture du programme ──────────────────────────────────────────
// `poteaux` : nombre de poteaux comptés dans les statistiques quand ce motif est choisi
export interface MotifDef {
  label: string;
  poteaux?: number;
}

export const MOTIFS_NON_FAIT: MotifDef[] = [
  { label: 'Le client sonne, ne répond pas' },
  { label: 'Contact fermé / injoignable' },
  { label: 'Fausse contact' },
  { label: 'Local fermé' },
  { label: 'Hors zone' },
  { label: 'Câble distribution coupé' },
  { label: 'Câble transport coupé' },
  { label: 'Poteau cassé' },
  { label: 'Problème signal' },
  { label: 'Besoin poteau', poteaux: 1 },
  { label: 'Besoin 2 poteaux 350 m', poteaux: 2 },
  { label: 'Le modem n’est pas en place' },
  { label: 'Ligne tirée, pas d’électricité' },
  { label: 'Le modem n’est pas la copie conforme' },
];

export const MOTIFS_FAIT: MotifDef[] = [
  { label: 'Câble distribution coupé' },
  { label: 'Câble transport coupé' },
  { label: 'Zone en panne' },
  { label: 'Modem défectueux' },
  { label: 'Installé par quelqu’un' },
  { label: 'Confirmé par client' },
];

/** Poteaux à compter pour un motif (« Besoin 2 poteaux 350 m » → 2) */
export const poteauxDuMotif = (motif: string, liste: MotifDef[]) => liste.find((m) => m.label === motif)?.poteaux ?? 0;

/** « FGP 077490 » ou « TPH 45240200 » */
export const ligneLabel = (o: { typeLigne?: string; fgp: string }) => `${o.typeLigne || 'FGP'} ${o.fgp || '—'}`;

/** Application décharge (ouverte dans un nouvel onglet) */
export const DECHARGE_URL = 'https://41.188.123.36/ftth-intervention/nouvelle';
