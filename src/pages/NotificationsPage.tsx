import { useAppStore } from '@/store/useAppStore';
import { Button, Card, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { Notification } from '@/types';

const ICONS: Record<Notification['type'], string> = {
  nok: '',
  ok: '',
  urgent: '',
  import: '',
  assign: '',
};
const BG: Record<Notification['type'], string> = {
  nok: 'bg-red-50',
  ok: 'bg-green-50',
  urgent: 'bg-orange-50',
  import: 'bg-blue-50',
  assign: 'bg-purple-50',
};

export default function NotificationsPage() {
  const notifications = useAppStore((s) => s.notifications);
  const markNotifRead = useAppStore((s) => s.markNotifRead);
  const markAllRead = useAppStore((s) => s.markAllRead);
  const unread = notifications.filter((n) => !n.read).length;

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
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Tout marquer lu
          </Button>
        )}
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState icon="" text="Aucune notification" />
        ) : (
          <div>
            {notifications.map((n, i) => (
              <div
                key={n.id}
                onClick={() => markNotifRead(n.id)}
                className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-slate-50/80 ${!n.read ? 'bg-blue-50/60' : ''} ${i < notifications.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${BG[n.type]}`}>
                  {ICONS[n.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-slate-800">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
