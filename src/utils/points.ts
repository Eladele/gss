// ─── Délais et points des équipes sur les fiches OT du programme ─────────────
// Même règle que les statistiques des situations (stats.ts) :
//   • départ : la date « OT reçu le » imprimée sur l'OT (à défaut, la date du programme) ;
//     EXCEPTION — si l'équipe a reçu la fiche plus tard (distribution tardive, réaffectation,
//     programme prévu pour un jour suivant), son délai part du jour où elle l'a reçue :
//     l'équipe n'est pas pénalisée pour un retard qui n'est pas le sien.
//     Ex. : OT reçu le 23, confié à hamadi le 25 → les 48 h de hamadi partent du 25.
//     Le délai « officiel » (depuis « OT reçu le ») reste calculé pour le suivi ;
//   • fin    : la date et l'heure où le chef a marqué la fiche « Fait » ;
//   • délai  : en jours ouvrés (dimanches et jours fériés de PUBLIC_HOLIDAYS non comptés),
//              comptés à partir du lendemain de la réception ;
//   • seuil  : installation 48 h = 2 jours ouvrés, dérangement 24 h = 1 jour ouvré.
// Exemple : OT d'installation reçu le mardi 21/10 → à faire au plus tard le jeudi 23/10.
import { DELAI_THRESHOLD_DRG, DELAI_THRESHOLD_INSTALLATION, PUBLIC_HOLIDAYS } from '@/utils/stats';
import type { ProgrammeOT } from '@/types';

/** Barème — modifiable ici, tout le reste suit */
export const POINTS = {
  dansDelai: 1, // fiche faite dans le délai
  horsDelai: 0, // fiche faite après le délai
  nonFait: 0, // fiche marquée « non fait »
};

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

export interface DelaiOT {
  etat: EtatDelai;
  jours: number; // jours ouvrés écoulés depuis le départ de l'équipe (jusqu'à la clôture, ou maintenant)
  seuil: number;
  depart: string; // YYYY-MM-DD — départ du délai de l'équipe
  echeance: string; // YYYY-MM-DD — échéance de l'équipe
  points: number;
  recuLe: string; // YYYY-MM-DD — « OT reçu le » (départ officiel)
  echeanceOfficielle: string; // YYYY-MM-DD — échéance officielle depuis « OT reçu le »
  confieLe: string | null; // YYYY-MM-DD — jour où l'équipe a reçu la fiche
  decale: boolean; // le délai de l'équipe part après « OT reçu le »
  confieEnRetard: boolean; // l'échéance officielle était déjà dépassée quand l'équipe a reçu la fiche
}

export function delaiOT(
  ot: Pick<ProgrammeOT, 'nature' | 'statut' | 'dateRecu' | 'dateProgramme' | 'traiteLe'> & { assigneLe?: string | null },
  now = Date.now(),
): DelaiOT {
  const recuLe = (ot.dateRecu || ot.dateProgramme).slice(0, 10);
  const confieLe = ot.assigneLe ? new Date(ot.assigneLe).toISOString().slice(0, 10) : null;
  // départ de l'équipe : le plus tardif entre la réception de l'OT, le jour du programme et la remise à l'équipe
  const depart = [recuLe, ot.dateProgramme?.slice(0, 10) ?? '', confieLe ?? ''].filter(Boolean).sort().pop()!;
  const echeanceOfficielle = echeance(recuLe, ot.nature);
  const seuil = seuilJours(ot.nature);
  const fin = ot.statut === 'fait' && ot.traiteLe ? Date.parse(ot.traiteLe) : now;
  const jours = joursOuvres(depart, fin);
  const etat: EtatDelai =
    ot.statut === 'non_fait' ? 'non_fait' : ot.statut === 'fait' ? (jours <= seuil ? 'dans' : 'hors') : jours > seuil ? 'retard' : 'en_cours';
  const points = etat === 'dans' ? POINTS.dansDelai : etat === 'hors' ? POINTS.horsDelai : etat === 'non_fait' ? POINTS.nonFait : 0;
  return {
    etat,
    jours,
    seuil,
    depart,
    echeance: echeance(depart, ot.nature),
    points,
    recuLe,
    echeanceOfficielle,
    confieLe,
    decale: depart > recuLe,
    confieEnRetard: !!confieLe && confieLe > echeanceOfficielle,
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
  rang: number;
}

/** Classement des équipes : points, puis % dans le délai, puis nombre de fiches faites */
export function classement(ots: ProgrammeOT[], now = Date.now()): LigneClassement[] {
  const m = new Map<string, LigneClassement>();
  for (const ot of ots) {
    const key = ot.equipe || 'Sans équipe';
    const r =
      m.get(key) ??
      ({ equipe: key, points: 0, total: 0, faits: 0, dans: 0, hors: 0, retard: 0, enCours: 0, nonFaits: 0, confiesEnRetard: 0, pctDansDelai: 0, pointsInst: 0, pointsDer: 0, rang: 0 } as LigneClassement);
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
