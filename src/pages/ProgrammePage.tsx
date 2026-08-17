import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { statusBorderColor } from '@/utils';
import { StatCard, TypeBadge, ZoneChip, StatusBadge, NOKSheet, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui';
import type { Situation } from '@/types';

export default function ProgrammePage() {
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
