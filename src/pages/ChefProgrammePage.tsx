// pages/ChefProgrammePage.tsx
import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ProgressBar, StatusBadge, TypeBadge, ZoneChip, EmptyState } from '@/components/ui';
import type { SituationStatus } from '@/types';
import { calcDelai } from '@/utils/stats';

type Filter = 'all' | SituationStatus;

export default function ChefProgrammePage() {
  const situations = useAppStore((s) => s.situations);
  const equipes = useAppStore((s) => s.equipes);
  const currentUser = useAppStore((s) => s.currentUser); // { teamName, teamId, name, role, ... }
  const loading = useAppStore((s) => s.loading);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  // Équipe du chef connecté
  const myEquipe = useMemo(
    () => equipes.find((e) => e.id === currentUser?.teamId || e.name.toLowerCase() === currentUser?.teamName?.toLowerCase()),
    [equipes, currentUser],
  );

  // Situations de son équipe (distribuées par zones à l'import)
  const mySituations = useMemo(
    () => situations.filter((s) => s.equipe?.toLowerCase() === myEquipe?.name?.toLowerCase()),
    [situations, myEquipe],
  );

  // Filtres + recherche
  const filtered = useMemo(() => {
    return mySituations.filter((s) => {
      const matchFilter = filter === 'all' || s.status === filter;
      const q = search.toLowerCase();
      const matchSearch = !q || s.fgp.toLowerCase().includes(q) || s.motif?.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [mySituations, filter, search]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats
  const ok = mySituations.filter((s) => s.status === 'ok').length;
  const nok = mySituations.filter((s) => s.status === 'non_ok').length;
  const urgent = mySituations.filter((s) => s.status === 'urgent').length;
  const pending = mySituations.filter((s) => s.status === 'pending').length;
  const pct = mySituations.length ? Math.round((ok / mySituations.length) * 100) : 0;

  if (loading)
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="text-3xl animate-spin"></span>
        <span className="ml-3">Chargement du programme...</span>
      </div>
    );

  if (!myEquipe)
    return (
      <div className="space-y-5 animate-fade-in">
        <h1 className="text-2xl font-black text-slate-900">Mon Programme</h1>
        <EmptyState icon="" text="Aucune équipe associée à votre compte. Contactez votre administrateur." />
      </div>
    );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'pending', label: 'En attente' },
    { key: 'urgent', label: ' Urgent' },
    { key: 'ok', label: 'OK' },
    { key: 'non_ok', label: 'NON OK' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Mon Programme</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {mySituations.length} situations · Équipe {myEquipe.name} · {myEquipe.zones?.length ?? 0} zones
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Rechercher FGP / motif..."
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: mySituations.length, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'OK', value: ok, color: 'text-green-700', bg: 'bg-green-50', extra: `(${pct}%)` },
          { label: 'NON OK', value: nok, color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Urgent', value: urgent, color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: 'En attente', value: pending, color: 'text-slate-700', bg: 'bg-slate-50' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4`}>
            <div className="text-xs text-slate-500 font-medium mb-1">{stat.label}</div>
            <div className={`text-2xl font-black ${stat.color}`}>
              {stat.value}
              {stat.extra && <span className="text-sm font-normal ml-1 text-slate-400">{stat.extra}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <ProgressBar value={pct} color={myEquipe.color} />

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Team banner */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100" style={{ background: myEquipe.color + '10' }}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
            style={{ background: myEquipe.color }}
          >
            {myEquipe.name[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-800">Équipe {myEquipe.name}</div>
            <div className="text-xs text-slate-400">Chef : {myEquipe.leader}</div>
          </div>
          <div className="ml-auto flex gap-1.5 flex-wrap">
            {(myEquipe.zones ?? []).map((z) => (
              <ZoneChip key={z} zone={z} />
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(0);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === f.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400 self-center">{filtered.length} résultat(s)</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {pageRows.length === 0 ? (
            <EmptyState icon="" text="Aucune situation pour ce filtre." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#', 'FGP', 'Type', 'Zone', 'Statut', 'Date dépôt', 'Délai', 'Motif'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s, i) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-300 text-xs">{page * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {s.fgp}
                      {s.isUrgent && <span className="ml-1 text-orange-400 text-[10px]"></span>}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={s.type} />
                    </td>
                    <td className="px-4 py-3">
                      <ZoneChip zone={s.zone} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{s.dateDepo || '—'}</td>
                    <td className="px-4 py-3 text-xs text-center text-slate-400">{s.dateDepo ? `${calcDelai(s)}j` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-40 truncate">{s.motif || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-100 text-sm text-slate-400">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}
            </span>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 text-xs"
            >
              ←
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= filtered.length}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 text-xs"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
