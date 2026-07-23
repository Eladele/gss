import * as XLSX from 'xlsx';
import type { Situation, Equipe, SituationNature } from '@/types';

export const INSTALL_DERANG_TYPES = ['CLS', 'CPL', 'RLR', 'CMI', 'TRL', 'CST'] as const;

// Seuils de délai réels (jours ouvrés), utilisés quand une situation n'a pas de
// "conformite" explicite (ex: créée manuellement) : DRG = 24h (1j), Installation = 48h (2j).
export const DELAI_THRESHOLD_DRG = 1;
export const DELAI_THRESHOLD_INSTALLATION = 2;
// Conservé pour compatibilité (ancien code qui référence encore ce nom)
export const DEFAULT_DELAI_THRESHOLD = DELAI_THRESHOLD_INSTALLATION;

function delaiThresholdFor(s: Situation): number {
  return s.type === 'DRG' ? DELAI_THRESHOLD_DRG : DELAI_THRESHOLD_INSTALLATION;
}

// ─── Jours fériés / fêtes (Mauritanie) ─────────────────────────────────────────
// Liste à tenir à jour chaque année (dates fixes + fêtes musulmanes, mobiles).
// Format "YYYY-MM-DD". Ajuste/complète ces dates selon le calendrier officiel.
export const PUBLIC_HOLIDAYS: string[] = [
  // 2026 — dates fixes
  '2026-01-01', // Nouvel An
  '2026-05-01', // Fête du Travail
  '2026-05-25', // Journée de l'Afrique
  '2026-11-28', // Fête de l'Indépendance
  // 2026 — fêtes musulmanes (mobiles, à confirmer/ajuster selon l'observation de la lune)
  '2026-03-20', // Aid al-Fitr (approx.)
  '2026-03-21', // Aid al-Fitr (2e jour)
  '2026-05-27', // Aid al-Adha (approx.)
  '2026-05-28', // Aid al-Adha (2e jour)
  '2026-06-16', // Nouvel An musulman (approx.)
  '2026-08-25', // Mawlid (approx.)
];
const HOLIDAY_SET = new Set(PUBLIC_HOLIDAYS);

function isNonOuvre(dateMs: number): boolean {
  const d = new Date(dateMs);
  if (d.getDay() === 0) return true; // dimanche
  const iso = d.toISOString().slice(0, 10);
  return HOLIDAY_SET.has(iso);
}

// Compte les jours ouvrés (hors dimanche et jours fériés) entre deux instants.
function workingDaysBetween(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  let count = 0;
  let cursor = startMs + 86400000; // on compte à partir du lendemain du départ
  while (cursor <= endMs) {
    if (!isNonOuvre(cursor)) count++;
    cursor += 86400000;
  }
  return count;
}

// Calcule le délai réel d'une situation (en jours ouvrés, hors dimanche/fériés) :
// dateDepo → date de mise à jour (updatedAt) si elle est traitée (OK / NON OK),
// sinon dateDepo → maintenant (délai toujours "en cours").
export function calcDelai(s: Situation): number {
  const startRaw = s.dateDepo || s.dateMessage;
  if (!startRaw) return s.delai ?? 0;
  const start = new Date(startRaw).getTime();
  if (Number.isNaN(start)) return s.delai ?? 0;
  const resolved = s.status === 'ok' || s.status === 'non_ok';
  const end = resolved && s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now();
  return workingDaysBetween(start, end);
}

export function isHorsDelai(s: Situation): boolean {
  if (s.conformite) return s.conformite === 'HorsDelais';
  return calcDelai(s) > delaiThresholdFor(s);
}

export function villeForEquipe(equipeName: string, equipes: Equipe[]): string {
  const eq = equipes.find((e) => e.name.toLowerCase() === equipeName?.toLowerCase());
  return eq?.ville ?? 'Nouakchott';
}

export interface PeriodFilter {
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
}

export function inPeriod(dateStr: string, period: PeriodFilter): boolean {
  if (!dateStr) return false;
  if (period.from && dateStr < period.from) return false;
  if (period.to && dateStr > period.to) return false;
  return true;
}

export interface EquipeStat {
  equipe: string;
  ville: string;
  total: number;
  dansDelai: number;
  horsDelai: number;
  pctConformite: number;
}

export function statsByEquipe(situations: Situation[], equipes: Equipe[], nature?: SituationNature): EquipeStat[] {
  const byEquipe: Record<string, Situation[]> = {};
  situations
    .filter((s) => !nature || (s.nature ?? 'installation') === nature)
    .forEach((s) => {
      const key = s.equipe || ' Non affectée';
      (byEquipe[key] ??= []).push(s);
    });
  return Object.entries(byEquipe)
    .map(([equipe, list]) => {
      const horsDelai = list.filter(isHorsDelai).length;
      const total = list.length;
      return {
        equipe,
        ville: villeForEquipe(equipe, equipes),
        total,
        dansDelai: total - horsDelai,
        horsDelai,
        pctConformite: total ? Math.round(((total - horsDelai) / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface VilleStat {
  ville: string;
  total: number;
  dansDelai: number;
  horsDelai: number;
  pctConformite: number;
}

export function statsByVille(situations: Situation[], equipes: Equipe[], nature?: SituationNature): VilleStat[] {
  const byVille: Record<string, Situation[]> = {};
  situations
    .filter((s) => !nature || (s.nature ?? 'installation') === nature)
    .forEach((s) => {
      const v = villeForEquipe(s.equipe, equipes);
      (byVille[v] ??= []).push(s);
    });
  return Object.entries(byVille)
    .map(([ville, list]) => {
      const horsDelai = list.filter(isHorsDelai).length;
      const total = list.length;
      return {
        ville,
        total,
        dansDelai: total - horsDelai,
        horsDelai,
        pctConformite: total ? Math.round(((total - horsDelai) / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface TypeStat {
  type: string;
  total: number;
  dansDelai: number;
  horsDelai: number;
  pctConformite: number;
}

// Ces types sont fonctionnellement équivalents pour les statistiques (toutes des
// clôtures d'installation) — on les regroupe en une seule ligne. DRG (et les
// autres types) restent séparés.
export const MERGED_TYPES = ['CPL', 'TRL', 'CMI', 'CLS', 'RLR', 'CST'];
export const MERGED_TYPE_LABEL = 'CPL/TRL/CMI/CLS/RLR/CST';

export function statsByType(situations: Situation[], nature?: SituationNature): TypeStat[] {
  const byType: Record<string, Situation[]> = {};
  situations
    .filter((s) => !nature || (s.nature ?? 'installation') === nature)
    .forEach((s) => {
      const key = MERGED_TYPES.includes(s.type) ? MERGED_TYPE_LABEL : s.type;
      (byType[key] ??= []).push(s);
    });
  return Object.entries(byType)
    .map(([type, list]) => {
      const horsDelai = list.filter(isHorsDelai).length;
      const total = list.length;
      return {
        type,
        total,
        dansDelai: total - horsDelai,
        horsDelai,
        pctConformite: total ? Math.round(((total - horsDelai) / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// Répétition de dérangement par client (FGP) sur la période — clients ayant eu
// plus d'une intervention "dérangement" (panne récurrente à surveiller).
export interface ClientRepeat {
  fgp: string;
  count: number;
  zone: string;
  equipe: string;
  motifs: string[];
}

export function repeatDerangementByClient(situations: Situation[]): ClientRepeat[] {
  const byFgp: Record<string, Situation[]> = {};
  situations
    .filter((s) => (s.nature ?? 'installation') === 'derangement')
    .forEach((s) => {
      (byFgp[s.fgp] ??= []).push(s);
    });
  return Object.entries(byFgp)
    .filter(([, list]) => list.length > 1)
    .map(([fgp, list]) => ({
      fgp,
      count: list.length,
      zone: list[0].zone,
      equipe: list[0].equipe,
      motifs: [...new Set(list.map((l) => l.motif).filter(Boolean))],
    }))
    .sort((a, b) => b.count - a.count);
}

export function exportStatsToExcel(opts: {
  fileName: string;
  byEquipe: EquipeStat[];
  byVille: VilleStat[];
  byType: TypeStat[];
  repeats: ClientRepeat[];
}) {
  const wb = XLSX.utils.book_new();

  const wsEquipe = XLSX.utils.json_to_sheet(
    opts.byEquipe.map((r) => ({
      Équipe: r.equipe,
      Ville: r.ville,
      Total: r.total,
      'Dans délai': r.dansDelai,
      'Hors délai': r.horsDelai,
      '% Conformité': r.pctConformite,
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsEquipe, 'Par équipe');

  const wsVille = XLSX.utils.json_to_sheet(
    opts.byVille.map((r) => ({
      Ville: r.ville,
      Total: r.total,
      'Dans délai': r.dansDelai,
      'Hors délai': r.horsDelai,
      '% Conformité': r.pctConformite,
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsVille, 'Par ville');

  const wsType = XLSX.utils.json_to_sheet(
    opts.byType.map((r) => ({
      Type: r.type,
      Total: r.total,
      'Dans délai': r.dansDelai,
      'Hors délai': r.horsDelai,
      '% Conformité': r.pctConformite,
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsType, 'Par type');

  const wsRepeat = XLSX.utils.json_to_sheet(
    opts.repeats.map((r) => ({
      FGP: r.fgp,
      'Nb interventions': r.count,
      Zone: r.zone,
      Équipe: r.equipe,
      Motifs: r.motifs.join(' | '),
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsRepeat, 'Dérangements répétés');

  XLSX.writeFile(wb, opts.fileName);
}