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
  /** panne du réseau (câble, boîtier) : la fiche faite ne rapporte que la moitié du point */
  reseau?: boolean;
  /** « non fait » proposé seulement pour une installation */
  installation?: boolean;
  /**
   * fiche faite sans vraie intervention (confirmé par client, modem défectueux, problème
   * d'électricité, erreur de signalisation) : pas le point entier, mais le barème
   * « sans intervention » (0,5) + bonus décharge (0,25) + bonus scanné (0,25)
   */
  leger?: boolean;
  /** fiche faite qui ne rapporte aucun point (installé par quelqu'un, confirmé par client, erreur de signalisation) */
  sansPoint?: boolean;
}

export const MOTIFS_NON_FAIT: MotifDef[] = [
  { label: 'Le client sonne, ne répond pas' },
  { label: 'Contact fermé / injoignable' },
  { label: 'Fausse contact' },
  { label: 'Local fermé' },
  { label: 'Câble distribution coupé' },
  { label: 'Câble transport coupé' },
  { label: 'RV demain' },
  { label: 'Local fermé RV demain' },
  { label: 'Poteau cassé' },
  { label: 'Problème signal' },
  { label: 'Coupure courant' },
  // seulement pour les installations
  { label: 'Hors zone', installation: true },
  { label: 'Besoin poteau', poteaux: 1, installation: true },
  { label: 'Besoin 2 poteaux', poteaux: 2, installation: true },
  { label: 'Le modem n’est pas en place', installation: true },
  { label: 'Ligne tirée, pas d’électricité', installation: true },
  { label: 'Ligne tirée, ne synchronise pas', installation: true },
  { label: 'Le modem n’est pas la copie conforme', installation: true },
];

/** Motifs « non fait » d'une fiche : les motifs « installation » n'apparaissent que pour une installation */
export const motifsNonFaitPour = (nature: string) => MOTIFS_NON_FAIT.filter((m) => !m.installation || nature === 'installation');

export const MOTIFS_FAIT: MotifDef[] = [
  { label: 'Câble distribution coupé', reseau: true },
  { label: 'Câble transport coupé', reseau: true },
  { label: 'HUB-BOX défectueux', reseau: true },
  { label: 'SUB-BOX défectueux', reseau: true },
  { label: 'FMC' },
  { label: 'Câble drop coupé' },
  { label: 'jarrtiere' },
  { label: 'changement mot de pass' },
  { label: 'deplacement ont' },
  { label: 'configueration ont' },
  { label: 'Zone en panne' },
  { label: 'Modem défectueux', leger: true },
  { label: 'Erreur de signalisation', sansPoint: true },
  { label: 'Probleme electricité', leger: true },
  { label: 'Installé par quelqu’un', sansPoint: true },
  { label: 'Confirmé par client', sansPoint: true },
];

/** Comparaison sans accents, majuscules, apostrophes ni espaces en trop */
const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const MOTIFS_LEGERS = new Set([...MOTIFS_FAIT.filter((m) => m.leger).map((m) => normal(m.label)), normal('Problème électricité')]);
const MOTIFS_SANS_POINT = new Set([
  ...MOTIFS_FAIT.filter((m) => m.sansPoint).map((m) => normal(m.label)),
  normal('Confirmé par le client'),
  normal("Installé par quelqu'un"),
]);

/** Motif « fait » de panne réseau (câble coupé, HUB-BOX / SUB-BOX défectueux) → demi-point */
export const estMotifReseau = (motif?: string | null) => !!motif && MOTIFS_FAIT.some((m) => m.reseau && normal(m.label) === normal(motif));
/** Motif « fait » sans intervention (modem défectueux, problème électricité) : 0,5 + bonus décharge / scan */
export const estMotifLeger = (motif?: string | null) => !!motif && MOTIFS_LEGERS.has(normal(motif));
/** Motif « fait » qui ne rapporte aucun point (installé par quelqu'un, confirmé par client, erreur de signalisation) */
export const estMotifSansPoint = (motif?: string | null) => !!motif && MOTIFS_SANS_POINT.has(normal(motif));

/** Libellés des pénalités */
export const MOTIF_PENALITE = {
  non_traitee: 'Non traitée à 22 h',
  reaffectee: 'Réaffectée à une autre équipe',
  retardee: 'Retardée',
  faux_ok: 'Faux OK (fiche marquée Fait à tort)',
} as const;

/** Motifs du faux OK — liste fixe (mêmes codes que la base, fonction libelle_faux_ok) */
export const MOTIFS_FAUX_OK = [
  { code: 'client_non_raccorde', label: 'Client non raccordé' },
  { code: 'ne_synchronise_pas', label: 'Ne synchronise pas,Aucune décharge' },
  { code: 'autre', label: 'Autre' },
] as const;
export type MotifFauxOk = (typeof MOTIFS_FAUX_OK)[number]['code'];
/** Faux OK : réservé à l'administrateur et au superviseur (la base le vérifie aussi) */
export const peutSignalerFauxOk = (role?: string) => role === 'admin' || role === 'superviseur';
/** « Ne synchronise pas », « Autre : modem absent » ; ancien faux OK sans code : sa note */
export const libelleFauxOk = (code: string | null | undefined, note?: string | null) => {
  const label = MOTIFS_FAUX_OK.find((m) => m.code === code)?.label;
  if (!label) return note ?? '';
  if (code === 'autre') return note ? `Autre : ${note}` : 'Autre';
  return note ? `${label} — ${note}` : label;
};

/** Poteaux à compter pour un motif (« Besoin 2 poteaux 350 m » → 2) */
export const poteauxDuMotif = (motif: string, liste: MotifDef[]) => liste.find((m) => m.label === motif)?.poteaux ?? 0;

/** « FGP 077490 » ou « TPH 45240200 » */
export const ligneLabel = (o: { typeLigne?: string; fgp: string }) => `${o.typeLigne || 'FGP'} ${o.fgp || '—'}`;

/** Application décharge (ouverte dans un nouvel onglet) */
export const DECHARGE_URL = 'https://41.188.123.36/ftth-intervention/nouvelle';

// ─── Application ID du fixe (OT ANS) ─────────────────────────────────────────
// Calculé depuis le DIS de l'OT, ex. TZ1Z032712/2-8 → A/0/1/6/32 :
//   • zone sur 6 caractères (TZ1Z03), puis le PCO (2712/2), puis le port du PCO (8) ;
//   • PCO = hub (1 à 4) + série (1 à 16 ; hub 1 : 1-4, hub 2 : 5-8, hub 3 : 9-12, hub 4 : 13-16)
//     + 2 chiffres (11, 12, 21, 22) + « /1 » ou « /2 » ;
//   • chaque série = 8 PCO dans l'ordre x11/1, x11/2, x12/1, x12/2, x21/1, x21/2, x22/1, x22/2,
//     de 8 ports chacun = 64 ONU ; port de l'OLT (Port ID 0 à 15) = série − 1 ;
//   • Application ID = A/0/(hub − 1)/(série − 1)/(rang du PCO dans la série × 8 + port du PCO).
export const APP_ID_PREFIXE = 'A/0';
export interface ApplicationId {
  id: string;
  hub: number;
  serie: number;
  portOlt: number;
  onuId: number;
}
export function applicationIdDepuisDis(dis: string | null | undefined): ApplicationId | null {
  const d = (dis ?? '').replace(/\s+/g, '').toUpperCase();
  if (d.length < 10) return null;
  const m = /^([1-4])(\d{1,2})([12])([12])\/([12])-(\d{1,2})$/.exec(d.slice(6));
  if (!m) return null;
  const hub = Number(m[1]);
  const serie = Number(m[2]);
  const port = Number(m[6]);
  if (serie < (hub - 1) * 4 + 1 || serie > hub * 4 || port < 1 || port > 8) return null;
  const rang = ((Number(m[3]) - 1) * 2 + (Number(m[4]) - 1)) * 2 + (Number(m[5]) - 1); // 0 à 7
  const onuId = rang * 8 + port; // 1 à 64
  return { id: `${APP_ID_PREFIXE}/${hub - 1}/${serie - 1}/${onuId}`, hub, serie, portOlt: serie - 1, onuId };
}
