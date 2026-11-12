// Surveillance des équipes (superviseur) : programme du jour, faites / non faites et points,
// par jour, par semaine ou par mois.
//
//   • une fiche compte dans la période où elle a été clôturée (« Fait » ou « Non fait ») ;
//     ses points sont ceux du barème (dans le délai, hors délai, panne réseau, sans intervention…) ;
//   • une pénalité compte le jour où elle a été donnée (contrôle de 22 h, retard, faux OK) ;
//   • « à faire » et « en retard » : fiches encore ouvertes (programme en cours, maintenant).
import type { Penalite, ProgrammeOT } from '@/types';
import { delaiOT, estPourPlusTard } from '@/utils/points';

export type Granularite = 'jour' | 'semaine' | 'mois';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const d0 = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
export const isoJour = (d: Date) => d.toISOString().slice(0, 10);
export const ajouterJours = (iso: string, n: number) => {
  const d = d0(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoJour(d);
};
const lundi = (iso: string) => ajouterJours(iso, -((d0(iso).getUTCDay() + 6) % 7));

/** Début et fin (inclus) de la période qui contient « iso » */
export function periode(iso: string, g: Granularite): { debut: string; fin: string } {
  if (g === 'jour') return { debut: iso, fin: iso };
  if (g === 'semaine') {
    const l = lundi(iso);
    return { debut: l, fin: ajouterJours(l, 6) };
  }
  const d = d0(iso);
  const debut = isoJour(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
  const fin = isoJour(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
  return { debut, fin };
}

/** Clé de période d'une date : « 2026-11-10 », lundi de la semaine, ou « 2026-11 » */
export const clePeriode = (iso: string, g: Granularite) => (g === 'jour' ? iso.slice(0, 10) : g === 'semaine' ? lundi(iso) : iso.slice(0, 7));

/** Période précédente / suivante */
export function decaler(iso: string, g: Granularite, n: number): string {
  if (g === 'jour') return ajouterJours(iso, n);
  if (g === 'semaine') return ajouterJours(iso, 7 * n);
  const d = d0(iso);
  return isoJour(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12)));
}

export function libellePeriode(iso: string, g: Granularite, long = false): string {
  const d = d0(iso);
  const jj = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (g === 'jour') return `${JOURS[d.getUTCDay()]} ${jj}/${mm}${long ? `/${d.getUTCFullYear()}` : ''}`;
  if (g === 'semaine') {
    const { debut, fin } = periode(iso, 'semaine');
    const f = d0(fin);
    const fj = `${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
    const dj = `${String(d0(debut).getUTCDate()).padStart(2, '0')}/${String(d0(debut).getUTCMonth() + 1).padStart(2, '0')}`;
    return long ? `semaine du ${dj} au ${fj}` : `sem. ${dj}`;
  }
  return `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Nombre de périodes montrées dans l'évolution */
export const NB_PERIODES: Record<Granularite, number> = { jour: 14, semaine: 8, mois: 6 };

/** Les N périodes qui finissent par celle de « iso » (la plus ancienne d'abord) */
export function periodesEvolution(iso: string, g: Granularite): string[] {
  const n = NB_PERIODES[g];
  return Array.from({ length: n }, (_, i) => clePeriode(decaler(periode(iso, g).debut, g, i - n + 1), g));
}

export interface Bilan {
  faites: number;
  dans: number; // faites dans le délai
  nonFaites: number;
  pointsFiches: number;
  penalites: number;
  pointsPenalites: number;
  points: number;
}
const vide = (): Bilan => ({ faites: 0, dans: 0, nonFaites: 0, pointsFiches: 0, penalites: 0, pointsPenalites: 0, points: 0 });

/** Bilan par équipe et par période : Map<équipe, Map<clé de période, Bilan>> */
export function bilans(ots: ProgrammeOT[], penalites: Pick<Penalite, 'equipe' | 'jour' | 'points'>[], g: Granularite, now = Date.now()) {
  const out = new Map<string, Map<string, Bilan>>();
  const cellule = (equipe: string, cle: string) => {
    let m = out.get(equipe);
    if (!m) out.set(equipe, (m = new Map()));
    let b = m.get(cle);
    if (!b) m.set(cle, (b = vide()));
    return b;
  };
  for (const o of ots) {
    if (o.statut === 'a_faire' || !o.traiteLe || !o.equipe) continue;
    const b = cellule(o.equipe, clePeriode(isoJour(new Date(o.traiteLe)), g));
    const d = delaiOT(o, now);
    if (o.statut === 'fait') {
      b.faites++;
      if (d.etat === 'dans') b.dans++;
    } else b.nonFaites++;
    b.pointsFiches += d.points;
    b.points += d.points;
  }
  for (const p of penalites) {
    if (!p.equipe) continue;
    const b = cellule(p.equipe, clePeriode(p.jour, g));
    b.penalites++;
    b.pointsPenalites += p.points;
    b.points += p.points;
  }
  return out;
}

export function somme(liste: (Bilan | undefined)[]): Bilan {
  const t = vide();
  for (const b of liste) {
    if (!b) continue;
    t.faites += b.faites;
    t.dans += b.dans;
    t.nonFaites += b.nonFaites;
    t.pointsFiches += b.pointsFiches;
    t.penalites += b.penalites;
    t.pointsPenalites += b.pointsPenalites;
    t.points += b.points;
  }
  return t;
}

/** Programme en cours d'une équipe (fiches ouvertes, maintenant) */
export function programmeOuvert(ots: ProgrammeOT[], now = Date.now()) {
  const out = new Map<string, { aFaire: number; enRetard: number; prioritaires: number; urgents: number; demain: number }>();
  const jour = isoJour(new Date(now));
  for (const o of ots) {
    if (o.statut !== 'a_faire' || !o.equipe) continue;
    let r = out.get(o.equipe);
    if (!r) out.set(o.equipe, (r = { aFaire: 0, enRetard: 0, prioritaires: 0, urgents: 0, demain: 0 }));
    // distribuée d'avance (le soir pour demain) : pas « à faire » aujourd'hui
    if (estPourPlusTard(o, jour)) {
      r.demain++;
      continue;
    }
    const d = delaiOT(o, now);
    r.aFaire++;
    if (d.etat === 'retard') r.enRetard++;
    if (d.prioritaire) r.prioritaires++;
    if (o.isUrgent) r.urgents++;
  }
  return out;
}

export interface StatEquipe {
  equipe: string;
  installations: number;
  installationsFaites: number;
  derangements: number;
  derangementsFaits: number;
  faites: number;
  nonFaites: number;
  dansDelai: number;
  horsDelai: number;
  enCours: number;
  points: number;
}

/**
 * Statistiques d'une période par équipe (export PDF du soir) : fiches clôturées entre debut et
 * fin (faites / non faites, dans le délai ou hors délai), par nature, et fiches encore ouvertes
 * si la période est en cours. Les points de chaque fiche suivent le barème (sans les pénalités).
 */
export function statsEquipes(ots: ProgrammeOT[], debut: string, fin: string, avecOuvertes: boolean, now = Date.now()): StatEquipe[] {
  const m = new Map<string, StatEquipe>();
  for (const o of ots) {
    if (!o.equipe) continue;
    const ouverte = o.statut === 'a_faire';
    const jourClos = o.traiteLe ? isoJour(new Date(o.traiteLe)) : '';
    if (ouverte ? !avecOuvertes || estPourPlusTard(o, fin) : jourClos < debut || jourClos > fin) continue;
    let s = m.get(o.equipe);
    if (!s)
      m.set(
        o.equipe,
        (s = { equipe: o.equipe, installations: 0, installationsFaites: 0, derangements: 0, derangementsFaits: 0, faites: 0, nonFaites: 0, dansDelai: 0, horsDelai: 0, enCours: 0, points: 0 }),
      );
    const der = o.nature === 'derangement';
    if (der) s.derangements++;
    else s.installations++;
    if (ouverte) {
      s.enCours++;
      continue;
    }
    const d = delaiOT(o, now);
    s.points += d.points;
    if (o.statut === 'fait') {
      s.faites++;
      if (der) s.derangementsFaits++;
      else s.installationsFaites++;
      if (d.etat === 'dans') s.dansDelai++;
      else s.horsDelai++;
    } else s.nonFaites++;
  }
  return [...m.values()].sort((a, b) => b.points - a.points || a.equipe.localeCompare(b.equipe));
}
