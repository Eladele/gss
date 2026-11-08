// ─── Délais et points des équipes sur les fiches OT du programme ─────────────
// Heure de Nouakchott (UTC), jours ouvrés : ni dimanche ni jour férié (PUBLIC_HOLIDAYS).
//   • délai officiel : « OT reçu le » + 1 jour ouvré (dérangement 24 h) ou 2 (installation 48 h) ;
//   • jour de remise : le jour où l'équipe a reçu la fiche (distribution ou réaffectation), ou le
//     jour du programme s'il est plus tard ; reçue après 22 h → le lendemain ;
//   • fiche PRIORITAIRE : délai officiel déjà dépassé le jour de la remise → à faire ce jour-là
//     avant 22 h ;
//   • sinon, échéance de l'équipe : dérangement → le jour de la remise avant 22 h ; installation →
//     le jour ouvré suivant avant 22 h (ex. remise aujourd'hui → avant demain 22 h) ;
//   • +1 point si le chef marque « Fait » avant l'échéance (moitié pour une panne réseau).
// L'échéance et la priorité sont calculées par la base (vue situations_detail, mêmes règles) ;
// ce module ne les recalcule que si elles manquent.
// Pénalités (enregistrées par la base, table penalites) : −1 par fiche ni faite ni « non faite »
// au contrôle de 22 h une fois son échéance arrivée (et à chaque contrôle suivant), −1 quand une
// fiche ouverte est retardée. Réaffecter avant l'échéance ne pénalise pas.
import { DELAI_THRESHOLD_DRG, DELAI_THRESHOLD_INSTALLATION, PUBLIC_HOLIDAYS } from '@/utils/stats';
import { estMotifReseau } from '@/utils/programme';
import type { Penalite, ProgrammeOT } from '@/types';

/** Barème — modifiable ici, tout le reste suit */
export const POINTS = {
  dansDelai: 1, // fiche faite dans le délai
  horsDelai: 0, // fiche faite après le délai
  nonFait: 0, // fiche marquée « non fait »
  // fiche faite dont le motif est une panne réseau (câble distribution / transport coupé,
  // HUB-BOX / SUB-BOX défectueux) : moitié du point
  coefReseau: 0.5,
  penalite: -1, // affichage seulement : la valeur enregistrée est celle de la base
};

/** Arrondi à 0,5 près pour l'affichage (0.5 + 0.5 + … sans erreur de virgule) */
export const fmtPts = (n: number) => (Math.round(n * 2) / 2).toLocaleString('fr-FR');

const DAY = 86400000;
const HOLIDAYS = new Set(PUBLIC_HOLIDAYS);
const isNonOuvre = (ms: number) => {
  const d = new Date(ms);
  return d.getUTCDay() === 0 || HOLIDAYS.has(d.toISOString().slice(0, 10));
};
const dayStart = (iso: string) => Date.parse(iso.slice(0, 10) + 'T00:00:00Z');

/** Jours ouvrés écoulés entre la réception (jour J) et `endMs` — identique à stats.ts */
export function joursOuvres(startIso: string, endMs: number): number {
  const start = dayStart(startIso);
  if (Number.isNaN(start) || endMs <= start) return 0;
  let n = 0;
  for (let c = start + DAY; c <= endMs; c += DAY) if (!isNonOuvre(c)) n++;
  return n;
}

export const seuilJours = (nature: ProgrammeOT['nature']) => (nature === 'derangement' ? DELAI_THRESHOLD_DRG : DELAI_THRESHOLD_INSTALLATION);

/** Dernier jour pour être dans le délai (YYYY-MM-DD), jusqu'à 23:59 */
export function echeance(startIso: string, nature: ProgrammeOT['nature']): string {
  const seuil = seuilJours(nature);
  let c = dayStart(startIso);
  let n = 0;
  // avance jusqu'au jour qui ferait dépasser le seuil, et prend la veille
  for (;;) {
    const next = c + DAY;
    if (!isNonOuvre(next) && n + 1 > seuil) break;
    if (!isNonOuvre(next)) n++;
    c = next;
  }
  // un dimanche / jour férié en fin de délai : on affiche le dernier jour ouvré
  while (c > dayStart(startIso) && isNonOuvre(c)) c -= DAY;
  return new Date(c).toISOString().slice(0, 10);
}

export type EtatDelai = 'dans' | 'hors' | 'retard' | 'en_cours' | 'non_fait';

/** Heure limite chaque jour (heure de Nouakchott = UTC) */
export const HEURE_LIMITE = 22;
const isoJour = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** n-ième jour ouvré après `iso` (n = 0 : le jour même s'il est ouvré, sinon le suivant) */
function ajouterJoursOuvres(iso: string, n: number): string {
  let c = dayStart(iso);
  if (n <= 0) {
    while (isNonOuvre(c)) c += DAY;
    return isoJour(c);
  }
  for (let k = 0; k < n; ) {
    c += DAY;
    if (!isNonOuvre(c)) k++;
  }
  return isoJour(c);
}
/** Jour de remise à l'équipe : reçue après 22 h → lendemain ; jamais avant le jour du programme */
export function jourRemise(assigneLe: string | null | undefined, dateProgramme: string | null | undefined): string {
  const a = assigneLe ? new Date(assigneLe) : new Date();
  const remise = isoJour(a.getTime() + (a.getUTCHours() >= HEURE_LIMITE ? DAY : 0));
  return ajouterJoursOuvres([remise, (dateProgramme ?? '').slice(0, 10)].filter(Boolean).sort().pop()!, 0);
}
/** Délai officiel dépassé le jour de la remise */
export const estPrioritaire = (recuLe: string, nature: ProgrammeOT['nature'], remise: string) => echeance(recuLe, nature) < remise;
/** Échéance de l'équipe (avant 22 h ce jour-là) */
export function echeanceEquipe(recuLe: string, nature: ProgrammeOT['nature'], remise: string): string {
  return estPrioritaire(recuLe, nature, remise) || nature === 'derangement' ? remise : ajouterJoursOuvres(remise, 1);
}
/** Instant limite (22 h) d'un jour */
export const limite22h = (iso: string) => Date.parse(`${iso.slice(0, 10)}T${String(HEURE_LIMITE).padStart(2, '0')}:00:00Z`);

export interface DelaiOT {
  etat: EtatDelai;
  jours: number; // jours ouvrés écoulés depuis la remise (jusqu'à la clôture, ou maintenant)
  seuil: number;
  depart: string; // YYYY-MM-DD — jour de remise à l'équipe
  echeance: string; // YYYY-MM-DD — échéance de l'équipe (avant 22 h)
  prioritaire: boolean; // délai officiel déjà dépassé à la remise
  points: number;
  reseau: boolean; // panne réseau → demi-point
  recuLe: string; // YYYY-MM-DD — « OT reçu le » (départ officiel)
  echeanceOfficielle: string; // YYYY-MM-DD — échéance officielle depuis « OT reçu le »
  confieLe: string | null; // YYYY-MM-DD — jour où l'équipe a reçu la fiche
  decale: boolean; // l'équipe a reçu la fiche après « OT reçu le »
  confieEnRetard: boolean; // l'échéance officielle était déjà dépassée quand l'équipe a reçu la fiche
}

export function delaiOT(
  ot: Pick<ProgrammeOT, 'nature' | 'statut' | 'dateRecu' | 'dateProgramme' | 'traiteLe'> & {
    assigneLe?: string | null;
    motif?: string;
    echeanceEquipe?: string | null;
    prioritaire?: boolean;
  },
  now = Date.now(),
): DelaiOT {
  const recuLe = (ot.dateRecu || ot.dateProgramme).slice(0, 10);
  const confieLe = ot.assigneLe ? new Date(ot.assigneLe).toISOString().slice(0, 10) : null;
  const depart = jourRemise(ot.assigneLe, ot.dateProgramme);
  const echeanceOfficielle = echeance(recuLe, ot.nature);
  const prioritaire = ot.echeanceEquipe ? !!ot.prioritaire : estPrioritaire(recuLe, ot.nature, depart);
  const ech = ot.echeanceEquipe ?? echeanceEquipe(recuLe, ot.nature, depart);
  const fin = ot.statut === 'fait' && ot.traiteLe ? Date.parse(ot.traiteLe) : now;
  const dansLesTemps = fin <= limite22h(ech);
  const etat: EtatDelai =
    ot.statut === 'non_fait' ? 'non_fait' : ot.statut === 'fait' ? (dansLesTemps ? 'dans' : 'hors') : dansLesTemps ? 'en_cours' : 'retard';
  const base = etat === 'dans' ? POINTS.dansDelai : etat === 'hors' ? POINTS.horsDelai : etat === 'non_fait' ? POINTS.nonFait : 0;
  const reseau = ot.statut === 'fait' && estMotifReseau(ot.motif);
  const points = reseau ? base * POINTS.coefReseau : base;
  return {
    etat,
    jours: joursOuvres(depart, fin),
    seuil: seuilJours(ot.nature),
    depart,
    echeance: ech,
    prioritaire,
    points,
    reseau,
    recuLe,
    echeanceOfficielle,
    confieLe,
    decale: depart > recuLe,
    confieEnRetard: prioritaire,
  };
}

export const ETAT_DELAI: Record<EtatDelai, { label: string; cls: string }> = {
  dans: { label: 'Dans le délai', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  hors: { label: 'Hors délai', cls: 'bg-red-50 text-red-700 border-red-200' },
  retard: { label: 'En retard', cls: 'bg-red-600 text-white border-red-600' },
  en_cours: { label: 'Dans les temps', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  non_fait: { label: 'Non fait', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export interface LigneClassement {
  equipe: string;
  points: number;
  total: number; // fiches reçues sur la période
  faits: number;
  dans: number;
  hors: number;
  retard: number; // à faire, délai dépassé
  enCours: number;
  nonFaits: number;
  confiesEnRetard: number; // fiches déjà hors délai officiel quand l'équipe les a reçues
  pctDansDelai: number; // dans / faits
  pointsInst: number;
  pointsDer: number;
  penalites: number; // nombre de pénalités sur la période
  pointsPenalites: number; // total des pénalités (négatif)
  fauxOk: number; // fiches marquées « Fait » à tort (dans les pénalités)
  rang: number;
}

const ligneVide = (equipe: string): LigneClassement => ({
  equipe, points: 0, total: 0, faits: 0, dans: 0, hors: 0, retard: 0, enCours: 0, nonFaits: 0, confiesEnRetard: 0,
  pctDansDelai: 0, pointsInst: 0, pointsDer: 0, penalites: 0, pointsPenalites: 0, fauxOk: 0, rang: 0,
});

/** Classement des équipes : points (délais − pénalités), puis % dans le délai, puis fiches faites */
export function classement(ots: ProgrammeOT[], penalites: (Pick<Penalite, 'equipe' | 'points'> & { motif?: Penalite['motif'] })[] = [], now = Date.now()): LigneClassement[] {
  const m = new Map<string, LigneClassement>();
  for (const p of penalites) {
    const r = m.get(p.equipe) ?? ligneVide(p.equipe);
    r.penalites++;
    if (p.motif === 'faux_ok') r.fauxOk++;
    r.pointsPenalites += p.points;
    r.points += p.points;
    m.set(p.equipe, r);
  }
  for (const ot of ots) {
    const key = ot.equipe || 'Sans équipe';
    const r = m.get(key) ?? ligneVide(key);
    const d = delaiOT(ot, now);
    r.total++;
    r.points += d.points;
    if (ot.nature === 'derangement') r.pointsDer += d.points;
    else r.pointsInst += d.points;
    if (d.etat === 'dans') r.dans++;
    if (d.etat === 'hors') r.hors++;
    if (d.etat === 'retard') r.retard++;
    if (d.etat === 'en_cours') r.enCours++;
    if (d.etat === 'non_fait') r.nonFaits++;
    if (ot.statut === 'fait') r.faits++;
    if (d.confieEnRetard) r.confiesEnRetard++;
    m.set(key, r);
  }
  const rows = [...m.values()].map((r) => ({ ...r, pctDansDelai: r.faits ? Math.round((r.dans / r.faits) * 100) : 0 }));
  rows.sort((a, b) => b.points - a.points || b.pctDansDelai - a.pctDansDelai || b.faits - a.faits || a.equipe.localeCompare(b.equipe));
  rows.forEach((r, i) => (r.rang = i > 0 && r.points === rows[i - 1].points && r.pctDansDelai === rows[i - 1].pctDansDelai ? rows[i - 1].rang : i + 1));
  return rows;
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « jeu. 23/10 » */
export const jourCourt = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  return `${JOURS[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};
