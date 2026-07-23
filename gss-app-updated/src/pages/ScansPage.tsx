import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Select, StatCard, EmptyState, useToast } from '@/components/ui';
import type { ScanRecord } from '@/types';

// Trois intervalles de signal (Rx Optical Power, dBm) :
//  Excellent : -10 à -22   ·  Moyen : -22,1 à -25   ·  Dégradé : -25 à -35 (et au-delà)
type SignalLevel = 'excellent' | 'moyen' | 'degrade' | 'absent';

function signalLevel(rx: number | null | undefined): SignalLevel {
  if (rx === null || rx === undefined) return 'absent';
  if (rx >= -22) return 'excellent';
  if (rx >= -25) return 'moyen';
  return 'degrade';
}
const SIGNAL_RANK: Record<SignalLevel, number> = { excellent: 3, moyen: 2, degrade: 1, absent: 0 };
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

function formatScanDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function scanKey(s: Partial<ScanRecord>): string {
  // ONU Name est unique dans le système (vérifié : ~99.99% unique sur 10k+ lignes,
  // contrairement à ONU ID qui ne compte que quelques dizaines de valeurs distinctes,
  // donc inutilisable comme clé) → clé de comparaison prioritaire.
  // Repli sur SN/MAC puis sur Zone+Port si ONU Name est absent.
  if (s.onuName && s.onuName.trim()) return `onu:${s.onuName.trim()}`;
  return (s.snMac && s.snMac.trim()) || `${s.zone}|${s.portId ?? ''}`;
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

// Calcule le diff ET marque chaque ligne du nouveau fichier comme 'new' / 'existing'
// (persisté en base ensuite, pour un filtrage fiable même après un refresh).
function computeDiffAndTag(oldRows: ScanRecord[], newRows: Partial<ScanRecord>[]): ImportDiff {
  const oldMap = new Map(oldRows.map((r) => [scanKey(r), r]));
  const diff: ImportDiff = {
    nouveaux: 0,
    nouveauxScanne: 0,
    nouveauxNonScanne: 0,
    disparus: 0,
    passesNonScanne: 0,
    passesScanne: 0,
    signalDegrade: 0,
    signalAmeliore: 0,
  };
  const newKeys = new Set<string>();

  newRows.forEach((row) => {
    const key = scanKey(row);
    newKeys.add(key);
    const old = oldMap.get(key);
    if (!old) {
      diff.nouveaux++;
      if (row.result === 'SCANNE') diff.nouveauxScanne++;
      else diff.nouveauxNonScanne++;
      row.changeType = 'new';
      return;
    }
    row.changeType = 'existing';
    if (old.result === 'SCANNE' && row.result === 'NON SCANE') diff.passesNonScanne++;
    if (old.result === 'NON SCANE' && row.result === 'SCANNE') diff.passesScanne++;
    // Le signal ne peut être comparé que si l'ONU est réellement scanné des deux côtés
    // (un ONU NON SCANNE n'a pas de nouvelle mesure — son signal n'a pas "changé", il est juste inconnu).
    if (old.result === 'SCANNE' && row.result === 'SCANNE') {
      const oldLevel = signalLevel(old.rxPower);
      const newLevel = signalLevel(row.rxPower ?? null);
      if (SIGNAL_RANK[newLevel] < SIGNAL_RANK[oldLevel]) diff.signalDegrade++;
      else if (SIGNAL_RANK[newLevel] > SIGNAL_RANK[oldLevel]) diff.signalAmeliore++;
    }
  });
  oldMap.forEach((_row, key) => {
    if (!newKeys.has(key)) diff.disparus++;
  });
  return diff;
}

// Lit un fichier .xlsx de scan et renvoie les lignes normalisées (réutilisé par
// l'import principal ET l'outil "Comparer deux fichiers").
function parseScanExcelFile(file: File): Promise<Partial<ScanRecord>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result as string, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) {
          reject(new Error('Fichier vide ou invalide'));
          return;
        }

        const header = data[0].map((h: any) =>
          String(h ?? '')
            .trim()
            .toUpperCase(),
        );
        const col = (keywords: string[]) => header.findIndex((h) => keywords.some((k) => h.includes(k)));
        const cZone = col(['ZONE']);
        const cStt = col(['STT']);
        const cResult = col(['RESULT']);
        const cScanTime = col(['SCAN TIME']);
        const cPort = col(['PORT ID']);
        const cOnuId = col(['ONU ID']);
        const cOnuName = col(['ONU NAME']);
        const cSw = col(['SOFTWARE VERSION']);
        const cSn = col(['SN/MAC', 'SN MAC']);
        const cAdded = col(['TIME ADDED']);
        const cRx = col(['RX OPTICAL', 'RX POWER']);
        const cRanging = col(['RANGING']);
        const cRemarque = col(['REMARQUE']);

        const toIso = (v: any) => (v instanceof Date ? v.toISOString() : v ? String(v) : undefined);
        const toNum = (v: any) => (v === null || v === undefined || v === '' || v === '--' ? null : isNaN(Number(v)) ? null : Number(v));

        const rows: Partial<ScanRecord>[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.every((c) => c === null || c === undefined || c === '')) continue;
          rows.push({
            zone: cZone >= 0 ? String(row[cZone] ?? '').trim() : '',
            stt: cStt >= 0 ? String(row[cStt] ?? '').trim() : '',
            result:
              cResult >= 0 && /SCANNE$/i.test(String(row[cResult] ?? '')) && !/NON/i.test(String(row[cResult] ?? ''))
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
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsBinaryString(file);
  });
}

export default function ScansPage() {
  const scans = useAppStore((s) => s.scans);
  const equipes = useAppStore((s) => s.equipes);
  const loadScans = useAppStore((s) => s.loadScans);
  const importScans = useAppStore((s) => s.importScans);
  const scanHistory = useAppStore((s) => s.scanHistory);
  const loadScanHistory = useAppStore((s) => s.loadScanHistory);
  const recordScanSnapshot = useAppStore((s) => s.recordScanSnapshot);
  const removeScanSnapshot = useAppStore((s) => s.removeScanSnapshot);
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
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
  const displayedDiff = diff ?? scanHistory[0]?.diff ?? EMPTY_DIFF;
  const hasRealDiff = Boolean(diff ?? scanHistory[0]?.diff);

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
        })
        .slice(0, 300),
    [scans, fZone, fEquipe, equipesAvecZones, fResult, fSignal, fNouveau, fDateFrom, fDateTo],
  ); // limité à 300 lignes affichées (performance)

  const nouveauxCount = useMemo(() => scans.filter((s) => s.changeType === 'new').length, [scans]);

  const parseFile = async (file: File) => {
    setLoading(true);
    setDiff(null);
    const previousScans = scans; // snapshot avant remplacement, pour calculer la différence
    try {
      const rows = await parseScanExcelFile(file);

      // Diff + marquage "nouveau"/"existant" par ligne (persisté avec l'import)
      const computedDiff = computeDiffAndTag(previousScans, rows);
      setComparedTotals({ previous: previousScans.length, current: rows.length });

      const count = await importScans(rows, true);
      setDiff(computedDiff);

      // Snapshot pour le suivi semaine par semaine (% scanné hors résiliés, signal, + diff)
      const newExcellent = rows.filter((r) => signalLevel(r.rxPower ?? null) === 'excellent').length;
      const newMoyen = rows.filter((r) => signalLevel(r.rxPower ?? null) === 'moyen').length;
      const newDegrade = rows.filter((r) => signalLevel(r.rxPower ?? null) === 'degrade').length;
      const newScanne = rows.filter((r) => r.result === 'SCANNE').length;
      const newResilies = rows.filter(isResilie).length;
      await recordScanSnapshot({
        total: rows.length,
        scanne: newScanne,
        nonScanne: rows.length - newScanne,
        excellent: newExcellent,
        moyen: newMoyen,
        degrade: newDegrade,
        resilies: newResilies,
        diff: computedDiff,
      });

      showToast(`${count} lignes importées (table remplacée)`, 'success');
    } catch (err: any) {
      // Échec réel de l'import (ex: colonne manquante côté base, ou fichier illisible) — on
      // l'affiche au lieu de laisser croire à un succès alors que la table peut être vide.
      console.error('import scan failed:', err);
      showToast("Échec de l'import : " + (err?.message || 'vérifiez le schéma de la base (SQL à jour ?)'), 'error');
    } finally {
      setLoading(false);
    }
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
        Chaque import <strong>remplace entièrement</strong> la table (photo la plus récente du réseau) et se compare automatiquement au
        fichier précédent — colonnes attendues : ZONE, STT, RESULT, Scan time, Port ID, ONU ID, ONU Name, Software Version, SN/MAC, Time
        Added to NMS, Rx Optical Power(dBm), Ranging(m), Remarque.
      </p>

      {/* ── Comparaison avec le fichier précédent (toujours affichée) ── */}
      <Card className="border-blue-200 bg-blue-50/40">
        <div className="p-4">
          <p className="text-sm font-bold text-blue-800 mb-1">
            Comparaison avec le fichier de la semaine précédente
            {!diff && scanHistory[0] && (
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
            Chaque ONU est identifié par son <strong>ONU NAME</strong> (identifiant unique dans le système) et comparé au fichier importé la
            semaine précédente : <strong>Nouveaux ONU</strong> = présents dans ce fichier mais absents de l'ancien, qu'ils soient scannés ou
            non · <strong>ONU disparus</strong> = présents avant, absents maintenant (retirés/hors périmètre du scan) ·{' '}
            <strong>Passés NON SCANNE</strong> = étaient scannés avant, ne le sont plus (à surveiller) · <strong>Repassés SCANNE</strong> =
            ne l'étaient pas avant, le sont maintenant (amélioration) · <strong>Signal dégradé/amélioré</strong> = le niveau de signal
            (Excellent/Moyen/Dégradé) a changé, uniquement comparé entre deux ONU réellement scannés des deux côtés (un ONU NON SCANNE n'a
            pas de nouvelle mesure, son signal n'est pas compté comme "changé").
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <DiffStat
              label="Total nouveaux ONU NAME"
              sub={`dont ${displayedDiff.nouveauxScanne ?? 0} scannés · ${displayedDiff.nouveauxNonScanne ?? 0} non scannés`}
              value={displayedDiff.nouveaux}
              color="#1565C0"
              onClick={() => {
                setFNouveau(true);
                setFZone('');
                setFEquipe('');
              }}
            />
            <DiffStat label="Total ONU NAME disparus" value={displayedDiff.disparus} color="#546E7A" />
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
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Supprimer cette ligne de l'historique ?\n\nATTENTION : ça retire seulement cette ligne du tableau ci-dessus. Les données réelles de scan (utilisées pour la comparaison automatique) ne sont PAS supprimées et restent inchangées.",
                            )
                          ) {
                            removeScanSnapshot(h.id);
                          }
                        }}
                        className="text-red-600 hover:underline text-xs font-semibold"
                      >
                        Supprimer
                      </button>
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
            <div className="flex items-center gap-2 ml-auto flex-wrap">
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
                  <th className="px-3 py-2 text-left">Zone</th>
                  <th className="px-3 py-2 text-left">Résultat</th>
                  <th className="px-3 py-2 text-left">FGP</th>
                  <th className="px-3 py-2 text-left">SN/MAC</th>
                  <th className="px-3 py-2 text-center">Rx (dBm)</th>
                  <th className="px-3 py-2 text-left">Niveau</th>
                  <th className="px-3 py-2 text-center">Distance (m)</th>
                  <th className="px-3 py-2 text-left">Scan time</th>
                  <th className="px-3 py-2 text-left">Ajouté au NMS</th>
                  <th className="px-3 py-2 text-left">Remarque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const level = signalLevel(s.rxPower);
                  return (
                    <tr key={s.id} className={level === 'degrade' ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2">
                        {s.zone}
                        {s.changeType === 'new' && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">nouveau</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.result === 'SCANNE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {s.result}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.onuName || s.onuId || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-500">{s.snMac || '—'}</td>
                      <td className={`px-3 py-2 text-center font-semibold ${level === 'degrade' ? 'text-red-600' : 'text-slate-600'}`}>
                        {s.rxPower ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${SIGNAL_STYLES[level]}`}>
                          {level === 'absent' ? '—' : SIGNAL_LABELS[level].split(' (')[0]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500">{s.ranging ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{formatScanDate(s.scanTime)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{formatScanDate(s.timeAddedToNms)}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{s.remarque || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {scans.length > 300 && (
              <p className="text-[11px] text-slate-400 p-3">
                Affichage limité à 300 lignes sur {filtered.length === 300 ? '300+' : filtered.length} résultats filtrés — affinez les
                filtres pour cibler.
              </p>
            )}
          </div>
        )}
      </Card>
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
