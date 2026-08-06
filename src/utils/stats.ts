import ExcelJS from 'exceljs';
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

  // 2027 — dates fixes
  '2027-01-01',
  '2027-05-01',
  '2027-05-25',
  '2027-11-28',
  // 2027 — fêtes musulmanes (sources concordantes, encore approx. — observation de la lune)
  '2027-03-10', // Aid al-Fitr
  '2027-03-11', // Aid al-Fitr (2e jour)
  '2027-05-17', // Aid al-Adha
  '2027-05-18', // Aid al-Adha (2e jour)
  '2027-06-06', // Nouvel An musulman
  '2027-08-15', // Mawlid

  // 2028 — dates fixes
  '2028-01-01',
  '2028-05-01',
  '2028-05-25',
  '2028-11-28',
  // 2028 — fêtes musulmanes (approx.)
  '2028-02-27', // Aid al-Fitr
  '2028-02-28', // Aid al-Fitr (2e jour)
  '2028-05-05', // Aid al-Adha
  '2028-05-06', // Aid al-Adha (2e jour)
  '2028-05-25', // Nouvel An musulman (tombe le même jour que la Journée de l'Afrique en 2028)
  '2028-08-03', // Mawlid

  // 2029 — dates fixes
  '2029-01-01',
  '2029-05-01',
  '2029-05-25',
  '2029-11-28',
  // 2029 — fêtes musulmanes (approx., extrapolées — écart d'environ 11j/an à confirmer)
  '2029-02-15', // Aid al-Fitr
  '2029-02-16', // Aid al-Fitr (2e jour)
  '2029-04-24', // Aid al-Adha
  '2029-04-25', // Aid al-Adha (2e jour)
  '2029-05-14', // Nouvel An musulman (approx.)
  '2029-07-23', // Mawlid (approx.)

  // 2030 — dates fixes
  '2030-01-01',
  '2030-05-01',
  '2030-05-25',
  '2030-11-28',
  // 2030 — fêtes musulmanes : PUREMENT EXTRAPOLÉES (aucune source officielle publiée
  // aussi loin) — à vérifier/corriger dès que le calendrier officiel 2030 sort.
  '2030-02-04', // Aid al-Fitr (approx.)
  '2030-02-05', // Aid al-Fitr (2e jour)
  '2030-04-13', // Aid al-Adha (approx.)
  '2030-04-14', // Aid al-Adha (2e jour)
  '2030-05-03', // Nouvel An musulman (approx.)
  '2030-07-12', // Mawlid (approx.)
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
// dateDepo (ou dateMessage à défaut) → fin, où la fin est déterminée dans cet ordre
// de priorité :
//   1. dateClt ("Date Mise en Service") si elle est renseignée — c'est la vraie
//      date terrain, la plus fidèle à la réalité, indépendamment du moment où
//      quelqu'un a cliqué "OK" dans l'app.
//   2. sinon, updatedAt si la situation est traitée (OK / NON OK) — date de
//      clôture dans l'app, utilisée seulement quand aucune date terrain n'existe.
//   3. sinon, maintenant (délai toujours "en cours").
export function calcDelai(s: Situation): number {
  const startRaw = s.dateDepo || s.dateMessage;
  if (!startRaw) return s.delai ?? 0;
  const start = new Date(startRaw).getTime();
  if (Number.isNaN(start)) return s.delai ?? 0;
  const resolved = s.status === 'ok' || s.status === 'non_ok';
  const cltMs = s.dateClt ? new Date(s.dateClt).getTime() : NaN;
  const end = !Number.isNaN(cltMs)
    ? cltMs
    : resolved && s.updatedAt
      ? new Date(s.updatedAt).getTime()
      : Date.now();
  return workingDaysBetween(start, end);
}

// Extrait le nombre de poteaux posés depuis le texte libre du motif (ex: "+1poteau",
// "+2POTEAU et+350m", "demande 1poteau"). Additionne toutes les occurrences trouvées ;
// si le mot "poteau" apparaît sans nombre explicite, compte 1 par défaut.
export function countPoteaux(motif?: string): number {
  if (!motif) return 0;
  const text = motif.toLowerCase();
  const regex = /(\d+)\s*poteaux?/g;
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    total += parseInt(match[1], 10);
    found = true;
  }
  if (!found && /poteaux?/.test(text)) total = 1;
  return total;
}

export function isHorsDelai(s: Situation): boolean {
  // Basé sur le calcul en direct (jours ouvrés, dimanche/fériés exclus) — identique à ce
  // qu'affiche la page Situations — plutôt que sur la valeur brute importée du fichier.
  // S'applique automatiquement à toutes les données, y compris déjà importées, puisque
  // c'est un calcul en direct à partir des dates, pas une valeur figée.
  // NON OK = issue documentée (motif/comment), pas un "retard" — jamais compté comme
  // hors délai (ni comme dans délai — voir les fonctions statsByX qui l'excluent
  // aussi du total ; ici on ne fait qu'éviter de le compter comme non-conforme).
  if (s.status === 'non_ok') return false;
  return calcDelai(s) > delaiThresholdFor(s);
}

// ─── Classification fine à 3 tranches (Moins24H / Dans délai / Hors délai) ─────
// Utilisée pour les rapports "% dans les délais" par ville/type (façon Huawei/
// Mauritel) : distingue les situations réglées "très vite" (même jour ouvré,
// calcDelai===0) de celles simplement "dans les délais" (au-delà mais sous le
// seuil). Pour DRG (seuil déjà à 24h/1j), il n'y a pas de place pour une tranche
// "Moins24H" distincte de "Dans délai" — le rapport DRG reste donc binaire
// (voir statsByVille, inchangé) ; cette fonction sert aux types Installation/CST.
export type DelaiBucket = 'moins24h' | 'dans' | 'hors';

export function delaiBucket(s: Situation): DelaiBucket {
  const d = calcDelai(s);
  const threshold = delaiThresholdFor(s);
  if (d > threshold) return 'hors';
  if (s.type !== 'DRG' && d === 0) return 'moins24h';
  return 'dans';
}

export interface VilleTypeDelaiRow {
  ville: string;
  type: string; // 'TOTAL' ou code de type (CLS, RLR, TRL, CMI, CST...)
  total: number;
  moins24h: number;
  dansDelai: number;
  horsDelai: number;
  pctDansDelai: number; // (moins24h + dansDelai) / total * 100 — "% TLID"
}

// Détail par ville, avec une ligne TOTAL et — si plusieurs types sont présents
// dans cette ville — une ligne par type (CLS, RLR, TRL, CMI...). Pour un rapport
// mono-type (ex: CST seul), il n'y a que la ligne TOTAL par ville, comme sur le
// modèle de référence.
export function statsDelaiDetailleParVilleEtType(situations: Situation[], equipes: Equipe[], typesInclus: string[]): VilleTypeDelaiRow[] {
  const filtered = situations.filter((s) => typesInclus.includes(s.type) && s.status !== 'non_ok');
  const byVille: Record<string, Situation[]> = {};
  filtered.forEach((s) => {
    const v = villeForEquipe(s.equipe, equipes);
    (byVille[v] ??= []).push(s);
  });

  const buildRow = (ville: string, type: string, items: Situation[]): VilleTypeDelaiRow => {
    let moins24h = 0,
      dans = 0,
      hors = 0;
    items.forEach((s) => {
      const b = delaiBucket(s);
      if (b === 'moins24h') moins24h++;
      else if (b === 'dans') dans++;
      else hors++;
    });
    const total = items.length;
    return {
      ville,
      type,
      total,
      moins24h,
      dansDelai: dans,
      horsDelai: hors,
      pctDansDelai: total ? Math.round(((moins24h + dans) / total) * 1000) / 10 : 0,
    };
  };

  const rows: VilleTypeDelaiRow[] = [];
  Object.entries(byVille).forEach(([ville, list]) => {
    rows.push(buildRow(ville, 'TOTAL', list));
    const byType: Record<string, Situation[]> = {};
    list.forEach((s) => (byType[s.type] ??= []).push(s));
    if (Object.keys(byType).length > 1) {
      Object.entries(byType)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([type, items]) => rows.push(buildRow(ville, type, items)));
    }
  });
  return rows.sort((a, b) => a.ville.localeCompare(b.ville) || (a.type === 'TOTAL' ? -1 : b.type === 'TOTAL' ? 1 : a.type.localeCompare(b.type)));
}

// ─── Backlog du jour, par ancienneté (façon "MES du J" / "DRG Relevés du J") ───
// Interprétation retenue (à ajuster si besoin) :
//  - "Résolu aujourd'hui"  = situations déjà traitées (OK/NON OK) dont la date de
//     traitement (updatedAt) tombe le jour de référence.
//  - "Moins2J / Moins7J / Plus7J" = situations ENCORE en attente (pending/in_progress),
//     réparties par ancienneté réelle (calcDelai) : <2j / 2 à 7j / >7j.
//  - "Somme instance" = total encore en attente (somme des 3 tranches ci-dessus).
//  - "Somme totale" ("Somme MI" / "Somme DR" sur le modèle) = Résolu aujourd'hui + Somme instance.
//  - "% réalisation" = Résolu aujourd'hui / Somme totale.
export interface BacklogRow {
  nature: 'installation' | 'DRG';
  resoluAujourdhui: number;
  moins2j: number;
  moins7j: number;
  plus7j: number;
  sommeInstance: number;
  sommeTotal: number;
  pctRealisation: number;
}

export function statsBacklogParAnciennete(situations: Situation[], dateRef?: string): BacklogRow[] {
  const ref = dateRef ?? new Date().toISOString().slice(0, 10);

  const buildRow = (nature: 'installation' | 'DRG', list: Situation[]): BacklogRow => {
    const resoluAujourdhui = list.filter((s) => {
      const resolved = s.status === 'ok' || s.status === 'non_ok';
      return resolved && (s.updatedAt || '').slice(0, 10) === ref;
    }).length;

    const pending = list.filter((s) => s.status === 'pending' || s.status === 'in_progress');
    let moins2j = 0,
      moins7j = 0,
      plus7j = 0;
    pending.forEach((s) => {
      const d = calcDelai(s);
      if (d < 2) moins2j++;
      else if (d <= 7) moins7j++;
      else plus7j++;
    });
    const sommeInstance = moins2j + moins7j + plus7j;
    const sommeTotal = resoluAujourdhui + sommeInstance;
    return {
      nature,
      resoluAujourdhui,
      moins2j,
      moins7j,
      plus7j,
      sommeInstance,
      sommeTotal,
      pctRealisation: sommeTotal ? Math.round((resoluAujourdhui / sommeTotal) * 1000) / 10 : 0,
    };
  };

  const installList = situations.filter((s) => MERGED_TYPES.includes(s.type));
  const drgList = situations.filter((s) => s.type === 'DRG');
  return [buildRow('installation', installList), buildRow('DRG', drgList)];
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

// ─── NON OK : motivé (avec commentaire de justification) vs sans motif ──────
// Les NON OK sont exclus des stats de délai (statsByVille/statsByType/statsBy
// Equipe/statsDelaiDetailleParVilleEtType, voir plus haut) car ce n'est pas un
// "retard" mais une issue documentée. On les compte ici séparément, pour
// distinguer ceux qui ont bien un commentaire de justification ("motivé") de
// ceux qui n'en ont pas ("sans motif" — à relancer/compléter).
export interface NonOkRow {
  ville: string;
  total: number;
  motive: number;
  sansMotif: number;
  pctMotive: number;
}

export function statsNonOk(situations: Situation[], equipes: Equipe[], nature?: SituationNature): NonOkRow[] {
  const byVille: Record<string, Situation[]> = {};
  situations
    .filter((s) => !nature || (s.nature ?? 'installation') === nature)
    .filter((s) => s.status === 'non_ok')
    .forEach((s) => {
      const v = villeForEquipe(s.equipe, equipes);
      (byVille[v] ??= []).push(s);
    });

  return Object.entries(byVille)
    .map(([ville, list]) => {
      const motive = list.filter((s) => !!s.comment?.trim()).length;
      const total = list.length;
      return {
        ville,
        total,
        motive,
        sansMotif: total - motive,
        pctMotive: total ? Math.round((motive / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function statsByEquipe(situations: Situation[], equipes: Equipe[], nature?: SituationNature): EquipeStat[] {
  const byEquipe: Record<string, Situation[]> = {};
  situations
    .filter((s) => !nature || (s.nature ?? 'installation') === nature)
    // NON OK = issue documentée (motif/comment), pas un cas de "retard" — exclu du
    // calcul de conformité délai (ni compliant ni non-compliant, catégorie à part,
    // voir statsNonOk).
    .filter((s) => s.status !== 'non_ok')
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
    .filter((s) => s.status !== 'non_ok') // voir commentaire dans statsByEquipe
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
export const MERGED_TYPES = ['CPL', 'TRL', 'CMI', 'CLS', 'RLR', 'CST', 'ANS'];
export const MERGED_TYPE_LABEL = 'CPL/TRL/CMI/CLS/RLR/CST/ANS';

export function statsByType(situations: Situation[], nature?: SituationNature): TypeStat[] {
  const byType: Record<string, Situation[]> = {};
  situations
    .filter((s) => !nature || (s.nature ?? 'installation') === nature)
    .filter((s) => s.status !== 'non_ok') // voir commentaire dans statsByEquipe
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
    .filter((s) => s.type === 'DRG')
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

// Ajoute une feuille à partir d'un tableau d'objets (équivalent de
// XLSX.utils.json_to_sheet) — les clés du 1er objet deviennent l'en-tête.
export function addSheetFromObjects(workbook: ExcelJS.Workbook, name: string, rows: Record<string, unknown>[]) {
  const ws = workbook.addWorksheet(name.slice(0, 31));
  if (rows.length === 0) return ws;
  const headers = Object.keys(rows[0]);
  ws.addRow(headers).font = { bold: true };
  rows.forEach((r) => ws.addRow(headers.map((h) => r[h] ?? '')));
  ws.columns.forEach((col) => {
    col.width = 18;
  });
  return ws;
}

export function downloadWorkbookBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportStatsToExcel(opts: {
  fileName: string;
  byEquipe: EquipeStat[];
  byVille: VilleStat[];
  byType: TypeStat[];
  repeats: ClientRepeat[];
  situations?: Situation[];
}) {
  const workbook = new ExcelJS.Workbook();

  addSheetFromObjects(
    workbook,
    'Par équipe',
    opts.byEquipe.map((r) => ({
      Équipe: r.equipe,
      Ville: r.ville,
      Total: r.total,
      'Dans délai': r.dansDelai,
      'Hors délai': r.horsDelai,
      '% Conformité': r.pctConformite,
    })),
  );

  addSheetFromObjects(
    workbook,
    'Par ville',
    opts.byVille.map((r) => ({
      Ville: r.ville,
      Total: r.total,
      'Dans délai': r.dansDelai,
      'Hors délai': r.horsDelai,
      '% Conformité': r.pctConformite,
    })),
  );

  addSheetFromObjects(
    workbook,
    'Par type',
    opts.byType.map((r) => ({
      Type: r.type,
      Total: r.total,
      'Dans délai': r.dansDelai,
      'Hors délai': r.horsDelai,
      '% Conformité': r.pctConformite,
    })),
  );

  // Liste détaillée des FGP concernés — mêmes colonnes que le fichier d'import original
  if (opts.situations) {
    addSheetFromObjects(
      workbook,
      'Détail FGP',
      opts.situations.map((s) => ({
        'DETE MESSAGE': s.dateMessage || '',
        TYPE: s.type,
        FGP: s.fgp,
        'Service Destination': s.serviceDestination || '',
        ZONE: s.zone,
        'DETE DEPOT': s.dateDepo || '',
        'DATE MISE EN SERVICE': s.dateClt || '',
        Actions: s.status === 'ok' ? 'ok' : s.status === 'non_ok' ? 'no ok' : s.status,
        status: s.status === 'ok' ? 'ok' : s.status === 'non_ok' ? 'no ok' : s.status,
        motif: s.motif || 'sans motif',
        équipe: s.equipe,
        NbreJourDélaisInst: s.delai,
        ConformitéDélais: s.conformite === 'HorsDelais' ? 'HorsDélais' : s.conformite === 'TLID' ? 'TLID' : '',
      })),
    );
  }

  addSheetFromObjects(
    workbook,
    'Dérangements répétés',
    opts.repeats.map((r) => ({
      FGP: r.fgp,
      'Nb interventions': r.count,
      Zone: r.zone,
      Équipe: r.equipe,
      Motifs: r.motifs.join(' | '),
    })),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  downloadWorkbookBuffer(buffer as ArrayBuffer, opts.fileName);
}