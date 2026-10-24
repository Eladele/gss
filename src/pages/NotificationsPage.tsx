import { useAppStore } from '@/store/useAppStore';
import { Button, Card, EmptyState } from '@/components/ui';

import { timeAgo } from '@/utils/caisse';
import { useCaisseStore } from '@/store/useCaisseStore';
import { AppNotification, Notification } from '@/types';

const BG: Record<Notification['type'], string> = {
  nok: 'bg-red-50',
  ok: 'bg-green-50',
  urgent: 'bg-orange-50',
  import: 'bg-blue-50',
  assign: 'bg-purple-50',
};
const REMOTE_BG: Record<AppNotification['type'], string> = {
  demande_depense: 'bg-amber-100 text-amber-800',
  demande_alimentation: 'bg-sky-100 text-sky-800',
  validee: 'bg-emerald-100 text-emerald-800',
  rejetee: 'bg-red-100 text-red-700',
  alimentation: 'bg-emerald-100 text-emerald-800',
  programme: 'bg-violet-100 text-violet-800',
  programme_non_fait: 'bg-rose-100 text-rose-700',
  info: 'bg-slate-100 text-slate-600',
};
const REMOTE_MARK: Record<AppNotification['type'], string> = {
  demande_depense: '−',
  demande_alimentation: '+',
  validee: '✓',
  rejetee: '×',
  alimentation: '+',
  programme: '📋',
  programme_non_fait: '!',
  info: 'i',
};

type Row =
  | { kind: 'local'; n: Notification; sort: number }
  | { kind: 'remote'; n: AppNotification; sort: number };

export default function NotificationsPage() {
  const notifications = useAppStore((s) => s.notifications);
  const markNotifRead = useAppStore((s) => s.markNotifRead);
  const markAllRead = useAppStore((s) => s.markAllRead);
  const remote = useCaisseStore((s) => s.notifications);
  const markRemoteRead = useCaisseStore((s) => s.markRead);
  const markAllRemoteRead = useCaisseStore((s) => s.markAllRead);

  const unread = notifications.filter((n) => !n.read).length + remote.filter((n) => !n.lu).length;

  // Notifications Caisses (horodatées) en tête, puis les alertes locales existantes
  const rows: Row[] = [
    ...remote.map((n) => ({ kind: 'remote' as const, n, sort: new Date(n.createdAt).getTime() })),
    ...notifications.map((n, i) => ({ kind: 'local' as const, n, sort: -i })),
  ].sort((a, b) => b.sort - a.sort);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Notifications</h1>
          {unread > 0 && (
            <p className="text-sm text-blue-600 font-medium">
              {unread} non lue{unread > 1 ? 's' : ''}
            </p>
          )}
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              markAllRead();
              markAllRemoteRead();
            }}
          >
            Tout marquer lu
          </Button>
        )}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="" text="Aucune notification" />
        ) : (
          <div>
            {rows.map((r, i) => {
              const last = i === rows.length - 1;
              if (r.kind === 'remote') {
                const n = r.n;
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.lu && markRemoteRead([n.id])}
                    className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-slate-50/80 ${!n.lu ? 'bg-blue-50/60' : ''} ${!last ? 'border-b border-slate-100' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base font-black ${REMOTE_BG[n.type] ?? REMOTE_BG.info}`}>
                      {REMOTE_MARK[n.type] ?? 'i'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-slate-800">{n.titre}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Caisse</span>
                        {!n.lu && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
              }
              const n = r.n;
              return (
                <div
                  key={n.id}
                  onClick={() => markNotifRead(n.id)}
                  className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-slate-50/80 ${!n.read ? 'bg-blue-50/60' : ''} ${!last ? 'border-b border-slate-100' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${BG[n.type]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-slate-800">{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1">{n.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
