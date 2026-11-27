import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ExcelJS from 'exceljs';
import { useAppStore } from '@/store/useAppStore';
import { usePerimetre } from '@/hooks/usePerimetre';
import { Card, CardHeader, CardTitle, Button, Select, StatCard, EmptyState, useToast, BtnDelete, Modal, Input } from '@/components/ui';
import { fetchClientsParFgp, type ClientLigne } from '@/lib/supabaseService';
import { fmtTel } from '@/utils/programme';
import { TrendArea } from '@/components/charts';
import { addSheetFromObjects, downloadWorkbookBuffer } from '@/utils/stats';
import type { ScanRecord } from '@/types';
import { RapportScanProgramme } from '@/components/programme/RapportScanProgramme';
import { AffecterUrgentModal, type PrefillUrgent } from '@/components/programme/AffecterUrgentModal';
import { rechercherFichesProgramme } from '@/lib/programmeService';
import { ZONE_EQUIPE_MAP } from '@/data';
import { ArrowDown, ArrowUp, Columns3, Flame, Search, X } from 'lucide-react';

// Trois intervalles de signal (Rx Optical Power, dBm) :
//  Excellent : -10 à -22   ·  Moyen : -22,1 à -25   ·  Dégradé : -25 à -35 (et au-delà)
type SignalLevel = 'excellent' | 'moyen' | 'degrade' | 'absent';

function signalLevel(rx: number | null | undefined): SignalLevel {
  if (rx === null || rx === undefined) return 'absent';
  if (rx >= -22) return 'excellent';
  if (rx >= -25) return 'moyen';
  return 'degrade';
}
const SIGNAL_LABELS: Record<SignalLevel, string> = {
  excellent: 'Excellent (-10 à -22 dBm)',
  moyen: 'Moyen (-22,1 à -25 dBm)',
  degrade: 'Dégradé (-25 à -35 dBm)',
  absent: 'Sans mesure',
};
const SIGNAL_STYLES: Record<SignalLevel, string> = {
  excellent: 'bg-green-100 text-green-700',
  moyen: 'bg-amber-100 text-amber-700',
  degrade: 'bg-red-100 text-red-700',
  absent: 'bg-slate-100 text-slate-500',
};

function isResilie(s: { remarque?: string }): boolean {
  return /r[ée]sili/i.test(s.remarque || '');
}
function isSuspendu(s: { remarque?: string }): boolean {
  return /suspendu/i.test(s.remarque || '');
}

// ─── Colonnes du tableau des scans (choix et ordre gardés dans le navigateur) ───
type ColId = 'zone' | 'result' | 'fgp' | 'compte' | 'client' | 'contacts' | 'sn' | 'rx' | 'niveau' | 'distance' | 'scanTime' | 'nms' | 'remarque';

interface ColonneScan {
  id: ColId;
  label: string;
  center?: boolean;
  /** visible par défaut */
  defaut: boolean;
  cell: (s: ScanRecord, c?: ClientLigne) => ReactNode;
  excel: (s: ScanRecord, c?: ClientLigne) => string | number;
}

const niveauTexte = (s: ScanRecord) => {
  const l = signalLevel(s.rxPower);
  return l === 'absent' ? '' : SIGNAL_LABELS[l].split(' (')[0];
};

const COLONNES: ColonneScan[] = [
  {
    id: 'zone',
    label: 'Zone',
    defaut: true,
    cell: (s) => (
      <>
        {s.zone}
        {s.changeType === 'new' && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">nouveau</span>
        )}
      </>
    ),
    excel: (s) => s.zone,
  },
  {
    id: 'result',
    label: 'Résultat',
    defaut: true,
    cell: (s) => (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.result === 'SCANNE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {s.result}
      </span>
    ),
    excel: (s) => s.result,
  },
  {
    id: 'fgp',
    label: 'FGP',
    defaut: true,
    cell: (s) => <span className="text-xs text-slate-600 font-medium">{s.onuName || s.onuId || '—'}</span>,
    excel: (s) => s.onuName || s.onuId || '',
  },
  {
    id: 'compte',
    label: 'Compte client',
    defaut: true,
    cell: (_s, c) => <span className="text-xs text-slate-600 font-mono">{c?.clientCode || '—'}</span>,
    excel: (_s, c) => c?.clientCode || '',
  },
  {
    id: 'client',
    label: 'Client',
    defaut: false,
    cell: (_s, c) => <span className="text-xs text-slate-700">{c?.clientNom || '—'}</span>,
    excel: (_s, c) => c?.clientNom || '',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    defaut: false,
    cell: (_s, c) => <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">{c?.telephones.map(fmtTel).join(' / ') || '—'}</span>,
    excel: (_s, c) => c?.telephones.join(' / ') || '',
  },
  {
    id: 'sn',
    label: 'SN/MAC',
    defaut: true,
    cell: (s) => <span className="text-xs font-mono text-slate-500">{s.snMac || '—'}</span>,
    excel: (s) => s.snMac || '',
  },
  {
    id: 'rx',
    label: 'Rx (dBm)',
    center: true,
    defaut: true,
    cell: (s) => (
      <span className={`font-semibold ${signalLevel(s.rxPower) === 'degrade' ? 'text-red-600' : 'text-slate-600'}`}>{s.rxPower ?? '—'}</span>
    ),
    excel: (s) => s.rxPower ?? '',
  },
  {
    id: 'niveau',
    label: 'Niveau',
    defaut: true,
    cell: (s) => (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${SIGNAL_STYLES[signalLevel(s.rxPower)]}`}>{niveauTexte(s) || '—'}</span>
    ),
    excel: niveauTexte,
  },
  {
    id: 'distance',
    label: 'Distance (m)',
    center: true,
    defaut: true,
    cell: (s) => <span className="text-slate-500">{s.ranging ?? '—'}</span>,
    excel: (s) => s.ranging ?? '',
  },
  {
    id: 'scanTime',
    label: 'Scan time',
    defaut: true,
    cell: (s) => <span className="text-xs text-slate-500">{formatScanDate(s.scanTime)}</span>,
    excel: (s) => formatScanDate(s.scanTime),
  },
  {
    id: 'nms',
    label: 'Ajouté au NMS',
    defaut: true,
    cell: (s) => <span className="text-xs text-slate-500">{formatScanDate(s.timeAddedToNms)}</span>,
    excel: (s) => formatScanDate(s.timeAddedToNms),
  },
  {
    id: 'remarque',
    label: 'Remarque',
    defaut: true,
    cell: (s) => <span className="text-xs text-slate-400">{s.remarque || '—'}</span>,
    excel: (s) => s.remarque || '',
  },
];

interface ConfigColonnes {
  ordre: ColId[];
  masquees: ColId[];
}
const CLE_COLONNES = 'gss.scans.colonnes.v1';
const CONFIG_DEFAUT: ConfigColonnes = {
  ordre: COLONNES.map((c) => c.id),
  masquees: COLONNES.filter((c) => !c.defaut).map((c) => c.id),
};
/** choix enregistré (navigateur) ; une colonne ajoutée plus tard est mise à la fin */
function lireConfigColonnes(): ConfigColonnes {
  try {
    const brut = localStorage.getItem(CLE_COLONNES);
    if (!brut) return CONFIG_DEFAUT;
    const c = JSON.parse(brut) as Partial<ConfigColonnes>;
    const connues = new Set<ColId>(COLONNES.map((x) => x.id));
    const ordre = (c.ordre ?? []).filter((id): id is ColId => connues.has(id as ColId));
    COLONNES.forEach((x) => !ordre.includes(x.id) && ordre.push(x.id));
    const masquees = (c.masquees ?? []).filter((id): id is ColId => connues.has(id as ColId));
    return { ordre, masquees };
  } catch {
    return CONFIG_DEFAUT;
  }
}

/** Motif du cas urgent déduit des données du scan (résultat, signal, remarque) */
function motifDepuisScan(s: ScanRecord): string {
  const parts: string[] = [];
  const level = signalLevel(s.rxPower);
  if (s.result !== 'SCANNE') parts.push(`ONT non scanné${s.scanTime ? ` (dernier scan ${formatScanDate(s.scanTime)})` : ''}`);
  if (level === 'degrade') parts.push(`signal dégradé (Rx ${s.rxPower} dBm)`);
  else if (level === 'moyen') parts.push(`signal moyen (Rx ${s.rxPower} dBm)`);
  if (s.remarque) parts.push(s.remarque);
  const texte = parts.join(' · ') || 'Contrôle du scan réseau';
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function formatScanDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

interface ImportDiff {
  nouveaux: number;
  nouveauxScanne: number;
  nouveauxNonScanne: number;
  disparus: number;
  passesNonScanne: number;
  passesScanne: number;
  signalDegrade: number;
  signalAmeliore: number;
}

// Lit un fichier .xlsx de scan et renvoie les lignes normalisées (réutilisé par
// l'import principal ET l'outil "Comparer deux fichiers").
async function parseScanExcelFile(file: File): Promise<Partial<ScanRecord>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  // Reconstruit un tableau 2D [ligne][colonne] équivalent à
  // XLSX.utils.sheet_to_json(ws, { header: 1 }).
  const data: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[]; // 1-indexé par ExcelJS
    data.push(values.slice(1));
  });
  if (data.length < 2) {
    throw new Error('Fichier vide ou invalide');
  }

  const header = data[0].map((h: unknown) =>
    String(h ?? '')
      .trim()
      .toUpperCase(),
  );
  const col = (keywords: string[]) => header.findIndex((h) => keywords.some((k) => h.includes(k)));
  // Colonne exacte uniquement (évite qu'un en-tête "SCAN" fasse aussi matcher
  // "DATE SCAN" / "SCAN TIME" via un simple .includes()).
  const colExact = (name: string) => header.findIndex((h) => h === name);
  const cZone = col(['ZONE']);
  const cStt = col(['STT']);
  // Formats connus pour la colonne résultat : "RESULT"/"RESULTA" (contient le mot),
  // ou un en-tête exactement "SCAN" / "SCANNE" / "SCANNÉ" / "STATUT" (exports GSS).
  const cResult = [colExact('SCAN'), colExact('SCANNE'), colExact('SCANNÉ'), col(['RESULT']), colExact('STATUT'), col(['STATUT SCAN', 'ETAT SCAN'])].find((i) => i >= 0) ?? -1;
  const cScanTime = col(['SCAN TIME', 'DATE SCAN']);
  const cPort = col(['PORT ID']);
  const cOnuId = col(['ONU ID']);
  // "ONU Name" contient le FGP ; certains exports ont directement une colonne "FGP"
  const cOnuName = col(['ONU NAME']) >= 0 ? col(['ONU NAME']) : colExact('FGP');
  const cSw = col(['SOFTWARE VERSION']);
  const cSn = col(['SN/MAC', 'SN MAC']);
  const cAdded = col(['TIME ADDED']);
  const cRx = col(['RX OPTICAL', 'RX POWER']);
  const cRanging = col(['RANGING']);
  const cRemarque = col(['REMARQUE', 'ETAT', 'COMMENTAIRE']);

  const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : undefined);
  const toNum = (v: unknown) => (v === null || v === undefined || v === '' || v === '--' ? null : isNaN(Number(v)) ? null : Number(v));

  const rows: Partial<ScanRecord>[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((c) => c === null || c === undefined || c === '')) continue;
    rows.push({
      zone: cZone >= 0 ? String(row[cZone] ?? '').trim() : '',
      stt: cStt >= 0 ? String(row[cStt] ?? '').trim() : '',
      result:
        // Accepte "SCANNE" (format 1) et "SCAN" (format 2, colonne RESULTA) comme
        // équivalents — "NON SCANNE"/"NON SCAN" restent explicitement exclus.
        cResult >= 0 && /^(SCAN(N[EÉ])?|OUI|OK)$/i.test(String(row[cResult] ?? '').trim())
          ? 'SCANNE'
          : 'NON SCANE',
      scanTime: cScanTime >= 0 ? toIso(row[cScanTime]) : undefined,
      portId: cPort >= 0 ? (toNum(row[cPort]) ?? undefined) : undefined,
      onuId: cOnuId >= 0 ? (toNum(row[cOnuId]) ?? undefined) : undefined,
      onuName: cOnuName >= 0 ? String(row[cOnuName] ?? '').trim() : undefined,
      softwareVersion: cSw >= 0 ? String(row[cSw] ?? '').trim() : undefined,
      snMac: cSn >= 0 ? String(row[cSn] ?? '').trim() : undefined,
      timeAddedToNms: cAdded >= 0 ? toIso(row[cAdded]) : undefined,
      rxPower: cRx >= 0 ? toNum(row[cRx]) : null,
      ranging: cRanging >= 0 ? toNum(row[cRanging]) : null,
      remarque: cRemarque >= 0 ? String(row[cRemarque] ?? '').trim() : '',
    });
  }
  return rows;
}

export default function ScansPage() {
  const tousScans = useAppStore((s) => s.scans);
  // superviseur régional : seulement les zones des équipes de sa ville
  const { equipes, toutes: toutesEquipes, zoneOk } = usePerimetre();
  const scans = useMemo(() => tousScans.filter((s) => zoneOk(s.zone)), [tousScans, zoneOk]);
  const user = useAppStore((s) => s.user);

  // ─── Cas urgent depuis une ligne de scan (contact client obligatoire) ───
  const zoneEquipe = useMemo(() => {
    const map: Record<string, string> = { ...ZONE_EQUIPE_MAP };
    toutesEquipes.forEach((eq) => (eq.zones ?? []).forEach((z) => z && (map[z.trim().toUpperCase()] = eq.name)));
    return map;
  }, [toutesEquipes]);
  const equipeNames = useMemo(() => equipes.map((e) => e.name).sort((a, b) => a.localeCompare(b)), [equipes]);
  const [urgent, setUrgent] = useState<{ cle: string; prefill: PrefillUrgent } | null>(null);
  const [urgentChargement, setUrgentChargement] = useState<string | null>(null);

  const ouvrirUrgent = async (s: ScanRecord) => {
    const fgp = (s.onuName || '').trim();
    const zone = (s.zone || '').trim().toUpperCase();
    const prefill: PrefillUrgent = {
      nature: 'derangement',
      fgp,
      zone,
      equipe: zoneEquipe[zone],
      ontSerial: s.snMac || undefined,
      motif: motifDepuisScan(s),
      origine: `scan du ${formatScanDate(s.scanTime)} · ${s.result}${s.rxPower != null ? ` · Rx ${s.rxPower} dBm` : ''}${s.ranging != null ? ` · ${s.ranging} m` : ''}${s.remarque ? ` · ${s.remarque}` : ''}`,
    };
    // client déjà connu sur cette ligne (fiche la plus récente du même FGP) : nom, compte, contacts, DIS
    if (fgp) {
      setUrgentChargement(s.id);
      try {
        const fiche = (await rechercherFichesProgramme(fgp)).find((f) => f.fgp.trim() === fgp);
        if (fiche) {
          prefill.clientNom = fiche.clientNom || undefined;
          prefill.clientCode = fiche.clientCode || undefined;
          prefill.telephones = fiche.telephones.filter(Boolean);
          prefill.dis = fiche.dis || undefined;
          if (!prefill.equipe && fiche.equipe) prefill.equipe = fiche.equipe;
        }
      } catch {
        // pas de fiche connue : contact à saisir
      } finally {
        setUrgentChargement(null);
      }
    }
    // clé nouvelle à chaque ouverture : le formulaire repart du préremplissage
    setUrgent((prec) => ({ cle: `${s.id}-${(prec ? Number(prec.cle.split('-').pop()) : 0) + 1}`, prefill }));
  };
  const loadScans = useAppStore((s) => s.loadScans);
  const importScans = useAppStore((s) => s.importScans);
  const scanHistory = useAppStore((s) => s.scanHistory);
  const loadScanHistory = useAppStore((s) => s.loadScanHistory);
  const recordScanSnapshot = useAppStore((s) => s.recordScanSnapshot);
  const removeScanSnapshot = useAppStore((s) => s.removeScanSnapshot);
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [comparedTotals, setComparedTotals] = useState<{ previous: number; current: number } | null>(null);
  // Après un refresh, `diff` (local) est vide — on retombe sur le dernier diff persisté en base
  const EMPTY_DIFF: ImportDiff = {
    nouveaux: 0,
    nouveauxScanne: 0,
    nouveauxNonScanne: 0,
    disparus: 0,
    passesNonScanne: 0,
    passesScanne: 0,
    signalDegrade: 0,
    signalAmeliore: 0,
  };
  // La carte reste toujours affichée (ne disparaît jamais) — repli sur le diff persisté,
  // puis sur un diff vide si aucune comparaison n'a encore été calculée.
  // Comparaison calculée par la base (vue scan_import_stats), ONT par ONT
  const displayedDiff: ImportDiff = scanHistory[0]?.diff ?? EMPTY_DIFF;
  const hasRealDiff = Boolean(scanHistory[0]?.diff);

  useEffect(() => {
    if (scans.length === 0) loadScans();
    if (scanHistory.length === 0) loadScanHistory();
  }, []);

  const [fZone, setFZone] = useState('');
  const [fEquipe, setFEquipe] = useState(''); // regroupe les zones déjà affectées à une équipe
  const [fResult, setFResult] = useState('');
  const [fSignal, setFSignal] = useState<'' | SignalLevel>('');
  const [fNouveau, setFNouveau] = useState(false); // ONU nouveaux uniquement (vs import précédent)
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [recherche, setRecherche] = useState(''); // FGP, compte client, nom du client, SN

  // client de chaque ligne (compte, nom, contacts), relié au scan par le FGP
  const [clients, setClients] = useState<Map<string, ClientLigne>>(() => new Map());
  useEffect(() => {
    fetchClientsParFgp().then(setClients, () => undefined);
  }, []);
  const clientDe = (s: ScanRecord) => (s.onuName ? clients.get(s.onuName.trim()) : undefined);

  // colonnes affichées et leur ordre (gardés dans le navigateur)
  const [configCol, setConfigCol] = useState<ConfigColonnes>(lireConfigColonnes);
  const [colonnesOuvert, setColonnesOuvert] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(CLE_COLONNES, JSON.stringify(configCol));
    } catch {
      // stockage indisponible : le choix vaut pour cette visite
    }
  }, [configCol]);
  const colonnesVisibles = configCol.ordre
    .filter((id) => !configCol.masquees.includes(id))
    .map((id) => COLONNES.find((c) => c.id === id)!)
    .filter(Boolean);
  const basculerColonne = (id: ColId) =>
    setConfigCol((c) => {
      const masquee = c.masquees.includes(id);
      // au moins une colonne reste affichée
      if (!masquee && c.ordre.length - c.masquees.length <= 1) return c;
      return { ...c, masquees: masquee ? c.masquees.filter((x) => x !== id) : [...c.masquees, id] };
    });
  const deplacerColonne = (id: ColId, sens: -1 | 1) =>
    setConfigCol((c) => {
      const i = c.ordre.indexOf(id);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= c.ordre.length) return c;
      const ordre = [...c.ordre];
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
      return { ...c, ordre };
    });

  const zones = useMemo(() => [...new Set(scans.map((s) => s.zone).filter(Boolean))].sort(), [scans]);
  // Équipes qui ont au moins une zone assignée (pour le regroupement zone → équipe)
  const equipesAvecZones = useMemo(() => equipes.filter((eq) => (eq.zones ?? []).length > 0), [equipes]);

  const stats = useMemo(() => {
    const total = scans.length;
    const resilies = scans.filter(isResilie).length;
    const suspendus = scans.filter(isSuspendu).length;
    const scanne = scans.filter((s) => s.result === 'SCANNE').length;
    const nonScanne = scans.filter((s) => s.result === 'NON SCANE').length;
    const excellent = scans.filter((s) => signalLevel(s.rxPower) === 'excellent').length;
    const moyen = scans.filter((s) => signalLevel(s.rxPower) === 'moyen').length;
    const degrade = scans.filter((s) => signalLevel(s.rxPower) === 'degrade').length;
    const sansSignal = scans.filter((s) => signalLevel(s.rxPower) === 'absent').length;
    // % scanné : on exclut les lignes résiliées (non scannées car la ligne n'existe plus, pas un vrai problème)
    const denom = total - resilies;
    const pctScanne = denom ? Math.round((scanne / denom) * 1000) / 10 : 0;
    return { total, resilies, suspendus, scanne, nonScanne, excellent, moyen, degrade, sansSignal, denom, pctScanne };
  }, [scans]);

  const rechercheNorm = recherche.trim().toLowerCase().replace(/\s+/g, '');
  const filtered = useMemo(
    () =>
      scans
        .filter((s) => {
          if (fEquipe) {
            const eq = equipesAvecZones.find((e) => e.name === fEquipe);
            if (!eq || !(eq.zones ?? []).includes(s.zone)) return false;
          } else if (fZone && s.zone !== fZone) {
            return false;
          }
          if (rechercheNorm) {
            const c = s.onuName ? clients.get(s.onuName.trim()) : undefined;
            const champs = [s.onuName, s.onuId != null ? String(s.onuId) : '', s.snMac, c?.clientCode, c?.clientNom, ...(c?.telephones ?? [])];
            if (!champs.some((v) => (v ?? '').toLowerCase().replace(/\s+/g, '').includes(rechercheNorm))) return false;
          }
          if (fResult && s.result !== fResult) return false;
          if (fSignal && signalLevel(s.rxPower) !== fSignal) return false;
          if (fNouveau && s.changeType !== 'new') return false;
          // Le rôle premier du filtre date est de retrouver les ONU NON SCANNE sur une période
          // (ils n'ont pas de date de scan par définition — on ne les exclut donc pas ici).
          if (s.result !== 'NON SCANE') {
            if (fDateFrom && (!s.scanTime || s.scanTime.slice(0, 10) < fDateFrom)) return false;
            if (fDateTo && (!s.scanTime || s.scanTime.slice(0, 10) > fDateTo)) return false;
          }
          return true;
        }),
    [scans, fZone, fEquipe, equipesAvecZones, fResult, fSignal, fNouveau, fDateFrom, fDateTo, rechercheNorm, clients],
  );

  // ── Pagination (remplace l'ancien plafond silencieux à 300 lignes) ──
  const SCAN_PAGE_SIZE = 50;
  const [scanPage, setScanPage] = useState(1);
  // un filtre change : retour à la page 1
  const cleFiltres = [fZone, fEquipe, fResult, fSignal, fNouveau, fDateFrom, fDateTo, rechercheNorm].join('|');
  const [cleFiltresPrec, setCleFiltresPrec] = useState(cleFiltres);
  if (cleFiltres !== cleFiltresPrec) {
    setCleFiltresPrec(cleFiltres);
    setScanPage(1);
  }
  const scanTotalPages = Math.max(1, Math.ceil(filtered.length / SCAN_PAGE_SIZE));
  const paginatedScans = useMemo(
    () => filtered.slice((scanPage - 1) * SCAN_PAGE_SIZE, scanPage * SCAN_PAGE_SIZE),
    [filtered, scanPage],
  );

  const nouveauxCount = useMemo(() => scans.filter((s) => s.changeType === 'new').length, [scans]);

  const parseFile = async (file: File) => {
    setLoading(true);
    const previousScans = scans; // pour afficher « ancien fichier → nouveau fichier »
    try {
      const rows = await parseScanExcelFile(file);
      setComparedTotals({ previous: previousScans.length, current: rows.length });

      // Entrée d'historique créée d'abord (id d'import à associer aux lignes). Les compteurs
      // (% scanné hors résiliés, signal) et la comparaison avec l'import précédent sont
      // recalculés par la base à partir des lignes importées : ils ne peuvent pas être faux.
      const newImportId = await recordScanSnapshot({ fileName: file.name });
      if (!newImportId) throw new Error("Échec de la création de l'entrée d'historique — import annulé");

      const count = await importScans(rows, newImportId);

      showToast(`${count} lignes importées (historique conservé)`, 'success');
    } catch (err) {
      // Échec réel de l'import (ex: colonne manquante côté base, ou fichier illisible) — on
      // l'affiche au lieu de laisser croire à un succès alors que la table peut être vide.
      console.error('import scan failed:', err);
      showToast("Échec de l'import : " + ((err as Error)?.message || 'vérifiez le schéma de la base (SQL à jour ?)'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportScansToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    addSheetFromObjects(
      workbook,
      'Scans',
      // mêmes colonnes et même ordre que le tableau
      filtered.map((s) => {
        const c = clientDe(s);
        return Object.fromEntries(colonnesVisibles.map((col) => [col.label, col.excel(s, c)]));
      }),
    );
    const buffer = await workbook.xlsx.writeBuffer();
    downloadWorkbookBuffer(buffer as ArrayBuffer, `scans_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Scans Réseau (ONU/OLT)</h1>
          <p className="text-slate-400 text-sm">
            Contrôle des équipements fibre : % scanné, niveau de signal, évolution semaine par semaine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={loading}>
            {loading ? 'Import en cours...' : 'Importer le nouveau fichier de scan (.xlsx)'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-3">
        Chaque import s’ajoute à l’historique (le dernier fait foi) et se compare automatiquement au fichier précédent, ONT par numéro
        de série — colonnes reconnues : ZONE, STT, RESULT ou SCANNE, Scan time ou DATE SCAN, Port ID, ONU ID, ONU Name ou FGP, Software
        Version, SN/MAC, Time Added to NMS, Rx Optical Power(dBm), Ranging(m), Remarque.
      </p>

      {/* ── Programme : installations de la semaine non scannées, par équipe (se met à jour à chaque import) ── */}
      <RapportScanProgramme importId={scanHistory[0]?.id} />

      {/* ── Comparaison avec le fichier précédent (toujours affichée) ── */}
      <Card className="border-blue-200 bg-blue-50/40">
        <div className="p-4">
          <p className="text-sm font-bold text-blue-800 mb-1">
            Comparaison avec le fichier de la semaine précédente
            {scanHistory[0] && (
              <span className="text-xs font-normal text-blue-500 ml-2">
                (dernier import : {new Date(scanHistory[0].importedAt).toLocaleString('fr-FR')})
              </span>
            )}
          </p>
          {!hasRealDiff && (
            <p className="text-xs text-blue-600/80 mb-2 italic">
              Aucune comparaison disponible pour le moment — elle apparaîtra ici après le prochain import.
            </p>
          )}
          {comparedTotals && (
            <p className="text-[11px] text-blue-600/70 mb-2">
              Comparé : ancien fichier ({comparedTotals.previous} lignes) → nouveau fichier ({comparedTotals.current} lignes)
              {comparedTotals.previous === comparedTotals.current && comparedTotals.previous > 0 && (
                <span className="font-semibold">
                  {' '}
                  — mêmes totaux : si tout est à 0 ci-dessous, vérifie que ce n'est pas le même fichier réimporté deux fois.
                </span>
              )}
            </p>
          )}
          <p className="text-xs text-blue-700/80 mb-3">
            Chaque ONU est identifié par son <strong>numéro de série (SN/MAC)</strong> et comparé au fichier importé la
            semaine précédente : <strong>Nouveaux ONU</strong> = présents dans ce fichier mais absents de l'ancien, qu'ils soient scannés ou
            non · <strong>ONU disparus</strong> = présents avant, absents maintenant (retirés/hors périmètre du scan) ·{' '}
            <strong>Passés NON SCANNE</strong> = étaient scannés avant, ne le sont plus (à surveiller) · <strong>Repassés SCANNE</strong> =
            ne l'étaient pas avant, le sont maintenant (amélioration) · <strong>Signal dégradé/amélioré</strong> = le niveau de signal
            (Excellent/Moyen/Dégradé) a changé, uniquement comparé entre deux ONU réellement scannés des deux côtés (un ONU NON SCANNE n'a
            pas de nouvelle mesure, son signal n'est pas compté comme "changé").
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <DiffStat
              label="Total nouveaux ONU"
              sub={`dont ${displayedDiff.nouveauxScanne ?? 0} scannés · ${displayedDiff.nouveauxNonScanne ?? 0} non scannés`}
              value={displayedDiff.nouveaux}
              color="#1565C0"
              onClick={() => {
                setFNouveau(true);
                setFZone('');
                setFEquipe('');
              }}
            />
            <DiffStat label="Total ONU disparus" value={displayedDiff.disparus} color="#546E7A" />
            <DiffStat label="Passés NON SCANNE" value={displayedDiff.passesNonScanne} color="#C62828" />
            <DiffStat label="Repassés SCANNE" value={displayedDiff.passesScanne} color="#2E7D32" />
            <DiffStat label="Signal dégradé" value={displayedDiff.signalDegrade} color="#E9A93B" />
            <DiffStat label="Signal amélioré" value={displayedDiff.signalAmeliore} color="#00838F" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        <StatCard
          value={`${stats.pctScanne}%`}
          label={`Scannés (${stats.scanne}/${stats.denom}, hors résiliés)`}
          icon=""
          accent="#1565C0"
        />
        <StatCard value={stats.excellent} label={SIGNAL_LABELS.excellent} icon="" accent="#2E7D32" />
        <StatCard value={stats.moyen} label={SIGNAL_LABELS.moyen} icon="" accent="#E9A93B" />
        <StatCard value={stats.degrade} label={SIGNAL_LABELS.degrade} icon="" accent="#C62828" />
        <StatCard value={stats.resilies} label="Total résiliés" icon="" accent="#546E7A" />
        <StatCard value={stats.suspendus} label="Total suspendus" icon="" accent="#8D6E63" />
      </div>

      {/* ── Graphique de tendance % scanné (semaine par semaine) ── */}
      {scanHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendance % scanné</CardTitle>
          </CardHeader>
          <div className="p-4">
            <TrendArea
              points={[...scanHistory]
                .reverse()
                .map((h) => ({ label: new Date(h.importedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), value: h.pctScanne }))}
              color="#1565C0"
            />
          </div>
        </Card>
      )}

      {/* ── Historique des imports (évolution semaine par semaine) ── */}
      {scanHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Évolution des imports (derniers scans)</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Date d'import</th>
                  <th className="px-3 py-2 text-center">Total</th>
                  <th className="px-3 py-2 text-center">% Scanné</th>
                  <th className="px-3 py-2 text-center">Excellent</th>
                  <th className="px-3 py-2 text-center">Moyen</th>
                  <th className="px-3 py-2 text-center">Dégradé</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scanHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(h.importedAt).toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-center">{h.total}</td>
                    <td className="px-3 py-2 text-center font-semibold text-blue-700">{h.pctScanne}%</td>
                    <td className="px-3 py-2 text-center text-green-700">{h.excellent}</td>
                    <td className="px-3 py-2 text-center text-amber-700">{h.moyen}</td>
                    <td className="px-3 py-2 text-center text-red-700">{h.degrade}</td>
                    <td className="px-3 py-2 text-right">
                      <BtnDelete
                        size="xs"
                        onClick={() => {
                          if (
                            confirm(
                              "Supprimer cet import ?\n\nÇa retire la ligne d'historique ET les données de scan de cet import précis (elles sont conservées séparément par import maintenant). Les autres imports ne sont pas affectés.",
                            )
                          ) {
                            removeScanSnapshot(h.id);
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <CardTitle>Détail des scans</CardTitle>
            <div className="relative w-full sm:w-72 order-last sm:order-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 pr-8"
                placeholder="FGP, compte client, nom, SN…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                aria-label="Rechercher par FGP ou compte client"
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => setRecherche('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setColonnesOuvert(true)} icon={<Columns3 className="w-4 h-4" />}>
                Colonnes
              </Button>
              <Button variant="outline" size="sm" onClick={exportScansToExcel} disabled={filtered.length === 0}>
                Exporter Excel
              </Button>
              <Select
                value={fEquipe}
                onChange={(e) => {
                  setFEquipe(e.target.value);
                  setFZone('');
                }}
                style={{ width: 'auto' }}
              >
                <option value="">Toutes équipes</option>
                {equipesAvecZones.map((eq) => (
                  <option key={eq.id} value={eq.name}>
                    {eq.name} ({(eq.zones ?? []).length} zones)
                  </option>
                ))}
              </Select>
              <Select
                value={fZone}
                onChange={(e) => {
                  setFZone(e.target.value);
                  setFEquipe('');
                }}
                style={{ width: 'auto' }}
              >
                <option value="">Toutes zones</option>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
              <Select value={fResult} onChange={(e) => setFResult(e.target.value)} style={{ width: 'auto' }}>
                <option value="">Scanné / Non scanné</option>
                <option value="SCANNE">Scannés uniquement</option>
                <option value="NON SCANE">Non scannés uniquement</option>
              </Select>
              <Select value={fSignal} onChange={(e) => setFSignal(e.target.value as '' | SignalLevel)} style={{ width: 'auto' }}>
                <option value="">Tous signaux</option>
                <option value="excellent">Excellent (-10 à -22 dBm)</option>
                <option value="moyen">Moyen (-22,1 à -25 dBm)</option>
                <option value="degrade">Dégradé (-25 à -35 dBm)</option>
                <option value="absent">Sans mesure</option>
              </Select>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer">
                <input type="checkbox" checked={fNouveau} onChange={(e) => setFNouveau(e.target.checked)} />
                Nouveaux ONU ({nouveauxCount})
              </label>
              <div
                className="flex items-center gap-1.5 text-xs"
                title="Retrouve surtout les ONU NON SCANNE sur cette période (ils n'ont pas de date de scan)"
              >
                <span className="text-slate-400">Non scannés entre le</span>
                <input
                  type="date"
                  value={fDateFrom}
                  onChange={(e) => setFDateFrom(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5"
                />
                <span className="text-slate-400">et le</span>
                <input
                  type="date"
                  value={fDateTo}
                  onChange={(e) => setFDateTo(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState
            icon=""
            text={
              scans.length === 0
                ? 'Aucun scan importé — utilisez le bouton "Importer le nouveau fichier de scan"'
                : 'Aucun résultat pour ces filtres'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  {colonnesVisibles.map((col) => (
                    <th key={col.id} className={`px-3 py-2 whitespace-nowrap ${col.center ? 'text-center' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                  {user && <th className="px-3 py-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedScans.map((s) => {
                  const level = signalLevel(s.rxPower);
                  const c = clientDe(s);
                  return (
                    <tr key={s.id} className={level === 'degrade' ? 'bg-red-50' : ''}>
                      {colonnesVisibles.map((col) => (
                        <td key={col.id} className={`px-3 py-2 ${col.center ? 'text-center' : ''}`}>
                          {col.cell(s, c)}
                        </td>
                      ))}
                      {user && (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => ouvrirUrgent(s)}
                            disabled={!s.onuName || urgentChargement === s.id}
                            title={s.onuName ? 'Affecter un cas urgent à partir de ce scan' : 'FGP inconnu : impossible de créer un cas urgent'}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-orange-200 bg-orange-50 text-orange-800 text-[11px] font-bold hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <Flame className="w-3.5 h-3.5 text-orange-600" />
                            {urgentChargement === s.id ? '…' : 'Urgence'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-3 py-3 border-t border-slate-100 flex-wrap gap-2">
              <p className="text-xs text-slate-400">
                {(scanPage - 1) * SCAN_PAGE_SIZE + 1}–{Math.min(scanPage * SCAN_PAGE_SIZE, filtered.length)} sur {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={scanPage <= 1} onClick={() => setScanPage((p) => Math.max(1, p - 1))}>
                  Précédent
                </Button>
                <span className="text-xs text-slate-500 font-medium px-1">
                  Page {scanPage} / {scanTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={scanPage >= scanTotalPages}
                  onClick={() => setScanPage((p) => Math.min(scanTotalPages, p + 1))}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Choix et ordre des colonnes ─── */}
      <Modal open={colonnesOuvert} onClose={() => setColonnesOuvert(false)} title="Colonnes du tableau">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Cochez les colonnes à afficher et changez leur ordre avec les flèches. L'export Excel suit ce choix.</p>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {configCol.ordre.map((id, i) => {
              const col = COLONNES.find((c) => c.id === id);
              if (!col) return null;
              const visible = !configCol.masquees.includes(id);
              return (
                <li key={id} className="flex items-center gap-2 px-3 py-2">
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={visible} onChange={() => basculerColonne(id)} />
                    <span className={`text-sm truncate ${visible ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{col.label}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => deplacerColonne(id, -1)}
                    disabled={i === 0}
                    aria-label={`Monter ${col.label}`}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deplacerColonne(id, 1)}
                    disabled={i === configCol.ordre.length - 1}
                    aria-label={`Descendre ${col.label}`}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setConfigCol(CONFIG_DEFAUT)} className="justify-center">
              Réinitialiser
            </Button>
            <Button size="sm" onClick={() => setColonnesOuvert(false)} className="justify-center">
              Terminé
            </Button>
          </div>
        </div>
      </Modal>

      {urgent && user && (
        <AffecterUrgentModal
          key={urgent.cle}
          open
          onClose={() => setUrgent(null)}
          equipeNames={equipeNames}
          zoneEquipe={zoneEquipe}
          user={{ id: user.id, name: user.name }}
          prefill={urgent.prefill}
          contactObligatoire
          onSuccess={(msg) => showToast(msg, 'success')}
        />
      )}
    </div>
  );
}

function DiffStat({
  label,
  sub,
  value,
  color,
  onClick,
}: {
  label: string;
  sub?: string;
  value: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white rounded-lg border border-slate-200 p-3 text-center ${onClick ? 'hover:border-blue-300 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-xl font-black" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </button>
  );
}