// ─── Délais et points des équipes sur les fiches OT du programme ─────────────
// Heure de Nouakchott (UTC), jours ouvrés : ni dimanche ni jour férié (PUBLIC_HOLIDAYS).
//   • délai officiel : « OT reçu le » + 1 jour ouvré (dérangement 24 h) ou 2 (installation 48 h) ;
//   • jour de remise : le jour où l'équipe a reçu la fiche (distribution ou réaffectation), ou le
//     jour du programme s'il est plus tard ; reçue après 22 h → le lendemain ;
//   • fiche PRIORITAIRE : délai officiel déjà dépassé le jour de la remise → à faire ce jour-là
//     avant 22 h ;
//   • sinon, échéance de l'équipe : dérangement → le jour de la remise avant 22 h ; installation →
//     le jour ouvré suivant avant 22 h (ex. remise aujourd'hui → avant demain 22 h) ;
//   • points du barème (page Paramètres, par défaut +1) si le chef marque « Fait » avant
//     l'échéance (moitié pour une panne réseau).
// L'échéance et la priorité sont calculées par la base (vue situations_detail, mêmes règles) ;
// ce module ne les recalcule que si elles manquent.
// Pénalités (enregistrées par la base, table penalites) : −1 par fiche ni faite ni « non faite »
// au contrôle de 22 h une fois son échéance arrivée (et à chaque contrôle suivant), −1 quand une
// fiche ouverte est retardée. Réaffecter avant l'échéance ne pénalise pas.
import { DELAI_THRESHOLD_DRG, DELAI_THRESHOLD_INSTALLATION, HOLIDAY_SET as HOLIDAYS } from '@/utils/stats';
import { estMotifLeger, estMotifReseau, estMotifSansPoint, typeCable } from '@/utils/programme';
import type { Penalite, ProgrammeOT } from '@/types';
import { BAREME_DEFAUT, BAREME_OT_DEFAUT, REGLAGES_DEFAUT, type Bareme, type BaremeOT } from '@/lib/parametresService';

/**
 * Barème en vigueur — modifiable par l'administrateur (page Paramètres, enregistré dans la base).
 * Valeurs par défaut ci-dessous ; remplacées au démarrage par celles de la base (appliquerBareme).
 * Les pénalités déjà enregistrées gardent la valeur qu'elles avaient à leur création.
 */
export const POINTS = {
  dansDelai: BAREME_DEFAUT.faitDansDelai, // fiche faite dans le délai
  horsDelai: BAREME_DEFAUT.faitHorsDelai, // fiche faite après le délai
  nonFait: BAREME_DEFAUT.nonFait, // fiche marquée « non fait »
  // fiche faite dont le motif est une panne réseau (câble distribution / transport coupé,
  // HUB-BOX / SUB-BOX défectueux) : coefficient du point (0,5 = moitié)
  coefReseau: BAREME_DEFAUT.coefReseau,
  // fiche faite sans intervention (confirmé par client, modem défectueux, électricité, erreur de
  // signalisation) : ces points au lieu du point entier, + bonus décharge + bonus scanné
  sansIntervention: BAREME_DEFAUT.sansIntervention,
  bonusDecharge: BAREME_DEFAUT.bonusDecharge,
  bonusScan: BAREME_DEFAUT.bonusScan,
  // fiche faite « installé par quelqu'un », « confirmé par client », « erreur de signalisation » : 0
  faitSansPoint: BAREME_DEFAUT.faitSansPoint,
  // pénalités (affichage : la valeur enregistrée sur chaque pénalité est celle de la base)
  penalite: BAREME_DEFAUT.penaliteNonTraitee,
  penalites: {
    non_traitee: BAREME_DEFAUT.penaliteNonTraitee,
    retardee: BAREME_DEFAUT.penaliteRetardee,
    reaffectee: BAREME_DEFAUT.penaliteReaffectee,
    faux_ok: BAREME_DEFAUT.penaliteFauxOk,
  } as Record<Penalite['motif'], number>,
};

/** Applique le barème enregistré par l'administrateur */
export function appliquerBareme(b: Bareme) {
  POINTS.dansDelai = b.faitDansDelai;
  POINTS.horsDelai = b.faitHorsDelai;
  POINTS.nonFait = b.nonFait;
  POINTS.coefReseau = b.coefReseau;
  POINTS.sansIntervention = b.sansIntervention;
  POINTS.bonusDecharge = b.bonusDecharge;
  POINTS.bonusScan = b.bonusScan;
  POINTS.faitSansPoint = b.faitSansPoint;
  POINTS.penalite = b.penaliteNonTraitee;
  POINTS.penalites = { non_traitee: b.penaliteNonTraitee, retardee: b.penaliteRetardee, reaffectee: b.penaliteReaffectee, faux_ok: b.penaliteFauxOk };
}

/**
 * Barème des fiches faites, compté depuis « OT reçu le » en jours ouvrés (dimanches et fériés exclus) :
 *   • installation faite en 24 h (1 jour) : 2 pt — en 48 h (2 jours) : 1 pt ;
 *   • installation avec poteau (« Besoin poteau », « Besoin 2 poteaux », « Poteau cassé » avant) :
 *     + 1 pt de plantation, sauf en 48 h où le total est 1,5 pt (24 h → 3 pt) ;
 *   • installation en retard : −1 le 1er jour de retard, −0,5 par jour en plus (+ 1 si poteau) ;
 *   • dérangement : 0,5 pt, −0,5 par jour de retard (1 jour → 0, 2 jours → −0,5) ;
 *   • câble distribution réparé : 2 pt — câble MPO : 5 pt ; plusieurs fiches de la même panne
 *     (même équipe, même zone, même câble, faites le même jour) : seule la première a ces points,
 *     les autres comptent comme un dérangement normal ;
 *   • non fait : 0 ;
 *   • fiche reçue par l'équipe alors que le délai officiel était déjà dépassé (prioritaire, pas sa
 *     faute) et faite avant l'échéance de l'équipe (22 h) : barème « dans le délai » — installation
 *     comme en 48 h (1 pt, 1,5 avec poteau), dérangement 0,5. Faite après son échéance : barème
 *     normal depuis « OT reçu le » (retard).
 */
export const BAREME_OT: BaremeOT = { ...BAREME_OT_DEFAUT };

/** Applique le barème des fiches enregistré par l'administrateur (page Paramètres) */
export function appliquerBaremeOt(b: BaremeOT) {
  Object.assign(BAREME_OT, b);
}

/** Arrondi au centième pour l'affichage (0.5 + 0.5 + … sans erreur de virgule) : « 1,5 », « −1 » */
export const fmtPts = (n: number) => (Math.round(n * 100) / 100 || 0).toLocaleString('fr-FR').replace('-', '−');
/** « +1 », « −0,5 », « 0 » */
export const fmtPtsSigne = (n: number) => (n > 0 ? `+${fmtPts(n)}` : fmtPts(n));
/** « point » ou « points » selon la valeur */
export const motPoint = (n: number) => (Math.abs(n) > 1 ? 'points' : 'point');
/** « 1 point », « 2 points », « 0,5 point » (valeur absolue) */
export const ptsTexte = (n: number) => `${fmtPts(Math.abs(n))} point${Math.abs(n) > 1 ? 's' : ''}`;

const DAY = 86400000;
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
/** Prochain jour ouvré après « iso » (dimanche et jours fériés sautés) : le jour d'un programme « de demain » */
export const jourOuvreSuivant = (iso: string) => ajouterJoursOuvres(iso, 1);

/**
 * Réglages du programme (page Paramètres) :
 *   • heureSoir : à partir de cette heure, la distribution propose le programme du lendemain ;
 *   • joursNonFaites : fiches « non faites » des N derniers jours proposées au renvoi.
 */
export const REGLAGES_PROGRAMME = {
  heureSoir: REGLAGES_DEFAUT.heureProgrammeSoir,
  joursNonFaites: REGLAGES_DEFAUT.joursNonFaites,
};
/** Distribution du soir : on prépare le programme du lendemain */
export const estSoir = (d = new Date()) => d.getHours() >= REGLAGES_PROGRAMME.heureSoir;

/**
 * Fiche distribuée d'avance (le soir pour le lendemain) : son jour de remise est après « jour ».
 * Elle n'est ni à faire ni en retard aujourd'hui : elle compte à partir de son jour de programme.
 */
export const estPourPlusTard = (ot: Pick<ProgrammeOT, 'statut' | 'assigneLe' | 'dateProgramme'>, jour = isoJour(Date.now())) =>
  ot.statut === 'a_faire' && jourRemise(ot.assigneLe, ot.dateProgramme) > jour;

/**
 * Prioritaire : l'échéance normale de l'équipe dépasserait le délai officiel (depuis « OT reçu le »).
 *   • dérangement (à faire le jour de la remise) : délai officiel déjà dépassé à la remise ;
 *   • installation (normalement le lendemain) : la remise tombe le dernier jour du délai ou après.
 *     Ex. installation reçue le 16 (délai 2 jours ouvrés → 18), remise le 18 : prioritaire, à faire le 18.
 */
export const estPrioritaire = (recuLe: string, nature: ProgrammeOT['nature'], remise: string) =>
  nature === 'installation' ? echeance(recuLe, nature) <= remise : echeance(recuLe, nature) < remise;
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
  leger: boolean; // fiche faite sans intervention → barème « sans intervention » + bonus
  sansPoint: boolean; // fiche faite qui ne rapporte rien (installé par quelqu'un, confirmé par client…)
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
    decharge?: boolean | null;
    scanne?: boolean | null;
    /** poteaux posés pour cette fiche (plantation) */
    poteaux?: number;
    /** autre fiche de la même panne de câble déjà payée (voir doublonsCable) */
    doublonCable?: boolean;
  },
  now = Date.now(),
): DelaiOT {
  const recuLe = (ot.dateRecu || ot.dateProgramme).slice(0, 10);
  const confieLe = ot.assigneLe ? new Date(ot.assigneLe).toISOString().slice(0, 10) : null;
  const depart = jourRemise(ot.assigneLe, ot.dateProgramme);
  const echeanceOfficielle = echeance(recuLe, ot.nature);
  // fiche encore à faire : la règle « prioritaire » est recalculée ici (aussi pour un programme déjà
  // distribué, ex. ce soir pour demain) ; une fiche close garde l'échéance enregistrée (points inchangés)
  const prioCalcule = ot.statut === 'a_faire' && estPrioritaire(recuLe, ot.nature, depart);
  const prioritaire = (ot.echeanceEquipe ? !!ot.prioritaire : estPrioritaire(recuLe, ot.nature, depart)) || prioCalcule;
  let ech = ot.echeanceEquipe ?? echeanceEquipe(recuLe, ot.nature, depart);
  if (prioCalcule && depart < ech) ech = depart;
  const fin = ot.statut === 'fait' && ot.traiteLe ? Date.parse(ot.traiteLe) : now;
  const dansLesTemps = fin <= limite22h(ech);
  const etat: EtatDelai =
    ot.statut === 'non_fait' ? 'non_fait' : ot.statut === 'fait' ? (dansLesTemps ? 'dans' : 'hors') : dansLesTemps ? 'en_cours' : 'retard';
  // barème depuis « OT reçu le » (voir BAREME_OT)
  const joursOfficiels = joursOuvres(recuLe, fin);
  // reçue déjà hors délai officiel (pas la faute de l'équipe) et faite avant SON échéance de 22 h :
  // barème « dans le délai » (installation 48 h = 1, 1,5 avec poteau ; dérangement 0,5), jamais négatif
  const pasSaFaute = ot.statut === 'fait' && prioritaire && dansLesTemps;
  const joursPoints = pasSaFaute ? Math.min(joursOfficiels, seuilJours(ot.nature)) : joursOfficiels;
  const cable = ot.statut === 'fait' && !ot.doublonCable ? typeCable(ot.motif) : null;
  const base = ot.statut === 'fait' ? pointsFaite(ot.nature, joursPoints, (ot.poteaux ?? 0) > 0) : ot.statut === 'non_fait' ? POINTS.nonFait : 0;
  const reseau = ot.statut === 'fait' && !typeCable(ot.motif) && estMotifReseau(ot.motif);
  const sansPoint = ot.statut === 'fait' && estMotifSansPoint(ot.motif);
  const leger = ot.statut === 'fait' && !reseau && !sansPoint && estMotifLeger(ot.motif);
  const dansOfficiel = joursPoints <= seuilJours(ot.nature);
  // sans intervention, dans le délai : 0,5 + 0,25 si décharge + 0,25 si scanné (barème)
  const points = cable
    ? cable === 'mpo'
      ? BAREME_OT.cableMpo
      : BAREME_OT.cableDistribution
    : sansPoint
    ? dansOfficiel
      ? POINTS.faitSansPoint
      : Math.min(0, base)
    : reseau && base > 0
    ? base * POINTS.coefReseau
    : leger && dansOfficiel
      ? Math.min(base, POINTS.sansIntervention + (ot.decharge ? POINTS.bonusDecharge : 0) + (ot.scanne ? POINTS.bonusScan : 0))
      : base;
  return {
    etat,
    jours: joursOuvres(depart, fin),
    seuil: seuilJours(ot.nature),
    depart,
    echeance: ech,
    prioritaire,
    points,
    reseau,
    leger,
    sansPoint,
    recuLe,
    echeanceOfficielle,
    confieLe,
    decale: depart > recuLe,
    confieEnRetard: prioritaire,
  };
}

/** Points d'une fiche faite après `jours` jours ouvrés depuis « OT reçu le » (BAREME_OT) */
export function pointsFaite(nature: ProgrammeOT['nature'], jours: number, poteau: boolean): number {
  const b = BAREME_OT;
  if (nature === 'derangement') return b.drg + b.retardParJour * Math.max(0, jours - 1);
  if (jours <= 1) return b.inst24h + (poteau ? b.plantationPoteau : 0);
  if (jours === 2) return poteau ? b.inst48hPoteau : b.inst48h;
  return b.instRetard + b.retardParJour * (jours - 3) + (poteau ? b.plantationPoteau : 0);
}

/**
 * Fiches d'une même panne de câble (distribution / MPO) faites ensemble : même équipe, même zone,
 * même câble, même jour. La première faite reçoit les points du câble ; les autres (ids renvoyés)
 * comptent comme un dérangement normal.
 */
export function doublonsCable(
  ots: { id: string; equipe?: string | null; zone?: string | null; motif?: string; statut: string; traiteLe?: string | null }[],
): Set<string> {
  const groupes = new Map<string, { id: string; t: string }[]>();
  for (const o of ots) {
    const c = o.statut === 'fait' && o.traiteLe ? typeCable(o.motif) : null;
    if (!c) continue;
    const k = [o.equipe ?? '', (o.zone ?? '').toUpperCase(), c, isoJour(Date.parse(o.traiteLe!))].join('|');
    groupes.set(k, [...(groupes.get(k) ?? []), { id: o.id, t: o.traiteLe! }]);
  }
  const out = new Set<string>();
  for (const l of groupes.values()) [...l].sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id)).slice(1).forEach((x) => out.add(x.id));
  return out;
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
  const doublons = doublonsCable(ots);
  for (const ot of ots) {
    const key = ot.equipe || 'Sans équipe';
    const r = m.get(key) ?? ligneVide(key);
    const d = delaiOT({ ...ot, doublonCable: doublons.has(ot.id) }, now);
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
