import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ScanLine } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { fetchDernierImportScan, fetchFaitesEntre, fetchScanOts, type ScanOT } from '@/lib/programmeService';
import { ligneLabel } from '@/utils/programme';
import type { ProgrammeOT } from '@/types';
import { errMsg } from '@/utils';

const fr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const ETAT = {
  'NON SCANE': { label: 'Non scanné', cls: 'bg-red-50 text-red-700 border-red-200' },
  ABSENT: { label: 'Absent du fichier', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  SCANNE: { label: 'Scanné', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
} as const;

interface Ligne {
  ot: ProgrammeOT;
  scan: ScanOT | undefined;
}

/**
 * Après chaque import du fichier de scan : installations faites dans les 7 jours avant
 * l'import qui ne sont pas scannées dans ce fichier, par équipe. C'est le fichier qui
 * fait foi ; la case « Scanné » du chef est montrée à côté pour repérer les écarts.
 * Montre aussi les dérangements de la semaine dont l'ONT n'était déjà pas scanné avant.
 */
export function RapportScanProgramme({ importId }: { importId?: string }) {
  const equipes = useAppStore((s) => s.equipes);
  const [data, setData] = useState<{ importedAt: string; lignes: Ligne[] } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const imp = await fetchDernierImportScan();
        if (!imp) return alive && setData(null);
        const to = new Date(imp.importedAt);
        const from = new Date(to.getTime() - 7 * 86400000);
        const ots = await fetchFaitesEntre(from.toISOString(), to.toISOString());
        const scans = await fetchScanOts(ots.map((o) => o.id));
        if (alive) setData({ importedAt: imp.importedAt, lignes: ots.map((ot) => ({ ot, scan: scans.get(ot.id) })) });
      } catch (e) {
        if (alive) setError(errMsg(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [importId]);

  const parEquipe = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { inst: Ligne[]; aScanner: Ligne[]; ecarts: number; drgDejaNonScannes: Ligne[] }>();
    for (const l of data.lignes) {
      const k = l.ot.equipe || 'Sans équipe';
      const g = m.get(k) ?? { inst: [], aScanner: [], ecarts: 0, drgDejaNonScannes: [] };
      if (l.ot.nature === 'installation' && l.ot.statut === 'fait') {
        g.inst.push(l);
        if (l.scan?.dernier && l.scan.dernier !== 'SCANNE') {
          g.aScanner.push(l);
          if (l.ot.scanne) g.ecarts++;
        }
      }
      if (l.ot.nature === 'derangement' && l.scan?.avant === 'NON SCANE') g.drgDejaNonScannes.push(l);
      m.set(k, g);
    }
    return [...m.entries()].filter(([, g]) => g.inst.length || g.drgDejaNonScannes.length).sort((a, b) => b[1].aScanner.length - a[1].aScanner.length);
  }, [data]);

  if (error) return <Card className="p-4 text-sm text-red-700">Rapport programme / scan : {error}</Card>;
  if (!data || parEquipe.length === 0) return null;
  const totInst = parEquipe.reduce((a, [, g]) => a + g.inst.length, 0);
  const totNon = parEquipe.reduce((a, [, g]) => a + g.aScanner.length, 0);
  const colorOf = (n: string) => equipes.find((e) => e.name.toLowerCase() === n.toLowerCase())?.color ?? '#94A3B8';

  return (
    <Card className="border-violet-200">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-violet-700" />
          <div>
            <p className="font-bold text-slate-800">Installations du programme non scannées</p>
            <p className="text-xs text-slate-500">
              Fiches faites du {fr(new Date(new Date(data.importedAt).getTime() - 7 * 86400000).toISOString())} au {fr(data.importedAt)}, comparées au fichier
              importé le {new Date(data.importedAt).toLocaleString('fr-FR')}
            </p>
          </div>
        </div>
        <span className={`text-sm font-black px-3 py-1 rounded-full ${totNon ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
          {totNon} / {totInst} non scannée{totNon > 1 ? 's' : ''}
        </span>
      </div>
      {parEquipe.map(([equipe, g]) => {
        const isOpen = open === equipe;
        return (
          <div key={equipe} className="border-b border-slate-100 last:border-0">
            <button onClick={() => setOpen(isOpen ? null : equipe)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(equipe) }} />
              <span className="font-semibold text-slate-800 flex-1">{equipe}</span>
              <span className="text-xs text-slate-500">
                {g.inst.length - g.aScanner.length}/{g.inst.length} scannées
                {g.ecarts ? <b className="text-amber-700"> · {g.ecarts} cochée{g.ecarts > 1 ? 's' : ''} « scanné » à tort</b> : ''}
                {g.drgDejaNonScannes.length ? ` · ${g.drgDejaNonScannes.length} DRG déjà non scanné${g.drgDejaNonScannes.length > 1 ? 's' : ''} avant` : ''}
              </span>
              {g.aScanner.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">{g.aScanner.length}</span>}
              <ChevronDown className={`w-4 h-4 text-slate-400 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="bg-slate-50/70 border-t border-slate-100">
                {[...g.aScanner, ...g.drgDejaNonScannes].map(({ ot, scan }) => {
                  const drg = ot.nature === 'derangement';
                  const etat = drg ? scan?.avant : scan?.dernier;
                  return (
                    <div key={ot.id} className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 last:border-0 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {ot.typeOt && <span className="text-[10px] font-bold px-1.5 py-0.5 mr-1 rounded bg-slate-200 text-slate-600">{ot.typeOt}</span>}
                          {ligneLabel(ot)} · {ot.clientNom}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          ONT {ot.ontSerials.join(' / ') || '—'} · {ot.dis}
                          <span className="font-sans">
                            {drg
                              ? ` · reçu le ${fr(ot.dateRecu ?? ot.dateProgramme)}, état au scan du ${scan?.avantLe ? fr(scan.avantLe) : '—'}`
                              : ` · fait le ${ot.traiteLe ? fr(ot.traiteLe) : '—'}`}
                          </span>
                        </p>
                      </div>
                      {!drg && ot.scanne && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700" title="Le chef a coché « Scanné », mais le fichier de scan ne le confirme pas">
                          <AlertTriangle className="w-3.5 h-3.5" /> déclaré scanné
                        </span>
                      )}
                      {etat && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ETAT[etat].cls}`}>{drg ? 'Avant : ' : ''}{ETAT[etat].label}</span>}
                    </div>
                  );
                })}
                {g.aScanner.length + g.drgDejaNonScannes.length === 0 && <p className="px-4 py-2 text-sm text-emerald-700">Toutes les installations de la semaine sont scannées.</p>}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
