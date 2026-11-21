// Outils partagés du tableau de bord (filtres, dates, ville d'une équipe)
import type { Equipe, Situation, SituationNature } from '@/types';
import { countPoteaux, inPeriod, MERGED_TYPES, type PeriodFilter } from '@/utils/stats';
import { delaiOT, doublonsCable } from '@/utils/points';

export type NatureFilter = 'all' | SituationNature;
export type PeriodPreset = 'tout' | 'jour' | 'date' | 'semaine' | 'mois' | 'custom';

export const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
// 2025 à l'année en cours + 1
export const ANNEES_SELECT = Array.from({ length: new Date().getFullYear() - 2025 + 2 }, (_, i) => 2025 + i);

export const VILLE_COLORS: Record<string, string> = {
  Nouakchott: '#1565C0',
  Kaédi: '#E9A93B',
  Rosso: '#2E7D32',
  Nouadhibou: '#00838F',
};

export const todayStr = () => new Date().toISOString().slice(0, 10);
export function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function presetToRange(preset: PeriodPreset): PeriodFilter {
  const now = new Date();
  if (preset === 'tout') return {};
  if (preset === 'jour') return { from: todayStr(), to: todayStr() };
  if (preset === 'semaine') {
    const day = (now.getDay() + 6) % 7; // lundi = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return { from: monday.toISOString().slice(0, 10), to: todayStr() };
  }
  if (preset === 'mois') return { from: firstOfMonthStr(), to: todayStr() };
  return {};
}

/** Installation = CPL/TRL/CMI/CLS/RLR/CST/ANS · Dérangement = DRG (par TYPE, plus fiable que « nature ») */
export function matchesNature(s: { type: string }, nature: NatureFilter): boolean {
  if (nature === 'all') return true;
  if (nature === 'derangement') return s.type === 'DRG';
  return MERGED_TYPES.includes(s.type);
}

/** Date de référence d'une situation : mise en service, sinon message, sinon dépôt */
export const dateRef = (s: Situation) => s.dateClt || s.dateMessage || s.dateDepo || '';

/**
 * Classement des équipes (PDF) : à quelle période appartient une fiche ?
 *   • faite : sa date de mise en service (= jour de la clôture), comme avant ;
 *   • non faite : le jour où elle a été rendue « non faite » (traite_le), à défaut sa date de référence ;
 *   • encore ouverte (en cours / en retard) : comptée si la période contient aujourd'hui
 *     (c'est l'état actuel), sinon d'après sa date de référence.
 * Avant, les fiches non faites et ouvertes étaient datées par leur « OT reçu le » (date du message) :
 * reçues avant le début de la période (ou un autre jour que « aujourd'hui »), elles sortaient du
 * classement, d'où des colonnes « Non faites » et « En cours » toujours à 0.
 */
export function dansPeriodeClassement(s: Situation, period: PeriodFilter): boolean {
  if (s.status === 'ok') return inPeriod(dateRef(s), period);
  if (s.status === 'non_ok') return inPeriod((s.traiteLe ?? '').slice(0, 10) || dateRef(s), period);
  return inPeriod(todayStr(), period) || inPeriod(dateRef(s), period);
}

/**
 * Poteaux posés d'une situation :
 *   • fiche OK : colonne poteau, sinon nombre lu dans le motif (« +2 poteaux ») ;
 *   • fiche NON OK dont le motif contient « besoin poteau » (« Besoin poteau », « Besoin 2 poteaux »,
 *     « besoin de poteau … ») : colonne poteau, sinon le nombre écrit (1 par défaut).
 * Le tableau de bord les date par leur mise à jour (updated_at) : voir poteauxDansPeriode.
 */
const BESOIN_POTEAU = /besoin\s+(?:de\s+|d'un\s+)?(?:\d+\s*)?poteaux?/i;
export const poteauxDe = (s: Situation) => {
  if (s.status === 'ok') return s.poteau && s.poteau > 0 ? s.poteau : countPoteaux(s.motif);
  if (s.status !== 'non_ok') return 0;
  const texte = [s.motifCloture, s.comment, s.motif].filter(Boolean).join(' · ');
  if (!BESOIN_POTEAU.test(texte)) return 0;
  return s.poteau && s.poteau > 0 ? s.poteau : countPoteaux(BESOIN_POTEAU.exec(texte)![0]) || 1;
};
/** Situations dont les poteaux comptent dans la période : date de mise à jour (updated_at) */
export const poteauxDansPeriode = (liste: Situation[], period: PeriodFilter, nature: NatureFilter) =>
  liste.filter((s) => matchesNature(s, nature) && inPeriod((s.updatedAt ?? '').slice(0, 10), period));

// ─── Programme d'un jour (tableau de bord, « Choisir une date ») ──────────────
/** Fiche du programme de ce jour : distribuée (n° d'OT) avec ce jour comme date de programme */
export const estDuProgramme = (s: Situation, jour: string) => !!s.numeroOt && (s.dateProgramme ?? '').slice(0, 10) === jour;

const statutDe = (s: Situation) => (s.status === 'ok' ? 'fait' : s.status === 'non_ok' ? 'non_fait' : 'a_faire');

export interface LigneProgramme {
  equipe: string;
  total: number;
  faites: number;
  nonFaites: number;
  enCours: number;
  enRetard: number;
  points: number;
}

/** Bilan du programme par équipe : faites, non faites, en cours (dont en retard), points du barème */
export function bilanProgramme(liste: Situation[], now = Date.now()): { lignes: LigneProgramme[]; total: LigneProgramme } {
  const doublons = doublonsCable(
    liste.map((s) => ({ id: s.id, equipe: s.equipe, zone: s.zone, motif: s.motifCloture, statut: statutDe(s), traiteLe: s.traiteLe ?? s.updatedAt ?? null })),
  );
  const vide = (equipe: string): LigneProgramme => ({ equipe, total: 0, faites: 0, nonFaites: 0, enCours: 0, enRetard: 0, points: 0 });
  const m = new Map<string, LigneProgramme>();
  const total = vide('Total');
  for (const s of liste) {
    const statut = statutDe(s);
    const d = delaiOT(
      {
        nature: s.type === 'DRG' ? 'derangement' : 'installation',
        statut,
        dateRecu: s.dateRecu ?? null,
        dateProgramme: s.dateProgramme || s.dateRecu || s.dateMessage || s.dateDepo || '',
        traiteLe: s.traiteLe ?? s.updatedAt ?? null,
        assigneLe: s.assigneLe ?? null,
        motif: s.motifCloture,
        echeanceEquipe: s.echeanceEquipe ?? null,
        prioritaire: s.prioritaire,
        poteaux: s.poteau ?? 0,
        doublonCable: doublons.has(s.id),
      },
      now,
    );
    const eq = s.equipe || 'Sans équipe';
    const r = m.get(eq) ?? vide(eq);
    for (const x of [r, total]) {
      x.total++;
      x.points += d.points;
      if (statut === 'fait') x.faites++;
      else if (statut === 'non_fait') x.nonFaites++;
      else {
        x.enCours++;
        if (d.etat === 'retard') x.enRetard++;
      }
    }
    m.set(eq, r);
  }
  const lignes = [...m.values()].sort((a, b) => b.points - a.points || b.faites - a.faites || a.equipe.localeCompare(b.equipe));
  return { lignes, total };
}

/** Ville de chaque équipe (nom en minuscules → ville), calculée une fois */
export function villesDesEquipes(equipes: Equipe[]) {
  const m = new Map<string, string>();
  equipes.forEach((e) => m.set(e.name.toLowerCase(), e.ville ?? 'Nouakchott'));
  return (equipe?: string) => m.get((equipe ?? '').toLowerCase()) ?? 'Nouakchott';
}
