import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Select, StatCard, EmptyState, useToast } from '@/components/ui';
import type { ScanRecord } from '@/types';

// Seuil de signal dégradé : -28 dBm et en-dessous (couvre le cas signalé -29 à -33 dBm)
const SEUIL_DEGRADE = -28;

export default function ScansPage() {
  const scans = useAppStore((s) => s.scans);
  const loadScans = useAppStore((s) => s.loadScans);
  const importScans = useAppStore((s) => s.importScans);
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (scans.length === 0) loadScans();
  }, []);

  const [fZone, setFZone] = useState('');
  const [fResult, setFResult] = useState('');
  const [fSignal, setFSignal] = useState(''); // '', 'degrade', 'ok', 'absent'

  const zones = useMemo(() => [...new Set(scans.map((s) => s.zone).filter(Boolean))].sort(), [scans]);

  const stats = useMemo(() => {
    const scanne = scans.filter((s) => s.result === 'SCANNE').length;
    const nonScanne = scans.filter((s) => s.result === 'NON SCANE').length;
    const degrade = scans.filter((s) => s.rxPower !== null && s.rxPower !== undefined && s.rxPower <= SEUIL_DEGRADE).length;
    const sansSignal = scans.filter((s) => s.rxPower === null || s.rxPower === undefined).length;
    return { total: scans.length, scanne, nonScanne, degrade, sansSignal };
  }, [scans]);

  const filtered = useMemo(
    () =>
      scans
        .filter((s) => {
          if (fZone && s.zone !== fZone) return false;
          if (fResult && s.result !== fResult) return false;
          if (fSignal === 'degrade' && !(s.rxPower !== null && s.rxPower !== undefined && s.rxPower <= SEUIL_DEGRADE)) return false;
          if (fSignal === 'ok' && !(s.rxPower !== null && s.rxPower !== undefined && s.rxPower > SEUIL_DEGRADE)) return false;
          if (fSignal === 'absent' && !(s.rxPower === null || s.rxPower === undefined)) return false;
          return true;
        })
        .slice(0, 300),
    [scans, fZone, fResult, fSignal],
  ); // limité à 300 lignes affichées (performance)

  const parseFile = (file: File) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result as string, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) {
          showToast('Fichier vide ou invalide', 'error');
          setLoading(false);
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

        importScans(rows, true).then((count) => {
          showToast(`${count} lignes importées (table remplacée) `, 'success');
          setLoading(false);
        });
      } catch (err: any) {
        showToast('Erreur lecture: ' + err.message, 'error');
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Scans Réseau (ONU/OLT)</h1>
          <p className="text-slate-400 text-sm">Contrôle des équipements fibre : scannés/non scannés, signal dégradé</p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
          />
          <Button icon="" onClick={() => fileRef.current?.click()} disabled={loading}>
            {loading ? 'Import en cours...' : 'Importer un fichier de scan (.xlsx)'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-3">
        Chaque import <strong>remplace entièrement</strong> la table (photo la plus récente du réseau) — colonnes attendues : ZONE, STT,
        RESULT, Scan time, Port ID, ONU ID, ONU Name, Software Version, SN/MAC, Time Added to NMS, Rx Optical Power(dBm), Ranging(m),
        Remarque.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard value={stats.total} label="Total lignes" icon="" accent="#1565C0" />
        <StatCard value={stats.scanne} label="Scannés" icon="" accent="#2E7D32" />
        <StatCard value={stats.nonScanne} label="Non scannés" icon="" accent="#C62828" />
        <StatCard value={stats.degrade} label={`Signal ≤ ${SEUIL_DEGRADE}dBm`} icon="" accent="#E9A93B" />
        <StatCard value={stats.sansSignal} label="Sans mesure" icon="" accent="#546E7A" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <CardTitle>Détail des scans</CardTitle>
            <div className="flex items-center gap-2 ml-auto">
              <Select value={fZone} onChange={(e) => setFZone(e.target.value)} style={{ width: 'auto' }}>
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
              <Select value={fSignal} onChange={(e) => setFSignal(e.target.value)} style={{ width: 'auto' }}>
                <option value="">Tous signaux</option>
                <option value="degrade">Signal dégradé (≤ {SEUIL_DEGRADE}dBm)</option>
                <option value="ok">Signal correct</option>
                <option value="absent">Sans mesure</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState
            icon=""
            text={
              scans.length === 0
                ? 'Aucun scan importé — utilisez le bouton "Importer un fichier de scan"'
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
                  <th className="px-3 py-2 text-left">ONU</th>
                  <th className="px-3 py-2 text-left">SN/MAC</th>
                  <th className="px-3 py-2 text-center">Rx (dBm)</th>
                  <th className="px-3 py-2 text-center">Distance (m)</th>
                  <th className="px-3 py-2 text-left">Remarque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const degrade = s.rxPower !== null && s.rxPower !== undefined && s.rxPower <= SEUIL_DEGRADE;
                  return (
                    <tr key={s.id} className={degrade ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2">{s.zone}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.result === 'SCANNE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {s.result}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.onuName || s.onuId || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-500">{s.snMac || '—'}</td>
                      <td className={`px-3 py-2 text-center font-semibold ${degrade ? 'text-red-600' : 'text-slate-600'}`}>
                        {s.rxPower ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500">{s.ranging ?? '—'}</td>
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
