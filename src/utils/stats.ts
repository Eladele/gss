import * as XLSX from 'xlsx';
import type { Situation, Equipe, SituationNature } from '@/types';

export const INSTALL_DERANG_TYPES = ['CLS', 'CPL', 'RLR', 'CMI', 'TRL', 'CST'] as const;

// Seuil de délai (jours) utilisé quand une situation n'a pas de "conformite" explicite
// (ex: situations créées manuellement / urgences). Aligné sur le fichier GSS (délai cible ≈ 2j).
export const DEFAULT_DELAI_THRESHOLD = 2;

// Calcule le délai réel d'une situation : dateDepo → date de mise à jour (updatedAt)
// si elle est traitée (OK / NON OK), sinon dateDepo → maintenant (délai toujours "en cours").
// Remplace le délai statique importé pour un suivi automatique et à jour.
export function calcDelai(s: Situation): number {
  const startRaw = s.dateDepo || s.dateMessage;
  if (!startRaw) return s.delai ?? 0;
  const start = new Date(startRaw).getTime();
  if (Number.isNaN(start)) return s.delai ?? 0;
  const resolved = s.status === 'ok' || s.status === 'non_ok';
  const end = resolved && s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function isHorsDelai(s: Situation): boolean {
  if (s.conformite) return s.conformite === 'HorsDelais';
  return calcDelai(s) > DEFAULT_DELAI_THRESHOLD;
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
