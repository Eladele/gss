import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { statusBorderColor } from '@/utils';
import { StatCard, TypeBadge, ZoneChip, StatusBadge, NOKSheet, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui';
import type { ProgrammeOT, Situation } from '@/types';
import { OtCard } from '@/components/programme/OtCard';
import { fetchProgramme, setStatut, subscribeProgramme } from '@/lib/programmeService';
import { errMsg } from '@/utils';

// Liste historique des situations de l'équipe (onglet « Situations »)
function SituationsDuJour() {
  const user = useAppStore((s) => s.user)!;
  const situations = useAppStore((s) => s.situations);
  const markOK = useAppStore((s) => s.markOK);
  const markNonOK = useAppStore((s) => s.markNonOK);
  const { showToast } = useToast();

  const [nokFgp, setNokFgp] = useState('');
  const [nokOpen, setNokOpen] = useState(false);

  const teamName = user.teamName;
  const mySits: Situation[] = teamName ? situations.filter((s) => s.equipe?.toLowerCase() === teamName.toLowerCase()) : situations;

  // Sort: urgent > pending > non_ok > ok
  const ORDER: Record<string, number> = { urgent: 0, pending: 1, in_progress: 2, non_ok: 3, ok: 4 };
  const sorted = [...mySits].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  const total = mySits.length;
  const ok = mySits.filter((s) => s.status === 'ok').length;
  const nok = mySits.filter((s) => s.status === 'non_ok').length;
  const pend = mySits.filter((s) => s.status === 'pending' || s.status === 'urgent').length;

  const handleOK = (fgp: string) => {
    markOK(fgp);
    showToast(`FGP ${fgp} — OK enregistré `, 'success');
  };
  const handleNOKConfirm = (comment: string) => {
    markNonOK(nokFgp, comment);
    setNokOpen(false);
    showToast(`FGP ${nokFgp} — NON OK enregistré`, 'warning');
  };

  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4 animate-fade-in max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Programme du Jour</h1>
        <p className="text-slate-400 text-sm">
          Équipe <strong className="text-slate-600">{teamName || 'Toutes'}</strong> · {new Date().toLocaleDateString('fr-FR')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={total} label="Total" icon="" accent="#546E7A" />
        <StatCard value={ok} label="OK" icon="" accent="#2E7D32" />
        <StatCard value={nok} label="NON OK" icon="" accent="#C62828" />
        <StatCard value={pend} label="Restant" icon="" accent="#1565C0" />
      </div>

      {/* Cards */}
      {sorted.length === 0 ? (
        <EmptyState icon="" text="Aucune situation pour votre équipe" />
      ) : (
        <div className="space-y-3">
          {sorted.map((s) => {
            const isDone = s.status === 'ok' || s.status === 'non_ok';
            return (
              <div
                key={s.id}
                className={`bg-white rounded-xl border-l-4 border border-slate-200 shadow-sm overflow-hidden animate-fade-in ${statusBorderColor(s.status)}`}
              >
                <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-800">{s.fgp}</span>
                      {s.isUrgent && <span className="text-xs font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded"> URGENT</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <TypeBadge type={s.type} />
                      <ZoneChip zone={s.zone} />
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {/* Urgent comment */}
                {(s.isUrgent || s.status === 'urgent') && s.motif && (
                  <p className="px-4 py-1.5 text-xs text-orange-700 bg-orange-50 border-t border-orange-100">{s.motif}</p>
                )}

                {/* NON OK comment */}
                {s.status === 'non_ok' && s.comment && (
                  <p className="px-4 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100 italic">{s.comment}</p>
                )}

                {/* OK time */}
                {s.status === 'ok' && <p className="px-4 py-1.5 text-xs text-green-600 font-semibold"> Complété — {now}</p>}

                {/* Actions */}
                {!isDone && (
                  <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleOK(s.fgp)}
                      className="py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl transition-all active:scale-95 shadow-sm"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => {
                        setNokFgp(s.fgp);
                        setNokOpen(true);
                      }}
                      className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all active:scale-95 shadow-sm"
                    >
                      NON OK
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NOKSheet open={nokOpen} fgp={nokFgp} onClose={() => setNokOpen(false)} onConfirm={handleNOKConfirm} />
    </div>
  );
}

// ─── Programme du chef : fiches OT distribuées + situations ──────────────────
export default function ProgrammePage() {
  const [tab, setTab] = useState<'fiches' | 'situations'>('fiches');
  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {(
          [
            ['fiches', 'Fiches OT'],
            ['situations', 'Situations'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'fiches' ? <FichesOT /> : <SituationsDuJour />}
    </div>
  );
}

function FichesOT() {
  const user = useAppStore((s) => s.user)!;
  const { showToast } = useToast();
  const team = user.teamName ?? '';
  const today = new Date().toISOString().slice(0, 10);
  const [ots, setOts] = useState<ProgrammeOT[]>([]);
  const [loaded, setLoaded] = useState(!team);
  const [error, setError] = useState('');
  const [view, setView] = useState<'a_faire' | 'termine'>('a_faire');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [nok, setNok] = useState<ProgrammeOT | null>(null);

  useEffect(() => {
    if (!team) return;
    let alive = true;
    const load = () =>
      fetchProgramme({ from: today, to: today, equipe: team })
        .then(
          (rows) => alive && (setOts(rows), setError('')),
          (e) => alive && setError(errMsg(e)),
        )
        .finally(() => alive && setLoaded(true));
    load();
    const unsub = subscribeProgramme(`chef-${team}`, load);
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive = false;
      unsub();
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [team, today]);

  const change = async (ot: ProgrammeOT, statut: ProgrammeOT['statut'], commentaire = '') => {
    setBusy(ot.id);
    // mise à jour immédiate à l'écran, annulée si l'enregistrement échoue
    setOts((cur) => cur.map((o) => (o.id === ot.id ? { ...o, statut, commentaire, traiteParNom: user.name, traiteLe: new Date().toISOString() } : o)));
    try {
      await setStatut(ot.id, statut, user.name, commentaire);
      if (statut === 'fait') showToast(`FGP ${ot.fgp} — fait`, 'success');
      if (statut === 'non_fait') showToast(`FGP ${ot.fgp} — non fait, le superviseur est prévenu`, 'warning');
    } catch (e) {
      setOts((cur) => cur.map((o) => (o.id === ot.id ? ot : o)));
      showToast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const aFaire = ots.filter((o) => o.statut === 'a_faire');
  const termines = ots.filter((o) => o.statut !== 'a_faire' && (o.traiteLe ?? '').slice(0, 10) === today);
  const list = useMemo(() => {
    const base = view === 'a_faire' ? aFaire : termines;
    const s = q.trim().toLowerCase();
    const filtered = s
      ? base.filter((o) => [o.fgp, o.clientNom, o.zone, o.pco, o.dis, ...o.telephones, ...o.ontSerials].join(' ').toLowerCase().includes(s))
      : base;
    // en retard d'abord, puis dérangements avant installations, puis par zone / PCO
    return [...filtered].sort(
      (a, b) =>
        a.dateProgramme.localeCompare(b.dateProgramme) ||
        (a.nature === b.nature ? 0 : a.nature === 'derangement' ? -1 : 1) ||
        (a.zone + a.pco).localeCompare(b.zone + b.pco),
    );
  }, [view, aFaire, termines, q]);

  if (!team) return <EmptyState icon="" text="Aucune équipe associée à votre compte. Contactez votre superviseur." />;
  if (!loaded) return <p className="py-10 text-center text-sm text-slate-400">Chargement du programme…</p>;

  const der = aFaire.filter((o) => o.nature === 'derangement').length;
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Programme du jour</h1>
        <p className="text-slate-400 text-sm">
          Équipe <strong className="text-slate-600">{team}</strong> · {new Date().toLocaleDateString('fr-FR')}
        </p>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        <StatCard value={aFaire.length} label="À faire" icon="" accent="#1565C0" />
        <StatCard value={der} label="Dérangements" icon="" accent="#E65100" />
        <StatCard value={termines.filter((o) => o.statut === 'fait').length} label="Faits aujourd’hui" icon="" accent="#2E7D32" />
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(
            [
              ['a_faire', `À faire (${aFaire.length})`],
              ['termine', `Terminées (${termines.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold ${view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          id="ot-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Client, FGP, PCO, n° série…"
          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
        />
      </div>
      {list.length === 0 ? (
        <EmptyState icon="" text={view === 'a_faire' ? 'Aucune fiche à faire. Le prochain programme arrivera avec une notification.' : 'Aucune fiche terminée aujourd’hui.'} />
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <OtCard
              key={o.id}
              ot={o}
              busy={busy === o.id}
              onFait={() => change(o, 'fait')}
              onNonFait={() => setNok(o)}
              onReset={() => change(o, 'a_faire')}
            />
          ))}
        </div>
      )}
      <NOKSheet
        open={!!nok}
        fgp={nok?.fgp ?? ''}
        onClose={() => setNok(null)}
        onConfirm={(c) => {
          if (nok) change(nok, 'non_fait', c);
          setNok(null);
        }}
      />
    </div>
  );
}
