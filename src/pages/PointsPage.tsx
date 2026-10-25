import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Trophy } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, useToast } from '@/components/ui';
import { fetchPourPoints, subscribeProgramme } from '@/lib/programmeService';
import { ETAT_DELAI, POINTS, classement, delaiOT, jourCourt } from '@/utils/points';
import { NATURE_CLASS, NATURE_LABEL, ligneLabel } from '@/utils/programme';
import { downloadWorkbookBuffer } from '@/utils/stats';
import type { ProgrammeOT } from '@/types';
import { errMsg } from '@/utils';

type Preset = 'semaine' | 'mois' | 'mois_dernier' | 'custom';
const iso = (d: Date) => d.toISOString().slice(0, 10);
function range(p: Preset, from: string, to: string): { from: string; to: string } {
  const now = new Date();
  if (p === 'semaine') {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: iso(monday), to: iso(now) };
  }
  if (p === 'mois') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1, 12)), to: iso(now) };
  if (p === 'mois_dernier')
    return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0, 12)) };
  return { from, to };
}
const MEDAL = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-300 text-orange-950'];

export default function PointsPage() {
  const equipes = useAppStore((s) => s.equipes);
  const { showToast } = useToast();
  const [preset, setPreset] = useState<Preset>('semaine');
  const [cFrom, setCFrom] = useState(() => iso(new Date(Date.now() - 6 * 86400000)));
  const [cTo, setCTo] = useState(() => iso(new Date()));
  const [nature, setNature] = useState<'all' | ProgrammeOT['nature']>('all');
  const [ots, setOts] = useState<ProgrammeOT[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { from, to } = range(preset, cFrom, cTo);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchPourPoints(from, to)
        .then(
          (rows) => alive && (setOts(rows), setError('')),
          (e) => alive && setError(errMsg(e)),
        )
        .finally(() => alive && setLoaded(true));
    load();
    const unsub = subscribeProgramme('points', load);
    return () => {
      alive = false;
      unsub();
    };
  }, [from, to]);

  const scoped = useMemo(() => ots.filter((o) => nature === 'all' || o.nature === nature), [ots, nature]);
  const rows = useMemo(() => classement(scoped), [scoped]);
  const maxPts = Math.max(1, ...rows.map((r) => r.points));
  const colorOf = (n: string) => equipes.find((e) => e.name.toLowerCase() === n.toLowerCase())?.color ?? '#94A3B8';
  const tot = rows.reduce(
    (a, r) => ({ faits: a.faits + r.faits, dans: a.dans + r.dans, retard: a.retard + r.retard, confies: a.confies + r.confiesEnRetard }),
    { faits: 0, dans: 0, retard: 0, confies: 0 },
  );

  const exportXlsx = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Classement');
      ws.addRow([`Points des équipes — du ${from.split('-').reverse().join('/')} au ${to.split('-').reverse().join('/')}`]).font = { bold: true, size: 13 };
      ws.addRow(['Installation : 48 h (2 jours ouvrés) · Dérangement : 24 h (1 jour ouvré) après « OT reçu le », ou après la remise à l’équipe si elle est plus tardive · dimanches et jours fériés non comptés']);
      ws.addRow([]);
      ws.addRow(['Rang', 'Équipe', 'Points', 'Points installation', 'Points dérangement', 'Fiches reçues', 'Faites', 'Dans le délai', 'Hors délai', '% dans le délai', 'En retard (à faire)', 'Non faites', 'Remises déjà en retard']).font = { bold: true };
      rows.forEach((r) => ws.addRow([r.rang, r.equipe, r.points, r.pointsInst, r.pointsDer, r.total, r.faits, r.dans, r.hors, r.pctDansDelai / 100, r.retard, r.nonFaits, r.confiesEnRetard]));
      ws.getColumn(10).numFmt = '0%';
      ws.columns.forEach((c, i) => (c.width = i === 1 ? 20 : 14));
      const wd = wb.addWorksheet('Détail');
      wd.addRow(['Équipe', 'Type', 'Ligne', 'Client', 'OT reçu le', 'Échéance officielle', 'Confié à l’équipe le', 'Échéance équipe', 'Remis déjà en retard', 'Statut', 'Fait le', 'Jours ouvrés (équipe)', 'Délai équipe', 'Points', 'Motif']).font = { bold: true };
      scoped.forEach((o) => {
        const d = delaiOT(o);
        wd.addRow([
          o.equipe,
          o.typeOt || NATURE_LABEL[o.nature],
          ligneLabel(o),
          o.clientNom,
          d.recuLe,
          d.echeanceOfficielle,
          d.confieLe ?? '',
          d.echeance,
          d.confieEnRetard ? 'Oui' : '',
          o.statut,
          o.traiteLe ? new Date(o.traiteLe).toLocaleString('fr-FR') : '',
          d.jours,
          ETAT_DELAI[d.etat].label,
          d.points,
          o.motif,
        ]);
      });
      wd.columns.forEach((c) => (c.width = 16));
      wd.views = [{ state: 'frozen', ySplit: 1 }];
      downloadWorkbookBuffer((await wb.xlsx.writeBuffer()) as ArrayBuffer, `points-equipes-${from}-${to}.xlsx`);
    } catch (e) {
      showToast('Export impossible — ' + errMsg(e), 'error');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Programme · respect des délais</p>
          <h1 className="text-2xl font-black text-slate-900">Points des équipes</h1>
        </div>
        <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={exportXlsx} disabled={!rows.length}>
          Exporter Excel
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {(
            [
              ['semaine', 'Cette semaine'],
              ['mois', 'Ce mois'],
              ['mois_dernier', 'Mois dernier'],
              ['custom', 'Dates'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPreset(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${preset === id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <input id="pts-from" type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1" />
              au
              <input id="pts-to" type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1" />
            </span>
          )}
          <span className="w-px h-5 bg-slate-200 mx-1" />
          {(
            [
              ['all', 'Tout'],
              ['installation', 'Installations'],
              ['derangement', 'Dérangements'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setNature(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${nature === id ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          <b>{POINTS.dansDelai} point</b> par fiche faite dans le délai, compté depuis la date « OT reçu le » de l’OT (ou depuis le jour où l’équipe a reçu la
          fiche, si c’est plus tard) jusqu’au moment où le chef marque « Fait » :
          installation <b>48 h</b> (2 jours ouvrés), dérangement <b>24 h</b> (1 jour ouvré). Dimanches et jours fériés non comptés. Période : fiches reçues du{' '}
          {from.split('-').reverse().join('/')} au {to.split('-').reverse().join('/')}.
        </p>
      </Card>

      {error && <Card className="p-4 text-sm text-red-700">{error}</Card>}
      {loaded && !error && rows.length === 0 && <Card className="py-12 text-center text-sm text-slate-400">Aucune fiche OT reçue sur cette période.</Card>}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-xs text-slate-500">Fiches faites</p>
              <p className="text-2xl font-black tabular-nums">{tot.faits}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Dans le délai</p>
              <p className="text-2xl font-black tabular-nums text-emerald-700">{tot.faits ? Math.round((tot.dans / tot.faits) * 100) : 0} %</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">En retard (à faire)</p>
              <p className={`text-2xl font-black tabular-nums ${tot.retard ? 'text-red-700' : ''}`}>{tot.retard}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500" title="Fiches remises à l’équipe alors que le délai officiel (depuis « OT reçu le ») était déjà dépassé : retard non compté à l’équipe">
                Remises déjà en retard
              </p>
              <p className={`text-2xl font-black tabular-nums ${tot.confies ? 'text-amber-700' : ''}`}>{tot.confies}</p>
            </Card>
          </div>

          <Card>
            {rows.map((r) => {
              const isOpen = open === r.equipe;
              const detail = isOpen
                ? scoped
                    .filter((o) => (o.equipe || 'Sans équipe') === r.equipe)
                    .map((o) => ({ o, d: delaiOT(o) }))
                    .sort((a, b) => a.d.echeance.localeCompare(b.d.echeance))
                : [];
              return (
                <div key={r.equipe} className="border-b border-slate-100 last:border-0">
                  <button onClick={() => setOpen(isOpen ? null : r.equipe)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
                    <span className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-black ${MEDAL[r.rang - 1] ?? 'bg-slate-100 text-slate-500'}`}>
                      {r.rang === 1 ? <Trophy className="w-4 h-4" /> : r.rang}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(r.equipe) }} />
                        <span className="font-bold text-slate-800 truncate">{r.equipe}</span>
                      </div>
                      <div className="mt-1.5 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.points / maxPts) * 100}%`, background: colorOf(r.equipe) }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {r.dans}/{r.faits} faites dans le délai ({r.pctDansDelai} %) · inst. {r.pointsInst} pt · dér. {r.pointsDer} pt
                        {r.hors ? ` · ${r.hors} hors délai` : ''}
                        {r.nonFaits ? ` · ${r.nonFaits} non faites` : ''}
                        {r.retard ? <b className="text-red-700"> · {r.retard} en retard</b> : ''}
                        {r.confiesEnRetard ? <span className="text-amber-700"> · {r.confiesEnRetard} remise{r.confiesEnRetard > 1 ? 's' : ''} déjà en retard</span> : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black tabular-nums text-slate-900">{r.points}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">points</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="bg-slate-50/70 border-t border-slate-100">
                      {detail.map(({ o, d }) => (
                        <div key={o.id} className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 last:border-0 text-sm">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${NATURE_CLASS[o.nature]}`}>{o.typeOt || NATURE_LABEL[o.nature]}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">
                              {ligneLabel(o)} · {o.clientNom}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              OT reçu {jourCourt(d.recuLe)}
                              {d.decale && d.confieLe ? ` · confié ${jourCourt(d.confieLe)}` : ''} · échéance équipe {jourCourt(d.echeance)}
                              {d.confieEnRetard ? ' (remis déjà en retard)' : ''}
                              {o.traiteLe ? ` · fait le ${new Date(o.traiteLe).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                              {o.statut === 'fait' ? ` · ${d.jours} j ouvré${d.jours > 1 ? 's' : ''}` : ''}
                            </p>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ETAT_DELAI[d.etat].cls}`}>{ETAT_DELAI[d.etat].label}</span>
                          <span className="w-10 text-right font-bold tabular-nums">{d.points ? `+${d.points}` : '0'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
