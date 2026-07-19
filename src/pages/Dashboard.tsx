import { useAppStore } from '@/store/useAppStore';
import { getEquipeColor, statusColors } from '@/utils';
import { StatCard, Card, CardHeader, CardTitle, TypeBadge, StatusBadge, ZoneChip, EquipeTag, ProgressBar, Button } from '@/components/ui';

type Page = string;

export default function Dashboard({ onNavigate }: { onNavigate: (p: any) => void }) {
  const situations = useAppStore(s => s.situations);
  const equipes    = useAppStore(s => s.equipes);
  const loading    = useAppStore(s => s.loading);
  const loadAll    = useAppStore(s => s.loadAll);

  const total   = situations.length;
  const ok      = situations.filter(s => s.status === 'ok').length;
  const nok     = situations.filter(s => s.status === 'non_ok').length;
  const pending = situations.filter(s => s.status === 'pending').length;
  const urgent  = situations.filter(s => s.status === 'urgent').length;

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{today}</p>
        </div>
        <Button icon="⬆️" onClick={() => onNavigate('import-excel')}>Importer Programme</Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse">
          <span>⏳</span> Chargement depuis Supabase...
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard value={total}   label="Total"         icon="📋" accent="#1565C0" />
        <StatCard value={ok}      label="OK"            icon="✅" accent="#2E7D32" />
        <StatCard value={nok}     label="NON OK"        icon="❌" accent="#C62828" />
        <StatCard value={pending} label="En Attente"    icon="⏳" accent="#546E7A" />
        <StatCard value={urgent}  label="Urgences"      icon="⚠️" accent="#E65100" />
      </div>

      {/* Equipe progress */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Progression par Équipe</CardTitle>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>🔄 Actualiser</Button>
        </CardHeader>
        <div className="p-5 space-y-5">
          {(equipes.length > 0 ? equipes : []).map(eq => {
            const eqSits = situations.filter(s => s.equipe?.toLowerCase() === eq.name.toLowerCase());
            const eqOk   = eqSits.filter(s => s.status === 'ok').length;
            const eqNok  = eqSits.filter(s => s.status === 'non_ok').length;
            const eqPend = eqSits.filter(s => s.status === 'pending' || s.status === 'urgent').length;
            const pct    = eqSits.length ? Math.round(eqOk / eqSits.length * 100) : 0;
            return (
              <details key={eq.id} className="group bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden">
                <summary className="cursor-pointer p-3 hover:bg-slate-50 transition-colors list-none flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <EquipeTag name={eq.name} color={eq.color} />
                      <span className="text-xs font-medium text-slate-600">{eq.leader}</span>
                      <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">{eqOk}/{eqSits.length} OK</span>
                      {eqNok > 0 && <span className="text-xs text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">{eqNok} NOK</span>}
                      {eqPend > 0 && <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{eqPend} restant</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: eq.color }}>{pct}%</span>
                      <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                    </div>
                  </div>
                  <ProgressBar value={pct} color={eq.color} />
                </summary>
                
                {eqSits.length > 0 ? (
                  <div className="p-3 border-t border-slate-100 bg-white">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {eqSits.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 hover:border-slate-200 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">{s.fgp}</span>
                            {s.isUrgent && <span className="text-[10px] text-orange-500">⚠</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <ZoneChip zone={s.zone} />
                            <StatusBadge status={s.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 border-t border-slate-100 text-xs text-slate-400 text-center bg-white">
                    Aucune situation
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </Card>

      {/* Recent table */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Situations Récentes</CardTitle>
          <Button variant="outline" size="sm" onClick={() => onNavigate('situations')}>Voir tout →</Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">FGP</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Zone</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Équipe</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Statut</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide hidden md:table-cell">Motif</th>
              </tr>
            </thead>
            <tbody>
              {situations.slice(0, 10).map(s => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{s.fgp}</td>
                  <td className="px-4 py-3"><TypeBadge type={s.type} /></td>
                  <td className="px-4 py-3"><ZoneChip zone={s.zone} /></td>
                  <td className="px-4 py-3"><EquipeTag name={s.equipe || '—'} color={getEquipeColor(s.equipe)} /></td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-32 truncate hidden md:table-cell">{s.motif || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
