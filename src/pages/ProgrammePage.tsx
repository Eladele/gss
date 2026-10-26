import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { StatCard, EmptyState, useToast } from '@/components/ui';
import type { ProgrammeOT } from '@/types';
import { OtCard } from '@/components/programme/OtCard';
import { cloturer, fetchPourPoints, fetchProgramme, fetchScanOts, subscribeProgramme, type Cloture, type ScanOT } from '@/lib/programmeService';
import { ExternalLink, ScanLine } from 'lucide-react';
import { ClotureSheet } from '@/components/programme/ClotureSheet';
import { DECHARGE_URL, ligneLabel } from '@/utils/programme';
import { classement, delaiOT } from '@/utils/points';
import { errMsg } from '@/utils';

// ─── Programme du chef d'équipe : uniquement les fiches OT distribuées ────────
export default function ProgrammePage() {
  return (
    <div className="max-w-lg mx-auto">
      <FichesOT />
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
  const [sheet, setSheet] = useState<{ ot: ProgrammeOT; mode: 'fait' | 'non_fait' } | null>(null);
  const [scans, setScans] = useState<Map<string, ScanOT>>(new Map());

  useEffect(() => {
    if (!team) return;
    let alive = true;
    // fiches à faire + celles des 14 derniers jours (pour les installations restées non scannées)
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const load = () =>
      fetchProgramme({ from, to: today, equipe: team })
        .then(
          (rows) => {
            if (!alive) return;
            setOts(rows);
            setError('');
            fetchScanOts(rows.map((r) => r.id)).then((m) => alive && setScans(m));
          },
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

  const change = async (ot: ProgrammeOT, c: Cloture) => {
    setBusy(ot.id);
    // mise à jour immédiate à l'écran, annulée si l'enregistrement échoue
    const reset = c.statut === 'a_faire';
    setOts((cur) =>
      cur.map((o) =>
        o.id === ot.id
          ? {
              ...o,
              statut: c.statut,
              motif: reset ? '' : (c.motif ?? ''),
              commentaire: reset ? '' : (c.commentaire ?? ''),
              decharge: c.statut === 'fait' ? (c.decharge ?? null) : null,
              scanne: c.statut === 'fait' ? (c.scanne ?? null) : null,
              cstChange: c.statut === 'fait' && !!c.cstChange,
              nouveauDis: c.cstChange ? (c.nouveauDis ?? '') : '',
              nouvelOnt: c.cstChange ? (c.nouvelOnt ?? '') : '',
              poteaux: reset ? 0 : (c.poteaux ?? 0),
              traiteParNom: reset ? null : user.name,
              traiteLe: reset ? null : new Date().toISOString(),
            }
          : o,
      ),
    );
    try {
      await cloturer(ot.id, c, user);
      if (c.statut === 'fait') showToast(`${ligneLabel(ot)} — fait`, 'success');
      if (c.statut === 'non_fait') showToast(`${ligneLabel(ot)} — non fait, le superviseur est prévenu`, 'warning');
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
        delaiOT(a).echeance.localeCompare(delaiOT(b).echeance) ||
        (a.nature === b.nature ? 0 : a.nature === 'derangement' ? -1 : 1) ||
        (a.zone + a.pco).localeCompare(b.zone + b.pco),
    );
  }, [view, aFaire, termines, q]);

  if (!team) return <EmptyState icon="" text="Aucune équipe associée à votre compte. Contactez votre superviseur." />;
  if (!loaded) return <p className="py-10 text-center text-sm text-slate-400">Chargement du programme…</p>;

  const der = aFaire.filter((o) => o.nature === 'derangement').length;
  // Installations faites mais non scannées dans un fichier importé APRÈS l'installation
  // (le fichier de scan fait foi, même si la case « Scanné » a été cochée)
  const aScanner = ots.filter((o) => {
    const sc = scans.get(o.id);
    return (
      o.nature === 'installation' &&
      o.statut === 'fait' &&
      !!sc?.dernier &&
      sc.dernier !== 'SCANNE' &&
      !!sc.dernierLe &&
      !!o.traiteLe &&
      sc.dernierLe > o.traiteLe
    );
  });
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-black text-slate-900">Programme du jour</h1>
          <a
            href={DECHARGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="w-4 h-4" /> Décharge
          </a>
        </div>
        <p className="text-slate-400 text-sm">
          Équipe <strong className="text-slate-600">{team}</strong> · {new Date().toLocaleDateString('fr-FR')}
        </p>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <PointsEquipe team={team} />
      {aScanner.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold text-red-800">
            <ScanLine className="w-4 h-4" /> {aScanner.length} installation{aScanner.length > 1 ? 's' : ''} à scanner
          </p>
          <p className="text-[11px] text-red-700">Non scannée{aScanner.length > 1 ? 's' : ''} dans le dernier fichier de scan importé après l’installation.</p>
          {aScanner.map((o) => (
            <div key={o.id} className="bg-white rounded-lg px-3 py-2 text-sm border border-red-100">
              <p className="font-semibold text-slate-800 truncate">
                {ligneLabel(o)} · {o.clientNom}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                ONT {o.ontSerials.join(' / ') || '—'} · {o.dis}
              </p>
            </div>
          ))}
        </div>
      )}
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
              scan={scans.get(o.id)}
              busy={busy === o.id}
              onFait={() => setSheet({ ot: o, mode: 'fait' })}
              onNonFait={() => setSheet({ ot: o, mode: 'non_fait' })}
              onReset={() => change(o, { statut: 'a_faire' })}
            />
          ))}
        </div>
      )}
      {sheet && (
        <ClotureSheet
          key={sheet.ot.id + sheet.mode}
          ot={sheet.ot}
          mode={sheet.mode}
          onClose={() => setSheet(null)}
          onConfirm={(c) => {
            change(sheet.ot, c);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

/** Points de l'équipe cette semaine et son rang parmi toutes les équipes */
function PointsEquipe({ team }: { team: string }) {
  const [txt, setTxt] = useState<{ points: number; rang: number; nb: number; pct: number; retard: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    fetchPourPoints(monday.toISOString().slice(0, 10), now.toISOString().slice(0, 10)).then(
      (ots) => {
        if (!alive) return;
        const rows = classement(ots);
        const me = rows.find((r) => r.equipe.toLowerCase() === team.toLowerCase());
        setTxt(me ? { points: me.points, rang: me.rang, nb: rows.length, pct: me.pctDansDelai, retard: me.retard } : null);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [team]);
  if (!txt) return null;
  return (
    <div className="rounded-xl bg-slate-900 text-white px-4 py-3 flex items-center gap-4">
      <div>
        <p className="text-3xl font-black tabular-nums leading-none">{txt.points}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">points cette semaine</p>
      </div>
      <div className="text-sm">
        <p>
          <b>{txt.rang === 1 ? '1re' : `${txt.rang}e`}</b> sur {txt.nb} équipe{txt.nb > 1 ? 's' : ''} · {txt.pct} % dans le délai
        </p>
        <p className="text-xs text-slate-400">
          1 point par fiche faite dans le délai (installation 48 h, dérangement 24 h)
          {txt.retard ? ` · ${txt.retard} en retard` : ''}
        </p>
      </div>
    </div>
  );
}
