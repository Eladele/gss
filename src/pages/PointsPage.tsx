import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, SearchCheck, Trophy, Undo2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, useToast } from '@/components/ui';
import {
  annulerPenalite,
  fetchCloturesAVerifier,
  fetchPenalites,
  fetchPourPoints,
  rattraperControles,
  signalerFauxOk,
  subscribeProgramme,
} from '@/lib/programmeService';
import { FauxOkButton } from '@/components/programme/FauxOk';
import { ETAT_DELAI, POINTS, classement, delaiOT, fmtPts, fmtPtsSigne, jourCourt, motPoint } from '@/utils/points';
import { MOTIF_PENALITE, NATURE_CLASS, NATURE_LABEL, libelleFauxOk, ligneLabel, peutSignalerFauxOk, type MotifFauxOk } from '@/utils/programme';
import { downloadWorkbookBuffer } from '@/utils/stats';
import type { ClotureAVerifier, Penalite, ProgrammeOT } from '@/types';
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
  const user = useAppStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const peutSignaler = peutSignalerFauxOk(user?.role);
  const [aVerifier, setAVerifier] = useState<ClotureAVerifier[]>([]);
  const { showToast } = useToast();
  const [penalites, setPenalites] = useState<Penalite[]>([]);
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
      Promise.all([fetchPourPoints(from, to), fetchPenalites(from, to), fetchCloturesAVerifier()])
        .then(
          ([rows, pens, av]) => alive && (setOts(rows), setPenalites(pens), setAVerifier(av), setError('')),
          (e) => alive && setError(errMsg(e)),
        )
        .finally(() => alive && setLoaded(true));
    // un contrôle de 22 h manqué est rattrapé avant le calcul
    rattraperControles().finally(load);
    const unsub = subscribeProgramme('points', load);
    return () => {
      alive = false;
      unsub();
    };
  }, [from, to]);

  const scoped = useMemo(() => ots.filter((o) => nature === 'all' || o.nature === nature), [ots, nature]);
  const pensScoped = useMemo(() => penalites.filter((p) => nature === 'all' || p.nature === nature), [penalites, nature]);
  const rows = useMemo(() => classement(scoped, pensScoped), [scoped, pensScoped]);
  const maxPts = Math.max(1, ...rows.map((r) => r.points));
  /** Faux OK depuis « clôtures à vérifier » ou depuis le détail d'une équipe */
  const fauxOk = async (c: Pick<ClotureAVerifier, 'id' | 'equipe' | 'fgp' | 'typeLigne'>, motif: MotifFauxOk, note: string) => {
    if (!user) return;
    try {
      await signalerFauxOk(c.id, user, motif, note);
      // la fiche est rouverte (nouvelle échéance) et la pénalité est créée : on recharge
      const [rows2, pens2] = await Promise.all([fetchPourPoints(from, to), fetchPenalites(from, to)]);
      setOts(rows2);
      setPenalites(pens2);
      setAVerifier((cur) => cur.filter((x) => x.id !== c.id));
      showToast(`${ligneLabel(c)} : faux OK (${libelleFauxOk(motif, note)}) — ${fmtPts(POINTS.penalites.faux_ok)} pt pour ${c.equipe}, fiche rouverte`, 'warning');
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };
  const annuler = async (p: Penalite) => {
    try {
      await annulerPenalite(p.id);
      setPenalites((cur) => cur.filter((x) => x.id !== p.id));
      showToast(`Pénalité annulée (${p.equipe}, ${ligneLabel(p)})`, 'success');
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };
  const colorOf = (n: string) => equipes.find((e) => e.name.toLowerCase() === n.toLowerCase())?.color ?? '#94A3B8';
  const tot = rows.reduce(
    (a, r) => ({ faits: a.faits + r.faits, dans: a.dans + r.dans, retard: a.retard + r.retard, confies: a.confies + r.confiesEnRetard, penalites: a.penalites + r.penalites }),
    { faits: 0, dans: 0, retard: 0, confies: 0, penalites: 0 },
  );

  const exportXlsx = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Classement');
      ws.addRow([`Points des équipes — du ${from.split('-').reverse().join('/')} au ${to.split('-').reverse().join('/')}`]).font = { bold: true, size: 13 };
      ws.addRow(['Échéance de l’équipe à 22 h : dérangement le jour de la remise, installation le jour ouvré suivant, fiche prioritaire (délai officiel dépassé) le jour de la remise · dimanches et jours fériés non comptés']);
      ws.addRow([]);
      ws.addRow(['Rang', 'Équipe', 'Points', 'Points installation', 'Points dérangement', 'Pénalités (points)', 'Nombre de pénalités', 'Faux OK', 'Fiches reçues', 'Faites', 'Dans le délai', 'Hors délai', '% dans le délai', 'En retard (à faire)', 'Non faites', 'Prioritaires (remises hors délai)']).font = { bold: true };
      rows.forEach((r) => ws.addRow([r.rang, r.equipe, r.points, r.pointsInst, r.pointsDer, r.pointsPenalites, r.penalites, r.fauxOk, r.total, r.faits, r.dans, r.hors, r.pctDansDelai / 100, r.retard, r.nonFaits, r.confiesEnRetard]));
      ws.getColumn(13).numFmt = '0%';
      ws.columns.forEach((c, i) => (c.width = i === 1 ? 20 : 14));
      const wd = wb.addWorksheet('Détail');
      wd.addRow(['Équipe', 'Type', 'Ligne', 'Client', 'OT reçu le', 'Échéance officielle', 'Confié à l’équipe le', 'Échéance équipe', 'Prioritaire', 'Statut', 'Fait le', 'Jours ouvrés (équipe)', 'Délai équipe', 'Points', 'Motif']).font = { bold: true };
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
          d.prioritaire ? 'Oui' : '',
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
      const wp = wb.addWorksheet('Pénalités');
      wp.addRow(['Jour', 'Équipe', 'Motif', 'Détail', 'Points', 'Ligne', 'Client', 'N° OT', 'Par']).font = { bold: true };
      pensScoped.forEach((p) =>
        wp.addRow([p.jour, p.equipe, MOTIF_PENALITE[p.motif], p.motif === 'faux_ok' ? libelleFauxOk(p.motifFauxOk, p.note) : (p.note ?? ''), p.points, ligneLabel(p), p.clientNom, p.numeroOt, p.creeParNom ?? 'Contrôle de 22 h']),
      );
      wp.columns.forEach((c) => (c.width = 18));
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
          <b>{fmtPtsSigne(POINTS.dansDelai)} {motPoint(POINTS.dansDelai)}</b> par fiche marquée « Fait » avant son échéance de <b>22 h</b> : dérangement le jour où l’équipe l’a reçue,
          installation le jour ouvré suivant. Fiche <b>prioritaire</b> (délai officiel depuis « OT reçu le » déjà dépassé quand l’équipe la reçoit) : le
          jour même. Dimanches et jours fériés non comptés. Période : fiches reçues du{' '}
          {from.split('-').reverse().join('/')} au {to.split('-').reverse().join('/')}.
        </p>
        <p className="text-xs text-slate-500">
          Hors délai : <b>{fmtPtsSigne(POINTS.horsDelai)}</b> · « non fait » : <b>{fmtPtsSigne(POINTS.nonFait)}</b> · panne réseau (câble distribution ou
          transport coupé, HUB-BOX ou SUB-BOX défectueux) : points <b>× {fmtPts(POINTS.coefReseau)}</b>.{' '}
          <b className="text-red-700">{fmtPts(POINTS.penalites.non_traitee)} {motPoint(POINTS.penalites.non_traitee)}</b> par fiche ni faite ni « non faite » au contrôle de 22 h une fois son
          échéance arrivée (et à chaque contrôle suivant), <b className="text-red-700">{fmtPts(POINTS.penalites.retardee)}</b> quand une fiche ouverte est
          retardée. Réaffecter une fiche avant son échéance ne pénalise pas.{' '}
          <b className="text-red-700">Faux OK</b> (fiche marquée « Fait » à tort, signalée par l’admin ou le superviseur) : la fiche perd ses points et
          l’équipe prend <b className="text-red-700">{fmtPts(POINTS.penalites.faux_ok)}</b>, la fiche est rouverte.
        </p>
      </Card>

      {peutSignaler && aVerifier.length > 0 && (
        <Card className="border-amber-200">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60 flex items-start gap-2">
            <SearchCheck className="w-4 h-4 text-amber-700 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">
                {aVerifier.length} clôture{aVerifier.length > 1 ? 's' : ''} à vérifier
              </p>
              <p className="text-xs text-amber-800/80">
                Fiches marquées « Fait » ces 30 derniers jours qui semblent inexactes. Si c’est un faux OK : la fiche perd ses points, l’équipe prend{' '}
                {fmtPts(POINTS.penalites.faux_ok)} et la fiche est rouverte chez elle.
              </p>
            </div>
          </div>
          {aVerifier.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 text-sm">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${NATURE_CLASS[c.nature]}`}>{NATURE_LABEL[c.nature]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">
                  {ligneLabel(c)} · {c.clientNom} · <span className="font-normal text-slate-500">{c.equipe}</span>
                </p>
                <p className="text-[11px]">
                  <b className="text-amber-800">{c.raison}</b>
                  <span className="text-slate-500">
                    {' '}
                    · marquée Fait{c.traiteParNom ? ` par ${c.traiteParNom}` : ''}
                    {c.traiteLe ? ` le ${new Date(c.traiteLe).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
                  </span>
                </p>
              </div>
              <FauxOkButton compact onConfirm={(motif, note) => fauxOk(c, motif, note)} />
            </div>
          ))}
        </Card>
      )}

      {error && <Card className="p-4 text-sm text-red-700">{error}</Card>}
      {loaded && !error && rows.length === 0 && <Card className="py-12 text-center text-sm text-slate-400">Aucune fiche OT reçue sur cette période.</Card>}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
              <p className="text-xs text-slate-500" title="Fiches remises à l’équipe alors que le délai officiel (depuis « OT reçu le ») était déjà dépassé : à faire le jour même avant 22 h">
                Prioritaires
              </p>
              <p className={`text-2xl font-black tabular-nums ${tot.confies ? 'text-amber-700' : ''}`}>{tot.confies}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Pénalités</p>
              <p className={`text-2xl font-black tabular-nums ${tot.penalites ? 'text-red-700' : ''}`}>{tot.penalites}</p>
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
                        <div className="h-full rounded-full" style={{ width: `${(Math.max(0, r.points) / maxPts) * 100}%`, background: colorOf(r.equipe) }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {r.dans}/{r.faits} faites dans le délai ({r.pctDansDelai} %) · inst. {fmtPts(r.pointsInst)} pt · dér. {fmtPts(r.pointsDer)} pt
                        {r.penalites ? (
                          <b className="text-red-700">
                            {' '}
                            · {r.penalites} pénalité{r.penalites > 1 ? 's' : ''} ({fmtPts(r.pointsPenalites)} pt)
                            {r.fauxOk ? ` dont ${r.fauxOk} faux OK` : ''}
                          </b>
                        ) : (
                          ''
                        )}
                        {r.hors ? ` · ${r.hors} hors délai` : ''}
                        {r.nonFaits ? ` · ${r.nonFaits} non faites` : ''}
                        {r.retard ? <b className="text-red-700"> · {r.retard} en retard</b> : ''}
                        {r.confiesEnRetard ? <span className="text-amber-700"> · {r.confiesEnRetard} prioritaire{r.confiesEnRetard > 1 ? 's' : ''}</span> : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black tabular-nums ${r.points < 0 ? 'text-red-700' : 'text-slate-900'}`}>{fmtPts(r.points)}</p>
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
                              {d.prioritaire ? ' (prioritaire)' : ''}
                              {o.traiteLe ? ` · fait le ${new Date(o.traiteLe).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                              {o.statut === 'fait' ? ` · ${d.jours} j ouvré${d.jours > 1 ? 's' : ''}` : ''}
                            </p>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ETAT_DELAI[d.etat].cls}`}>{ETAT_DELAI[d.etat].label}</span>
                          {o.statut === 'fait' && peutSignaler && (
                            <FauxOkButton compact onConfirm={(motif, note) => fauxOk({ id: o.id, equipe: r.equipe, fgp: o.fgp, typeLigne: o.typeLigne }, motif, note)} />
                          )}
                          <span className="w-10 text-right font-bold tabular-nums" title={d.reseau ? 'Panne réseau : points × coefficient réseau' : undefined}>
                            {fmtPtsSigne(d.points)}
                          </span>
                        </div>
                      ))}
                      {pensScoped
                        .filter((p) => p.equipe === r.equipe)
                        .map((p) => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 last:border-0 text-sm bg-red-50/40">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Pénalité</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">
                                {ligneLabel(p)} · {p.clientNom}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {MOTIF_PENALITE[p.motif]}
                                {p.motif === 'faux_ok' ? (libelleFauxOk(p.motifFauxOk, p.note) ? ` : ${libelleFauxOk(p.motifFauxOk, p.note)}` : '') : p.note ? ` (${p.note})` : ''} ·{' '}
                                {jourCourt(p.jour)}
                                {p.creeParNom ? ` · par ${p.creeParNom}` : ' · contrôle automatique'}
                              </p>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => annuler(p)}
                                title="Annuler cette pénalité"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-700"
                              >
                                <Undo2 className="w-3.5 h-3.5" /> Annuler
                              </button>
                            )}
                            <span className="w-10 text-right font-bold tabular-nums text-red-700">{fmtPts(p.points)}</span>
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
