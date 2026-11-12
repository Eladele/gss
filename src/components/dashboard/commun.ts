// Outils partagés du tableau de bord (filtres, dates, ville d'une équipe)
import type { Equipe, Situation, SituationNature } from '@/types';
import { countPoteaux, MERGED_TYPES, type PeriodFilter } from '@/utils/stats';

export type NatureFilter = 'all' | SituationNature;
export type PeriodPreset = 'tout' | 'jour' | 'semaine' | 'mois' | 'custom';

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

/** Poteaux d'une situation : colonne dédiée, sinon extraits du motif de l'OT */
export const poteauxDe = (s: Situation) => (s.poteau && s.poteau > 0 ? s.poteau : countPoteaux(s.motif));

/** Ville de chaque équipe (nom en minuscules → ville), calculée une fois */
export function villesDesEquipes(equipes: Equipe[]) {
  const m = new Map<string, string>();
  equipes.forEach((e) => m.set(e.name.toLowerCase(), e.ville ?? 'Nouakchott'));
  return (equipe?: string) => m.get((equipe ?? '').toLowerCase()) ?? 'Nouakchott';
}
