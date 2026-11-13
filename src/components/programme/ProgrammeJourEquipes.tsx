import { Fragment, useMemo, useState } from 'react';
import { ArrowRightLeft, CalendarClock, CheckCircle2, ChevronDown, CircleDashed, MapPin, RotateCcw, Search, X, XCircle } from 'lucide-react';
import type { ProgrammeOT, SituationType } from '@/types';
import { TypeBadge } from '@/components/ui';
import { delaiOT, estPourPlusTard, fmtPtsSigne, jourCourt, jourOuvreSuivant, jourRemise } from '@/utils/points';
import { ligneLabel, type MotifFauxOk } from '@/utils/programme';
import { isoJour } from '@/utils/surveillance';
import { FauxOkButton } from '@/components/programme/FauxOk';

/** Type d'OT (DRG, CPL, CLS, TRL, RLR, CST, ANS) ; à défaut, d'après la nature */
const typeDe = (o: ProgrammeOT) => (o.typeOt || (o.nature === 'derangement' ? 'DRG' : 'INST')).toUpperCase();

type Filtre = 'tout' | 'fait' | 'non_fait' | 'a_faire' | 'reportee' | 'demain';
const FILTRES: { id: Filtre; label: string }[] = [
  { id: 'tout', label: 'Toutes' },
  { id: 'fait', label: 'Faites' },
  { id: 'non_fait', label: 'Non faites' },
  { id: 'a_faire', label: 'En cours' },
  { id: 'reportee', label: 'Reportées' },
  { id: 'demain', label: 'Plus tard' },
];

const ORDRE: Record<ProgrammeOT['statut'], number> = { a_faire: 0, non_fait: 1, fait: 2 };
const zoneDe = (o: ProgrammeOT) => o.zone?.trim() || 'Sans zone';
const aujourdhui = () => isoJour(new Date());

type Ligne = { o: ProgrammeOT; d: ReturnType<typeof delaiOT>; demain: boolean; reportee: boolean; renvoyee: boolean };

function Statut({ l }: { l: Ligne }) {
  const { o, d, demain, reportee } = l;
  const pill = 'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap';
  if (demain)
    return (
      <span className={`${pill} bg-indigo-50 text-indigo-800 border-indigo-200`}>
        <CalendarClock className="w-3.5 h-3.5" /> {jourCourt(jourRemise(o.assigneLe, o.dateProgramme))}
      </span>
    );
  if (o.statut === 'fait')
    return (
      <span className={`${pill} bg-emerald-50 text-emerald-800 border-emerald-200`}>
        <CheckCircle2 className="w-3.5 h-3.5" /> Fait{d.etat === 'hors' ? ' hors délai' : ''}
      </span>
    );
  if (o.statut === 'non_fait')
    return (
      <span className={`${pill} bg-red-50 text-red-800 border-red-200`}>
        <XCircle className="w-3.5 h-3.5" /> Non fait{l.renvoyee ? ' · renvoyée' : ''}
      </span>
    );
  if (reportee)
    return (
      <span className={`${pill} bg-orange-50 text-orange-800 border-orange-300`} title="Pas traitée à son échéance : reportée au programme de ce jour">
        <RotateCcw className="w-3.5 h-3.5" /> Reportée ({jourCourt(d.echeance)})
      </span>
    );
  const retard = d.etat === 'retard';
  return (
    <span className={`${pill} ${retard ? 'bg-red-600 text-white border-red-600' : 'bg-sky-50 text-sky-800 border-sky-200'}`}>
      <CircleDashed className="w-3.5 h-3.5" /> {retard ? 'En retard' : 'En cours'}
    </span>
  );
}

/** En-tête de zone : « CA3Z05 · 3 faites · 1 non faite · 2 en cours » */
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
 * Programme d'un jour pour le superviseur, regroupé par équipe puis par zone : FGP, état, motif.
 *   • fiches clôturées ce jour-là (faites / non faites, y compris celles renvoyées depuis) ;
 *   • jour en cours ou à venir : fiches ouvertes à faire ce jour-là, dont les « reportées »
 *     (pas traitées à leur échéance, par ex. après le contrôle de 22 h : elles passent au
 *     programme du lendemain) ;
 *   • sélection de fiches → réaffecter (en cours) ou renvoyer (non faites) à une équipe.
 */
export function ProgrammeJourEquipes({
  ots,
  jour,
  enCours,
  couleur,
  peutSignaler,
  onFauxOk,
  equipeNames,
  onReaffecter,
  onRenvoyer,
}: {
  ots: ProgrammeOT[];
  jour: string;
  enCours: boolean;
  couleur: (equipe: string) => string;
  peutSignaler: boolean;
  onFauxOk: (o: ProgrammeOT, motif: MotifFauxOk, note: string) => Promise<void>;
  equipeNames: string[];
  onReaffecter: (ids: string[], equipe: string) => Promise<void>;
  onRenvoyer: (ids: string[], equipe: string, date: string) => Promise<void>;
}) {
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [q, setQ] = useState('');
  const [fermees, setFermees] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cible, setCible] = useState('');
  const [dateRenvoi, setDateRenvoi] = useState(() => (jour > aujourdhui() ? jour : aujourdhui()));
  const [busy, setBusy] = useState(false);

  const groupes = useMemo(() => {
    const recherche = q.trim().toLowerCase();
    const m = new Map<string, Ligne[]>();
    for (const o of ots) {
      if (!o.equipe) continue;
      const duJour = o.statut === 'a_faire' ? enCours : !!o.traiteLe && isoJour(new Date(o.traiteLe)) === jour;
      if (!duJour) continue;
      const d = delaiOT(o);
      const demain = estPourPlusTard(o, jour);
      // ouverte, échéance passée avant ce jour (jour à venir) : reportée au programme de ce jour
      const reportee = o.statut === 'a_faire' && !demain && jour > aujourdhui() && d.echeance < jour;
      const l = m.get(o.equipe) ?? [];
      l.push({ o, d, demain, reportee, renvoyee: o.id.startsWith('h:') });
      m.set(o.equipe, l);
    }
    return [...m.entries()]
      .map(([equipe, toutes]) => {
        const nb = { fait: 0, non_fait: 0, a_faire: 0, retard: 0, demain: 0, reportee: 0 };
        let points = 0;
        const zones = new Map<string, { fait: number; non_fait: number; a_faire: number }>();
        for (const l of toutes) {
          if (l.demain) {
            nb.demain++;
            continue;
          }
          nb[l.o.statut]++;
          if (l.reportee) nb.reportee++;
          else if (l.o.statut === 'a_faire' && l.d.etat === 'retard') nb.retard++;
          if (l.o.statut !== 'a_faire') points += l.d.points;
          const z = zones.get(zoneDe(l.o)) ?? { fait: 0, non_fait: 0, a_faire: 0 };
          z[l.o.statut]++;
          zones.set(zoneDe(l.o), z);
        }
        const lignes = toutes
          .filter(
            (l) =>
              filtre === 'tout' ||
              (filtre === 'demain' ? l.demain : filtre === 'reportee' ? l.reportee : !l.demain && l.o.statut === filtre),
          )
          .filter((l) => !recherche || [typeDe(l.o), l.o.fgp, l.o.motif, l.o.clientNom, l.o.numeroOt].join(' ').toLowerCase().includes(recherche))
          .sort(
            (a, b) =>
              zoneDe(a.o).localeCompare(zoneDe(b.o)) ||
              Number(a.demain) - Number(b.demain) ||
              ORDRE[a.o.statut] - ORDRE[b.o.statut] ||
              Number(b.reportee || b.d.etat === 'retard') - Number(a.reportee || a.d.etat === 'retard') ||
              (a.o.traiteLe ?? a.d.echeance).localeCompare(b.o.traiteLe ?? b.d.echeance),
          );
        return { equipe, nb, points, lignes, zones };
      })
      .sort((a, b) => a.equipe.localeCompare(b.equipe));
  }, [ots, jour, enCours, filtre, q]);

  // sélection : fiches ouvertes (à réaffecter) et non faites encore actuelles (à renvoyer)
  const toutes = groupes.flatMap((g) => g.lignes);
  const choisies = toutes.filter((l) => sel.has(l.o.id));
  const aReaffecter = choisies.filter((l) => l.o.statut === 'a_faire').map((l) => l.o.id);
  const aRenvoyer = choisies.filter((l) => l.o.statut === 'non_fait' && !l.renvoyee).map((l) => l.o.id);
  const selectionnable = (l: Ligne) => (l.o.statut === 'a_faire' || (l.o.statut === 'non_fait' && !l.renvoyee)) && !l.o.id.startsWith('h:');
  const basculerSel = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const choisirEquipe = (lignes: Ligne[]) =>
    setSel((cur) => {
      const ids = lignes.filter(selectionnable).map((l) => l.o.id);
      const tous = ids.every((id) => cur.has(id));
      const n = new Set(cur);
      ids.forEach((id) => (tous ? n.delete(id) : n.add(id)));
      return n;
    });
  const agir = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
      setSel(new Set());
    } catch {
      /* erreur affichée par la page */
    } finally {
      setBusy(false);
    }
  };

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
        <label className="relative w-full sm:w-52">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="FGP, motif…"
            aria-label="Rechercher une fiche"
            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-200"
          />
        </label>
      </div>

      {/* Barre d'actions sur la sélection */}
      {peutSignaler && choisies.length > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/95 backdrop-blur px-3 py-2 shadow-sm">
          <span className="text-xs font-bold text-blue-900">
            {choisies.length} fiche{choisies.length > 1 ? 's' : ''} choisie{choisies.length > 1 ? 's' : ''}
          </span>
          <select
            aria-label="Équipe de destination"
            value={cible}
            onChange={(e) => setCible(e.target.value)}
            className="border border-blue-200 rounded-md px-2 py-1 text-xs bg-white"
          >
            <option value="">— Équipe —</option>
            {equipeNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {aReaffecter.length > 0 && (
            <button
              type="button"
              disabled={!cible || busy}
              onClick={() => agir(() => onReaffecter(aReaffecter, cible))}
              className="inline-flex items-center gap-1 text-xs font-bold rounded-md px-2.5 py-1.5 bg-blue-600 text-white disabled:opacity-40"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> Réaffecter {aReaffecter.length} en cours
            </button>
          )}
          {aRenvoyer.length > 0 && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                aria-label="Jour du renvoi"
                min={aujourdhui()}
                value={dateRenvoi}
                onChange={(e) => e.target.value && setDateRenvoi(e.target.value)}
                className="border border-blue-200 rounded-md px-2 py-1 text-xs bg-white"
              />
              <button type="button" onClick={() => setDateRenvoi(jourOuvreSuivant(aujourdhui()))} className="text-[11px] font-semibold text-blue-700 px-1">
                demain
              </button>
              <button
                type="button"
                disabled={!cible || busy}
                onClick={() => agir(() => onRenvoyer(aRenvoyer, cible, dateRenvoi))}
                className="inline-flex items-center gap-1 text-xs font-bold rounded-md px-2.5 py-1.5 bg-indigo-600 text-white disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Renvoyer {aRenvoyer.length} non faite{aRenvoyer.length > 1 ? 's' : ''}
              </button>
            </span>
          )}
          <button type="button" onClick={() => setSel(new Set())} className="ml-auto p-1 rounded-full text-blue-700 hover:bg-blue-100" aria-label="Vider la sélection">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {groupes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucune fiche pour ce jour.</p>}

      {groupes.map((g) => {
        const ouvert = !fermees.has(g.equipe);
        const choix = g.lignes.filter(selectionnable);
        return (
          <section key={g.equipe} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 sm:px-4 py-2.5 hover:bg-slate-50">
              {peutSignaler && choix.length > 0 && (
                <input
                  type="checkbox"
                  aria-label={`Choisir les fiches de ${g.equipe}`}
                  checked={choix.every((l) => sel.has(l.o.id))}
                  onChange={() => choisirEquipe(g.lignes)}
                />
              )}
              <button type="button" onClick={() => basculer(g.equipe)} className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left min-w-0">
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
                  {g.nb.reportee > 0 && <span className="text-orange-700 font-semibold">{g.nb.reportee} reportée{g.nb.reportee > 1 ? 's' : ''}</span>}
                  {g.nb.demain > 0 && <span className="text-indigo-700 font-semibold">{g.nb.demain} plus tard</span>}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span className={`font-black tabular-nums ${g.points > 0 ? 'text-emerald-700' : g.points < 0 ? 'text-red-700' : 'text-slate-400'}`}>{fmtPtsSigne(g.points)} pt</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition ${ouvert ? 'rotate-180' : ''}`} />
                </span>
              </button>
            </div>

            {ouvert && g.lignes.length === 0 && <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">Aucune fiche pour ce filtre.</p>}

            {ouvert && g.lignes.length > 0 && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {g.lignes.map((l, i) => {
                  const { o } = l;
                  const nouvelleZone = i === 0 || zoneDe(g.lignes[i - 1].o) !== zoneDe(o);
                  return (
                    <Fragment key={o.id}>
                      {nouvelleZone && (
                        <li className="px-3 sm:px-4 py-1.5 bg-slate-100/80 text-xs">
                          <ZoneTitre zone={zoneDe(o)} z={g.zones.get(zoneDe(o))} />
                        </li>
                      )}
                      <li
                        className={`px-3 sm:px-4 py-2 grid grid-cols-[auto_minmax(9.5rem,auto)_auto_1fr] sm:grid-cols-[auto_12.5rem_11rem_1fr_auto] items-center gap-x-3 gap-y-1 ${
                          l.reportee || (o.statut === 'a_faire' && !l.demain && l.d.etat === 'retard') ? 'bg-red-50/40' : ''
                        } ${sel.has(o.id) ? '!bg-blue-50' : ''}`}
                      >
                        {peutSignaler && selectionnable(l) ? (
                          <input type="checkbox" aria-label={`Choisir ${ligneLabel(o)}`} checked={sel.has(o.id)} onChange={() => basculerSel(o.id)} />
                        ) : (
                          <span className="w-[13px]" />
                        )}
                        <span className="font-mono font-bold text-slate-900 text-sm whitespace-nowrap flex items-center gap-2">
                          {/* type d'OT devant le FGP : DRG, CPL, CST, ANS… */}
                          <span className="inline-flex w-11 justify-center font-sans">
                            <TypeBadge type={typeDe(o) as SituationType} />
                          </span>
                          {ligneLabel(o)}
                          {o.isUrgent && <span className="ml-1.5 text-[10px] font-sans font-bold text-orange-700">URGENT</span>}
                        </span>
                        <span>
                          <Statut l={l} />
                        </span>
                        <span className="col-span-4 sm:col-span-1 text-xs sm:text-sm text-slate-700 min-w-0 truncate pl-6 sm:pl-0" title={o.motif}>
                          {o.statut === 'a_faire' ? <span className="text-slate-400">—</span> : o.motif || <span className="text-slate-300">—</span>}
                        </span>
                        {peutSignaler && o.statut === 'fait' && !o.id.startsWith('h:') && (
                          <span className="col-span-4 sm:col-span-1 justify-self-end">
                            <FauxOkButton compact onConfirm={(m, n) => onFauxOk(o, m, n)} />
                          </span>
                        )}
                      </li>
                    </Fragment>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
