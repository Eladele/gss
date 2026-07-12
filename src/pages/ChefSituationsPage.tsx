import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { statusBorderColor } from '@/utils';
import { StatCard, TypeBadge, ZoneChip, StatusBadge, NOKSheet, EmptyState, Select } from '@/components/ui';
import { useToast } from '@/components/ui';
import type { Situation } from '@/types';

export default function ChefSituationsPage() {
  const user       = useAppStore(s => s.user)!;
  const situations = useAppStore(s => s.situations);
  const markOK     = useAppStore(s => s.markOK);
  const markNonOK  = useAppStore(s => s.markNonOK);
  const loadAll    = useAppStore(s => s.loadAll);
  const loading    = useAppStore(s => s.loading);
  const { showToast } = useToast();

  const [nokFgp, setNokFgp]   = useState('');
  const [nokOpen, setNokOpen] = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [search, setSearch]   = useState('');
  const [view, setView]       = useState<'cards' | 'table'>('cards');

  const teamName = user.teamName;

  const mySits: Situation[] = useMemo(() => {
    // Si l'utilisateur est un chef, il ne voit QUE les situations de son équipe.
    // Si pas de teamName, il ne voit rien (au lieu de tout voir).
    let list = situations;
    if (user.role === 'chef') {
      const myTeam = (teamName || '').trim().toLowerCase();
      list = list.filter(s => (s.equipe || '').trim().toLowerCase() === myTeam);
    } else if (teamName) {
      // Pour les autres rôles s'ils ont une équipe assignée
      list = list.filter(s => (s.equipe || '').trim().toLowerCase() === teamName.trim().toLowerCase());
    }

    if (search) {
      list = list.filter(s =>
        s.fgp.includes(search) || s.zone.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (fStatus) {
      list = list.filter(s => s.status === fStatus);
    }
    return list;
  }, [situations, teamName, search, fStatus, user.role]);

  // Sort: urgent > pending > in_progress > non_ok > ok
  const ORDER: Record<string, number> = { urgent: 0, pending: 1, in_progress: 2, non_ok: 3, ok: 4 };
  const sorted = [...mySits].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  const total  = mySits.length;
  const ok     = mySits.filter(s => s.status === 'ok').length;
  const nok    = mySits.filter(s => s.status === 'non_ok').length;
  const pend   = mySits.filter(s => s.status === 'pending' || s.status === 'urgent').length;
  const pct    = total > 0 ? Math.round(ok / total * 100) : 0;

  const handleOK = async (fgp: string) => {
    await markOK(fgp);
    showToast(`FGP ${fgp} — OK enregistré ✓`, 'success');
  };

  const handleNOKConfirm = async (comment: string) => {
    await markNonOK(nokFgp, comment);
    setNokOpen(false);
    showToast(`FGP ${nokFgp} — NON OK enregistré`, 'warning');
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Mes Situations</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Équipe <strong className="text-slate-600">{teamName || 'Toutes'}</strong>
            {' · '}{new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView(v => v === 'cards' ? 'table' : 'cards')}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-600"
          >
            {view === 'cards' ? '📋 Vue Liste' : '🃏 Vue Cartes'}
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-600 disabled:opacity-50"
          >
            {loading ? '⏳' : '🔄'} Actualiser
          </button>
        </div>
      </div>

      {/* ─── Stat cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={total} label="Total"   icon="📋" accent="#546E7A" />
        <StatCard value={ok}    label="OK"      icon="✅" accent="#2E7D32" />
        <StatCard value={nok}   label="NON OK"  icon="❌" accent="#C62828" />
        <StatCard value={pend}  label="Restant" icon="⏳" accent="#1565C0" />
      </div>

      {/* ─── Progression globale ─── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">Progression de l'équipe</span>
          <span className="text-sm font-bold" style={{ color: '#2E7D32' }}>{pct}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #43A047, #2E7D32)' }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">{ok} situatio{ok !== 1 ? 'ns' : 'n'} terminée{ok !== 1 ? 's' : ''} sur {total}</p>
      </div>

      {/* ─── Filtres ─── */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-48 shadow-sm">
          <span className="text-slate-400">🔍</span>
          <input
            className="bg-transparent text-sm focus:outline-none flex-1"
            placeholder="Rechercher FGP, zone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Tous statuts</option>
          <option value="pending">⏳ En attente</option>
          <option value="urgent">⚠️ Urgent</option>
          <option value="ok">✅ OK</option>
          <option value="non_ok">❌ NON OK</option>
        </Select>
      </div>

      {/* ─── Contenu ─── */}
      {sorted.length === 0 ? (
        <EmptyState icon="📭" text="Aucune situation trouvée pour votre équipe" />
      ) : view === 'cards' ? (
        /* ── Vue Cartes ── */
        <div className="space-y-3">
          {sorted.map(s => {
            const isDone = s.status === 'ok' || s.status === 'non_ok';
            return (
              <div
                key={s.id}
                className={`bg-white rounded-xl border-l-4 border border-slate-200 shadow-sm overflow-hidden ${statusBorderColor(s.status)}`}
              >
                <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-800">{s.fgp}</span>
                      {s.isUrgent && (
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">⚠ URGENT</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <TypeBadge type={s.type} />
                      <ZoneChip zone={s.zone} />
                      {s.motif && s.motif !== 'oK' && (
                        <span className="text-xs text-slate-400 italic truncate max-w-36" title={s.motif}>{s.motif}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {/* Motif urgent */}
                {(s.isUrgent || s.status === 'urgent') && s.motif && (
                  <p className="px-4 py-1.5 text-xs text-orange-700 bg-orange-50 border-t border-orange-100">{s.motif}</p>
                )}

                {/* Commentaire NON OK */}
                {s.status === 'non_ok' && s.comment && (
                  <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                    <p className="text-xs font-semibold text-red-600 mb-0.5">Motif du NON OK :</p>
                    <p className="text-xs text-red-700 italic">"{s.comment}"</p>
                  </div>
                )}

                {/* OK confirmé */}
                {s.status === 'ok' && (
                  <p className="px-4 py-1.5 text-xs text-green-700 bg-green-50 border-t border-green-100 font-semibold">
                    ✓ Complété — {new Date(s.updatedAt || '').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || '—'}
                  </p>
                )}

                {/* Actions */}
                {!isDone && (
                  <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleOK(s.fgp)}
                      className="py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-sm rounded-xl transition-all active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                    >
                      ✓ OK
                    </button>
                    <button
                      onClick={() => { setNokFgp(s.fgp); setNokOpen(true); }}
                      className="py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-sm rounded-xl transition-all active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                    >
                      ✗ NON OK
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Vue Tableau ── */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['FGP', 'Type', 'Zone', 'Motif', 'Date Dépôt', 'Délai', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => {
                  const isDone = s.status === 'ok' || s.status === 'non_ok';
                  return (
                    <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${s.isUrgent ? 'bg-orange-50/30' : ''}`}>
                      <td className="px-3 py-3 font-bold text-slate-800">
                        {s.fgp}
                        {s.isUrgent && <span className="ml-1 text-orange-500 text-xs">⚠</span>}
                      </td>
                      <td className="px-3 py-3"><TypeBadge type={s.type} /></td>
                      <td className="px-3 py-3"><ZoneChip zone={s.zone} /></td>
                      <td className="px-3 py-3 text-xs text-slate-400 max-w-28 truncate" title={s.motif}>{s.motif || '—'}</td>
                      <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateDepo || '—'}</td>
                      <td className="px-3 py-3 text-xs text-center">{s.delai !== undefined ? `${s.delai}j` : '—'}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={s.status} />
                        {s.status === 'non_ok' && s.comment && (
                          <p className="text-xs text-red-500 mt-0.5 max-w-28 truncate italic" title={s.comment}>
                            {s.comment}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {!isDone ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleOK(s.fgp)}
                              className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95"
                            >
                              ✓ OK
                            </button>
                            <button
                              onClick={() => { setNokFgp(s.fgp); setNokOpen(true); }}
                              className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95"
                            >
                              ✗ NOK
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NOK Sheet avec saisie du motif */}
      <NOKSheet
        open={nokOpen}
        fgp={nokFgp}
        onClose={() => setNokOpen(false)}
        onConfirm={handleNOKConfirm}
      />
    </div>
  );
}
