import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Copy, FileUp, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, Select, useToast } from '@/components/ui';
import { ZONE_EQUIPE_MAP } from '@/data';
import { parseOtPdf, programmeWhatsApp, type ParsedOT } from '@/utils/otPdf';
import { deleteOts, distribuer, existingNumeros, fetchProgramme, reassign, situationsOuvertes, subscribeProgramme } from '@/lib/programmeService';
import { NATURE_CLASS, NATURE_LABEL, STATUT_OT, fmtTel, ligneLabel } from '@/utils/programme';
import { ClotureResume } from '@/components/programme/OtCard';
import type { ProgrammeOT } from '@/types';
import { errMsg } from '@/utils';

type Item = ParsedOT & {
  key: string;
  equipe: string;
  sourceFichier: string;
  deja?: { equipe: string; date: string };
  existante?: { equipe: string; type: string }; // situation Excel ouverte que l'OT va compléter
  include: boolean;
};
type Row = Pick<ParsedOT, 'nature' | 'fgp' | 'clientNom' | 'telephones' | 'zone' | 'pco' | 'port' | 'ontSerials' | 'dis' | 'adresse' | 'sousType' | 'cableFibreM' | 'typeOt' | 'typeLigne'>;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const frDate = (iso: string) => iso.split('-').reverse().join('/');

async function shareWhatsApp(text: string, showToast: (m: string, t?: 'success' | 'error' | 'info') => void) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Programme copié : collez-le dans le groupe WhatsApp de l’équipe', 'success');
  } catch {
    showToast('Copie impossible sur cet appareil', 'error');
  }
}

function RowCells({ o }: { o: Row }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${NATURE_CLASS[o.nature]}`}>{NATURE_LABEL[o.nature]}</span>
          {o.typeOt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{o.typeOt}</span>}
          <span className="text-sm font-bold text-slate-800">{ligneLabel(o)}</span>
          <span className="text-sm text-slate-700 truncate">{o.clientNom}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="tabular-nums">{o.telephones.length ? o.telephones.map(fmtTel).join(' / ') : 'pas de téléphone'}</span>
          <span className="font-mono">
            {o.zone || '?'}
            {o.pco ? ` · ${o.pco}-${o.port}` : ''}
          </span>
          {o.ontSerials[0] && <span className="font-mono text-slate-400">ONT {o.ontSerials.join(' / ')}</span>}
          {o.nature === 'installation' && o.cableFibreM ? <span className="text-violet-700 font-semibold">Câble {o.cableFibreM} m</span> : null}
        </div>
      </div>
    </>
  );
}

export default function DistributionPage() {
  const user = useAppStore((s) => s.user)!;
  const equipes = useAppStore((s) => s.equipes);
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const zoneEquipe = useMemo(() => {
    const map: Record<string, string> = { ...ZONE_EQUIPE_MAP };
    equipes.forEach((eq) => (eq.zones ?? []).forEach((z) => z && (map[z.trim().toUpperCase()] = eq.name)));
    return map;
  }, [equipes]);
  const equipeNames = useMemo(() => equipes.map((e) => e.name).sort((a, b) => a.localeCompare(b)), [equipes]);
  const colorOf = (name: string) => equipes.find((e) => e.name.toLowerCase() === name.toLowerCase())?.color ?? '#94A3B8';

  // ─── Import ────────────────────────────────────────────────────────────
  const [dateProgramme, setDateProgramme] = useState(todayISO());
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const readFiles = async (files: FileList | File[]) => {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return showToast('Choisissez des fichiers PDF (OT dérangement ou installation)', 'error');
    setReading(true);
    try {
      const parsed: Item[] = [];
      for (const f of pdfs) {
        const ots = await parseOtPdf(f);
        ots.forEach((o, i) =>
          parsed.push({ ...o, key: `${f.name}-${i}-${o.numeroOt}`, sourceFichier: f.name, equipe: zoneEquipe[o.zone] ?? '', include: true }),
        );
      }
      // Même OT présent deux fois (deux PDF qui se recoupent) → une seule fiche
      const seen = new Set(items.map((i) => i.numeroOt));
      const fresh = parsed.filter((p) => p.numeroOt && !seen.has(p.numeroOt) && (seen.add(p.numeroOt), true));
      const [deja, ouvertes] = await Promise.all([existingNumeros(fresh.map((p) => p.numeroOt)), situationsOuvertes(fresh.map((p) => p.fgp))]);
      fresh.forEach((p) => {
        const d = deja.get(p.numeroOt);
        if (d) Object.assign(p, { deja: d, include: false });
        const ex = ouvertes.get(`${p.fgp}|${p.nature}`);
        if (ex && !d) Object.assign(p, { existante: { equipe: ex.equipe ?? '', type: ex.type }, equipe: p.equipe || ex.equipe || '' });
      });
      setItems((cur) => [...cur, ...fresh]);
      const nbDeja = fresh.filter((p) => p.deja).length;
      if (!parsed.length) showToast('Aucune fiche OT reconnue dans ce PDF', 'error');
      else showToast(`${fresh.length} fiche${fresh.length > 1 ? 's' : ''} lue${fresh.length > 1 ? 's' : ''}${nbDeja ? ` · ${nbDeja} déjà distribuée${nbDeja > 1 ? 's' : ''}` : ''}`, 'success');
    } catch (e) {
      showToast('Lecture du PDF impossible — ' + errMsg(e), 'error');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const update = (key: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const toSend = items.filter((i) => i.include && !i.deja);
  const missingTeam = toSend.filter((i) => !i.equipe);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((i) => m.set(i.equipe, [...(m.get(i.equipe) ?? []), i]));
    return [...m.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  }, [items]);

  const send = async () => {
    if (missingTeam.length) return showToast(`Choisissez une équipe pour ${missingTeam.length} fiche${missingTeam.length > 1 ? 's' : ''}`, 'error');
    setSending(true);
    try {
      const { crees, completees } = await distribuer(toSend, dateProgramme, user.name);
      const n = crees + completees;
      showToast(
        `${n} fiche${n > 1 ? 's' : ''} distribuée${n > 1 ? 's' : ''}${completees ? ` (dont ${completees} situation${completees > 1 ? 's' : ''} existante${completees > 1 ? 's' : ''} complétée${completees > 1 ? 's' : ''})` : ''} : les chefs d’équipe sont prévenus`,
        'success',
      );
      setItems([]);
      setHistDate(dateProgramme);
    } catch (e) {
      showToast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  };

  // ─── Programme déjà distribué ──────────────────────────────────────────
  const [histDate, setHistDate] = useState(todayISO());
  const [hist, setHist] = useState<ProgrammeOT[]>([]);
  const [histError, setHistError] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      fetchProgramme({ from: histDate, to: histDate }).then(
        (rows) => alive && (setHist(rows), setHistError('')),
        (e) => alive && setHistError(errMsg(e)),
      );
    refresh();
    const unsub = subscribeProgramme('distribution', refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, [histDate]);

  const histGroups = useMemo(() => {
    const m = new Map<string, ProgrammeOT[]>();
    hist.forEach((o) => m.set(o.equipe, [...(m.get(o.equipe) ?? []), o]));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [hist]);

  return (
    <div className="space-y-6 animate-fade-in pb-24 md:pb-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Raccordement · fiches OT Mauritel</p>
        <h1 className="text-2xl font-black text-slate-900">Distribuer le programme</h1>
        <p className="text-sm text-slate-500 mt-1">
          Importez les PDF « OT Dérangement » et « OT Réseau ». Chaque fiche part à l’équipe de sa zone avec le client, ses numéros, le DIS et l’ONT.
        </p>
      </div>

      {/* Zone d'import */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="prog-date" className="block text-xs font-semibold text-slate-500 mb-1.5">
              Programme du
            </label>
            <input
              id="prog-date"
              type="date"
              value={dateProgramme}
              onChange={(e) => setDateProgramme(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setItems([])}>
              Tout effacer
            </Button>
          )}
        </div>
        <label
          htmlFor="prog-files"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            readFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          }`}
        >
          <FileUp className="w-8 h-8 text-blue-600" />
          <span className="font-semibold text-slate-800">{reading ? 'Lecture des fiches…' : 'Choisir ou déposer les PDF'}</span>
          <span className="text-xs text-slate-500">Plusieurs fichiers possibles : dérangements et installations ensemble</span>
          <input
            ref={fileRef}
            id="prog-files"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            disabled={reading}
            onChange={(e) => e.target.files && readFiles(e.target.files)}
          />
        </label>
      </Card>

      {/* Aperçu par équipe */}
      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-900 text-white font-semibold">{items.length} fiches lues</span>
            <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-800 border border-orange-200 font-semibold">
              {items.filter((i) => i.nature === 'derangement').length} dérangements
            </span>
            <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
              {items.filter((i) => i.nature === 'installation').length} installations
            </span>
            {items.some((i) => i.deja) && (
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                {items.filter((i) => i.deja).length} déjà distribuées (ignorées)
              </span>
            )}
          </div>

          {groups.map(([equipe, list]) => {
            const active = list.filter((i) => i.include && !i.deja);
            return (
              <Card key={equipe || 'none'} className={equipe ? '' : 'border-amber-300'}>
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: equipe ? colorOf(equipe) : '#F59E0B' }} />
                    <span className="font-bold text-slate-800">{equipe || 'Sans équipe — zone non attribuée'}</span>
                    <span className="text-xs text-slate-500">
                      {active.filter((i) => i.nature === 'derangement').length} dér. · {active.filter((i) => i.nature === 'installation').length} inst.
                    </span>
                  </div>
                  {equipe && active.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<MessageCircle className="w-4 h-4" />}
                      onClick={() => shareWhatsApp(programmeWhatsApp(equipe, dateProgramme, active), showToast)}
                    >
                      Copier pour WhatsApp
                    </Button>
                  )}
                </div>
                {list.map((i) => (
                  <div key={i.key} className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 ${!i.include || i.deja ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      aria-label={`Inclure FGP ${i.fgp}`}
                      checked={i.include && !i.deja}
                      disabled={!!i.deja}
                      onChange={(e) => update(i.key, { include: e.target.checked })}
                    />
                    <RowCells o={i} />
                    <div className="flex flex-col items-end gap-1">
                      {i.deja ? (
                        <span className="text-[11px] text-slate-500">
                          Déjà envoyé à {i.deja.equipe || '?'} le {frDate(i.deja.date)}
                        </span>
                      ) : (
                        <Select aria-label="Équipe" className="!py-1 !text-xs" value={i.equipe} onChange={(e) => update(i.key, { equipe: e.target.value })}>
                          <option value="">— Équipe —</option>
                          {equipeNames.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      )}
                      {i.existante && !i.deja && (
                        <span className="text-[11px] text-blue-700" title="Une situation ouverte de ce FGP existe déjà (import Excel) : l’OT la complète au lieu d’en créer une nouvelle">
                          Complète la situation existante{i.existante.equipe ? ` (${i.existante.equipe})` : ''}
                        </span>
                      )}
                      {i.warnings.length > 0 && !i.deja && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title={i.warnings.join(', ')}>
                          <AlertTriangle className="w-3 h-3" /> {i.warnings[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}

          <div className="sticky bottom-16 md:bottom-4 z-10 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {missingTeam.length > 0 ? (
                <span className="text-amber-700 font-semibold">
                  {missingTeam.length} fiche{missingTeam.length > 1 ? 's' : ''} sans équipe : choisissez-la avant d’envoyer.
                </span>
              ) : (
                <>
                  <b>{toSend.length}</b> fiche{toSend.length > 1 ? 's' : ''} pour le <b>{frDate(dateProgramme)}</b> · chaque chef sera notifié
                </>
              )}
            </p>
            <Button icon={<Send className="w-4 h-4" />} disabled={!toSend.length || sending || missingTeam.length > 0} onClick={send}>
              {sending ? 'Envoi…' : `Distribuer ${toSend.length} fiche${toSend.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Suivi du programme distribué */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-black text-slate-900">Suivi du programme</h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <CalendarDays className="w-4 h-4" />
            <input
              id="hist-date"
              type="date"
              value={histDate}
              onChange={(e) => setHistDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-500"
            />
          </label>
        </div>
        {histError && <Card className="p-4 text-sm text-red-700">{histError}</Card>}
        {!histError && hist.length === 0 && (
          <Card className="py-10 text-center text-sm text-slate-400">Aucune fiche distribuée pour le {frDate(histDate)}.</Card>
        )}
        {histGroups.map(([equipe, list]) => {
          const n = (s: ProgrammeOT['statut']) => list.filter((o) => o.statut === s).length;
          const pct = Math.round((n('fait') / list.length) * 100);
          return (
            <Card key={equipe || 'none'}>
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-3 h-3 rounded-full" style={{ background: colorOf(equipe) }} />
                  <span className="font-bold text-slate-800">{equipe || 'Sans équipe'}</span>
                  <span className="text-xs text-slate-500">
                    {n('fait')}/{list.length} faits ({pct}%) · {n('non_fait')} non faits · {n('a_faire')} à faire
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Copy className="w-4 h-4" />}
                  onClick={() => shareWhatsApp(programmeWhatsApp(equipe, histDate, list.filter((o) => o.statut === 'a_faire')), showToast)}
                >
                  WhatsApp (à faire)
                </Button>
              </div>
              <div className="h-1 bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              {list.map((o) => (
                <div key={o.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex">
                      <RowCells o={o} />
                    </div>
                    {o.statut !== 'a_faire' && <ClotureResume ot={o} />}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUT_OT[o.statut].cls}`}>{STATUT_OT[o.statut].label}</span>

                    {o.statut === 'a_faire' && (
                      <div className="flex items-center gap-1">
                        <Select
                          aria-label="Réaffecter"
                          className="!py-1 !text-xs"
                          value={o.equipe}
                          onChange={async (e) => {
                            try {
                              await reassign([o.id], e.target.value);
                              showToast(`${ligneLabel(o)} envoyé à ${e.target.value}`, 'success');
                            } catch (err) {
                              showToast(errMsg(err), 'error');
                            }
                          }}
                        >
                          {!equipeNames.includes(o.equipe) && <option value={o.equipe}>{o.equipe || '—'}</option>}
                          {equipeNames.map((nm) => (
                            <option key={nm} value={nm}>
                              {nm}
                            </option>
                          ))}
                        </Select>
                        <button
                          aria-label="Retirer du programme"
                          title={armed === o.id ? 'Cliquer encore pour confirmer' : 'Retirer du programme'}
                          onClick={async () => {
                            if (armed !== o.id) return setArmed(o.id);
                            try {
                              await deleteOts([o.id]);
                              setArmed(null);
                              showToast('Fiche retirée du programme', 'info');
                            } catch (err) {
                              showToast(errMsg(err), 'error');
                            }
                          }}
                          className={`p-1.5 rounded-md ${armed === o.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-red-700 hover:bg-red-50'}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
