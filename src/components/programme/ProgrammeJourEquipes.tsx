import { Fragment, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, CircleDashed, MapPin, Search, XCircle } from 'lucide-react';
import type { ProgrammeOT } from '@/types';
import { delaiOT, estPourPlusTard, fmtPtsSigne, jourCourt, jourRemise } from '@/utils/points';
import { NATURE_CLASS, NATURE_LABEL, ligneLabel, type MotifFauxOk } from '@/utils/programme';
import { isoJour } from '@/utils/surveillance';
import { FauxOkButton } from '@/components/programme/FauxOk';

type Filtre = 'tout' | 'fait' | 'non_fait' | 'a_faire' | 'demain';
const FILTRES: { id: Filtre; label: string }[] = [
  { id: 'tout', label: 'Toutes' },
  { id: 'fait', label: 'Faites' },
  { id: 'non_fait', label: 'Non faites' },
  { id: 'a_faire', label: 'En cours' },
  { id: 'demain', label: 'Demain' },
];

const ORDRE: Record<ProgrammeOT['statut'], number> = { a_faire: 0, non_fait: 1, fait: 2 };
const zoneDe = (o: ProgrammeOT) => o.zone?.trim() || 'Sans zone';
const heure = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

function Statut({ o, retard, demain }: { o: ProgrammeOT; retard: boolean; demain?: boolean }) {
  if (demain)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
        <CalendarClock className="w-3.5 h-3.5" /> {jourCourt(jourRemise(o.assigneLe, o.dateProgramme))}
      </span>
    );
  if (o.statut === 'fait')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5" /> Fait
      </span>
    );
  if (o.statut === 'non_fait')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5" /> Non fait
      </span>
    );
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
        retard ? 'bg-red-600 text-white border-red-600' : 'bg-sky-50 text-sky-800 border-sky-200'
      }`}
    >
      <CircleDashed className="w-3.5 h-3.5" /> {retard ? 'En retard' : 'En cours'}
    </span>
  );
}

/** En-tête de zone dans le programme d'une équipe : « CA3Z05 · 3 faites · 1 non faite · 2 en cours » */
function ZoneTitre({ zone, z }: { zone: string; z?: { fait: number; non_fait: number; a_faire: number } }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <MapPin className="w-3.5 h-3.5 text-slate-500" />
      <b className="text-slate-800 tracking-wide">{zone}</b>
      {z && (
        <span className="text-slate-500">
          <span className="text-emerald-700 font-semibold">{z.fait} faite{z.fait > 1 ? 's' : ''}</span> ·{' '}
          <span className="text-red-700 font-semibold">{z.non_fait} non faite{z.non_fait > 1 ? 's' : ''}</span> ·{' '}
          <span className={z.a_faire === 1 ? 'text-amber-700 font-bold' : 'text-sky-700 font-semibold'}>
            {z.a_faire} en cours{z.a_faire === 1 && z.fait + z.non_fait > 0 ? ' (dernière fiche)' : ''}
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Programme du jour de chaque équipe, pour le superviseur : une ligne par fiche avec le FGP, le
 * client, le motif et l'état (fait, non fait, en cours), regroupée par équipe.
 *   • fiches clôturées ce jour-là ;
 *   • si le jour choisi est aujourd'hui : aussi toutes les fiches encore ouvertes.
 */
export function ProgrammeJourEquipes({
  ots,
  jour,
  enCours,
  couleur,
  peutSignaler,
  onFauxOk,
}: {
  ots: ProgrammeOT[];
  jour: string;
  enCours: boolean;
  couleur: (equipe: string) => string;
  peutSignaler: boolean;
  onFauxOk: (o: ProgrammeOT, motif: MotifFauxOk, note: string) => Promise<void>;
}) {
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [q, setQ] = useState('');
  const [fermees, setFermees] = useState<Set<string>>(new Set());

  const groupes = useMemo(() => {
    const recherche = q.trim().toLowerCase();
    const m = new Map<string, { o: ProgrammeOT; d: ReturnType<typeof delaiOT>; demain: boolean }[]>();
    for (const o of ots) {
      if (!o.equipe) continue;
      const duJour = o.statut === 'a_faire' ? enCours : !!o.traiteLe && isoJour(new Date(o.traiteLe)) === jour;
      if (!duJour) continue;
      let l = m.get(o.equipe);
      if (!l) m.set(o.equipe, (l = []));
      l.push({ o, d: delaiOT(o), demain: estPourPlusTard(o, jour) });
    }
    return [...m.entries()]
      .map(([equipe, toutes]) => {
        const nb = { fait: 0, non_fait: 0, a_faire: 0, retard: 0, demain: 0 };
        let points = 0;
        for (const { o, d, demain } of toutes) {
          if (demain) {
            nb.demain++;
            continue;
          }
          nb[o.statut]++;
          if (o.statut === 'a_faire' && d.etat === 'retard') nb.retard++;
          if (o.statut !== 'a_faire') points += d.points;
        }
        const lignes = toutes
          .filter(({ o, demain }) => filtre === 'tout' || (filtre === 'demain' ? demain : !demain && o.statut === filtre))
          .filter(({ o }) => !recherche || [o.fgp, o.clientNom, o.motif, o.numeroOt, o.zone, o.pco].join(' ').toLowerCase().includes(recherche))
          .sort(
            (a, b) =>
              zoneDe(a.o).localeCompare(zoneDe(b.o)) ||
              Number(a.demain) - Number(b.demain) ||
              ORDRE[a.o.statut] - ORDRE[b.o.statut] ||
              Number(b.d.etat === 'retard') - Number(a.d.etat === 'retard') ||
              (a.o.traiteLe ?? a.d.echeance).localeCompare(b.o.traiteLe ?? b.d.echeance),
          );
        // par zone : fiches faites / non faites / en cours (sans celles de demain)
        const zones = new Map<string, { fait: number; non_fait: number; a_faire: number }>();
        for (const { o, demain } of toutes) {
          if (demain) continue;
          const z = zones.get(zoneDe(o)) ?? { fait: 0, non_fait: 0, a_faire: 0 };
          z[o.statut]++;
          zones.set(zoneDe(o), z);
        }
        return { equipe, nb, points, total: toutes.length, lignes, zones };
      })
      .sort((a, b) => a.equipe.localeCompare(b.equipe));
  }, [ots, jour, enCours, filtre, q]);

  const basculer = (e: string) =>
    setFermees((cur) => {
      const n = new Set(cur);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-slate-800 text-sm sm:text-base mr-auto">Programme du {jourCourt(jour)} par équipe</h2>
        <div className="inline-flex rounded-full bg-slate-100 p-0.5 overflow-x-auto max-w-full">
          {FILTRES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltre(f.id)}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap ${filtre === f.id ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="FGP, client, motif…"
            aria-label="Rechercher une fiche"
            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-200"
          />
        </label>
      </div>

      {groupes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucune fiche pour ce jour.</p>}

      {groupes.map((g) => {
        const ouvert = !fermees.has(g.equipe);
        return (
          <section key={g.equipe} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button type="button" onClick={() => basculer(g.equipe)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 sm:px-4 py-2.5 text-left hover:bg-slate-50">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: couleur(g.equipe) }} />
              <span className="font-bold text-slate-900">{g.equipe}</span>
              <span className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                <span className="text-emerald-700 font-semibold">{g.nb.fait} faite{g.nb.fait > 1 ? 's' : ''}</span>
                <span className="text-red-700 font-semibold">{g.nb.non_fait} non faite{g.nb.non_fait > 1 ? 's' : ''}</span>
                {enCours && (
                  <span className="text-sky-700 font-semibold">
                    {g.nb.a_faire} en cours{g.nb.retard ? ` (${g.nb.retard} en retard)` : ''}
                  </span>
                )}
                {g.nb.demain > 0 && <span className="text-indigo-700 font-semibold">{g.nb.demain} pour demain</span>}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <span className={`font-black tabular-nums ${g.points > 0 ? 'text-emerald-700' : g.points < 0 ? 'text-red-700' : 'text-slate-400'}`}>{fmtPtsSigne(g.points)} pt</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition ${ouvert ? 'rotate-180' : ''}`} />
              </span>
            </button>

            {ouvert && g.lignes.length === 0 && <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">Aucune fiche pour ce filtre.</p>}

            {ouvert && g.lignes.length > 0 && (
              <>
                {/* ordinateur : tableau */}
                <table className="hidden md:table w-full text-sm border-t border-slate-100">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/70">
                      <th className="text-left font-semibold px-4 py-1.5">FGP</th>
                      <th className="text-left font-semibold px-2 py-1.5">Client</th>
                      <th className="text-left font-semibold px-2 py-1.5">Nature</th>
                      <th className="text-left font-semibold px-2 py-1.5">État</th>
                      <th className="text-left font-semibold px-2 py-1.5">Motif</th>
                      <th className="text-left font-semibold px-2 py-1.5">Heure</th>
                      <th className="text-right font-semibold px-2 py-1.5">Pts</th>
                      {peutSignaler && <th className="px-2 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.lignes.map(({ o, d, demain }, i) => (
                      <Fragment key={o.id}>
                        {(i === 0 || zoneDe(g.lignes[i - 1].o) !== zoneDe(o)) && (
                          <tr className="bg-slate-100/80">
                            <td colSpan={peutSignaler ? 8 : 7} className="px-4 py-1.5 text-xs">
                              <ZoneTitre zone={zoneDe(o)} z={g.zones.get(zoneDe(o))} />
                            </td>
                          </tr>
                        )}
                        <tr className={o.statut === 'a_faire' && !demain && d.etat === 'retard' ? 'bg-red-50/40' : ''}>
                          <td className="px-4 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {ligneLabel(o)}
                            {o.isUrgent && <span className="ml-1.5 text-[10px] font-sans font-bold text-orange-700">URGENT</span>}
                          </td>
                          <td className="px-2 py-2 text-slate-700 max-w-[12rem] truncate">{o.clientNom}</td>
                          <td className="px-2 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${NATURE_CLASS[o.nature]}`}>{NATURE_LABEL[o.nature]}</span>
                          </td>
                          <td className="px-2 py-2">
                            <Statut o={o} retard={d.etat === 'retard'} demain={demain} />
                            {o.id.startsWith('h:') && <span className="ml-1 text-[10px] font-semibold text-amber-700" title="Non faite ce jour-là, puis renvoyée pour la refaire">renvoyée</span>}
                          </td>
                          <td className="px-2 py-2 text-slate-700 max-w-[16rem]">
                            {o.statut === 'a_faire' ? (
                              <span className="text-xs text-slate-400">échéance {jourCourt(d.echeance)} 22 h</span>
                            ) : (
                              o.motif || <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-500 tabular-nums">{heure(o.traiteLe)}</td>
                          <td className={`px-2 py-2 text-right font-bold tabular-nums ${d.points > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {o.statut === 'a_faire' ? '' : fmtPtsSigne(d.points)}
                          </td>
                          {peutSignaler && (
                            <td className="px-2 py-2 text-right">{o.statut === 'fait' && <FauxOkButton compact onConfirm={(m, n) => onFauxOk(o, m, n)} />}</td>
                          )}
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>

                {/* téléphone : liste */}
                <ul className="md:hidden divide-y divide-slate-100 border-t border-slate-100">
                  {g.lignes.map(({ o, d, demain }, i) => (
                    <Fragment key={o.id}>
                      {(i === 0 || zoneDe(g.lignes[i - 1].o) !== zoneDe(o)) && (
                        <li className="px-3 py-1.5 bg-slate-100/80 text-xs">
                          <ZoneTitre zone={zoneDe(o)} z={g.zones.get(zoneDe(o))} />
                        </li>
                      )}
                      <li className={`px-3 py-2.5 ${o.statut === 'a_faire' && !demain && d.etat === 'retard' ? 'bg-red-50/40' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-sm truncate">{ligneLabel(o)}</span>
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border shrink-0 ${NATURE_CLASS[o.nature]}`}>{NATURE_LABEL[o.nature].slice(0, 3).toUpperCase()}</span>
                          <span className="ml-auto shrink-0">
                            <Statut o={o} retard={d.etat === 'retard'} demain={demain} />
                            {o.id.startsWith('h:') && <span className="ml-1 text-[10px] font-semibold text-amber-700" title="Non faite ce jour-là, puis renvoyée pour la refaire">renvoyée</span>}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <p className="text-xs text-slate-600 truncate flex-1">
                            {o.clientNom}
                            {o.statut === 'a_faire' ? ` · échéance ${jourCourt(d.echeance)} 22 h` : o.motif ? ` · ${o.motif}` : ''}
                          </p>
                          {o.statut !== 'a_faire' && (
                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                              {heure(o.traiteLe)} · <b className={d.points > 0 ? 'text-emerald-700' : 'text-slate-400'}>{fmtPtsSigne(d.points)}</b>
                            </span>
                          )}
                        </div>
                        {peutSignaler && o.statut === 'fait' && (
                          <div className="mt-1 flex justify-end">
                            <FauxOkButton compact onConfirm={(m, n) => onFauxOk(o, m, n)} />
                          </div>
                        )}
                      </li>
                    </Fragment>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
