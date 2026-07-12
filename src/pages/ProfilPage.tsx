import { useAppStore } from '@/store/useAppStore';
import { Button, Card } from '@/components/ui';

export default function ProfilPage() {
  const user   = useAppStore(s => s.user)!;
  const logout = useAppStore(s => s.logout);

  const roleLabel: Record<string, string> = {
    superviseur: 'Superviseur', chef: 'Chef d\'Équipe', admin: 'Administrateur',
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-sm">
      <h1 className="text-2xl font-black text-slate-900">Mon Profil</h1>
      <Card className="p-6">
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black mx-auto mb-3 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${user.color}, #00BCD4)` }}>
            {user.avatar}
          </div>
          <h2 className="text-xl font-bold text-slate-800">{user.name}</h2>
          <p className="text-slate-400 text-sm">{roleLabel[user.role]}</p>
          {user.teamName && <p className="text-blue-600 text-sm font-medium mt-1">Équipe {user.teamName}</p>}
        </div>

        <div className="space-y-3 mb-6">
          {[
            { label: 'Notifications Push', checked: true },
            { label: 'Alertes Urgences',   checked: true },
            { label: 'Rapport Quotidien',  checked: false },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-700">{item.label}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked={item.checked} className="sr-only peer" />
                <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 after:shadow-sm" />
              </label>
            </div>
          ))}
        </div>

        <Button variant="danger" className="w-full justify-center" onClick={logout}>
          🚪 Se Déconnecter
        </Button>
      </Card>
    </div>
  );
}
