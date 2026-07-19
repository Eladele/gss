import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Role } from '@/types';

// Pages
import Dashboard from '@/pages/Dashboard';
import SituationsPage from '@/pages/SituationsPage';
import ChefSituationsPage from '@/pages/ChefSituationsPage';
import ProgrammePage from '@/pages/ProgrammePage';
import ImportExcelPage from '@/pages/ImportExcelPage';
import EquipesPage from '@/pages/EquipesPage';
import ZonesPage from '@/pages/ZonesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import ProfilPage from '@/pages/ProfilPage';
import StatistiquesPage from '@/pages/StatistiquesPage';
import EmployesPage from '@/pages/EmployesPage';
import VehiculesPage from '@/pages/VehiculesPage';
import MaterielsPage from '@/pages/MaterielsPage';

type Page = 'dashboard' | 'situations' | 'chef-situations' | 'programme' | 'import-excel' | 'equipes' | 'zones' | 'notifications' | 'profil' | 'statistiques' | 'employes' | 'vehicules' | 'materiels';

const NAV: Record<Role, { id: Page; icon: string; label: string }[]> = {
  superviseur: [
    { id: 'dashboard',    icon: '🏠', label: 'Dashboard'    },
    { id: 'situations',   icon: '📋', label: 'Situations'   },
    { id: 'statistiques', icon: '📊', label: 'Statistiques' },
    { id: 'import-excel', icon: '⬆️', label: 'Import Excel' },
    { id: 'equipes',      icon: '👥', label: 'Équipes'      },
    { id: 'zones',        icon: '🗺️', label: 'Zones'        },
    { id: 'notifications',icon: '🔔', label: 'Notifications'},
  ],
  chef: [
    { id: 'chef-situations', icon: '📋', label: 'Situations'   },
    { id: 'programme',       icon: '📱', label: 'Programme'    },
    { id: 'notifications',   icon: '🔔', label: 'Notifications'},
    { id: 'profil',          icon: '👤', label: 'Profil'       },
  ],
  admin: [
    { id: 'dashboard',    icon: '🏠', label: 'Dashboard'    },
    { id: 'situations',   icon: '📋', label: 'Situations'   },
    { id: 'statistiques', icon: '📊', label: 'Statistiques' },
    { id: 'import-excel', icon: '⬆️', label: 'Import Excel' },
    { id: 'equipes',      icon: '👥', label: 'Équipes'      },
    { id: 'zones',        icon: '🗺️', label: 'Zones'        },
    { id: 'employes',     icon: '🧑‍💼', label: 'Employés'    },
    { id: 'vehicules',    icon: '🚗', label: 'Véhicules'    },
    { id: 'materiels',    icon: '🧰', label: 'Matériel'     },
    { id: 'notifications',icon: '🔔', label: 'Notifications'},
  ],
};

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard', situations: 'Situations', 'chef-situations': 'Mes Situations',
  programme: 'Programme du Jour', 'import-excel': 'Import Excel',
  equipes: 'Gestion Équipes', zones: 'Gestion Zones',
  notifications: 'Notifications', profil: 'Mon Profil',
  statistiques: 'Statistiques', employes: 'Gestion Employés', vehicules: 'Gestion Véhicules',
  materiels: 'Gestion Matériel',
};

export default function AppLayout() {
  const user = useAppStore(s => s.user)!;
  const notifications = useAppStore(s => s.notifications);
  const logout = useAppStore(s => s.logout);
  const unread = notifications.filter(n => !n.read).length;
  const navItems = NAV[user.role];
  const defaultPage = user.role === 'chef' ? 'chef-situations' : 'dashboard';
  const [page, setPage] = useState<Page>(defaultPage);

  const PageMap: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={setPage} />,
    situations: <SituationsPage />,
    'chef-situations': <ChefSituationsPage />,
    programme: <ProgrammePage />,
    'import-excel': <ImportExcelPage />,
    equipes: <EquipesPage />,
    zones: <ZonesPage />,
    notifications: <NotificationsPage />,
    profil: <ProfilPage />,
    statistiques: <StatistiquesPage />,
    employes: <EmployesPage />,
    vehicules: <VehiculesPage />,
    materiels: <MaterielsPage />,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1.5 rounded-lg text-white text-sm font-black tracking-wider"
            style={{ background: 'linear-gradient(135deg, #1565C0, #00BCD4)' }}>
            GSS
          </div>
          <span className="font-semibold text-slate-800 text-sm hidden sm:block">{PAGE_TITLES[page]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage('notifications')} className="relative p-2 rounded-full hover:bg-slate-100 transition-colors text-lg">
            🔔
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          <button onClick={() => setPage('profil')} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: user.color }}>
              {user.avatar}
            </div>
            <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.name}</span>
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - desktop */}
        <aside className="w-52 bg-white border-r border-slate-200 hidden md:flex flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
          <nav className="p-3 flex-1 space-y-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-2">Navigation</p>
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${page === item.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100">
            <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all">
              🚪 Déconnecter
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 min-w-0">
          {PageMap[page]}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-lg">
        <div className="flex">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${page === item.id ? 'text-blue-700' : 'text-slate-500'}`}
            >
              <span className="text-xl relative">
                {item.icon}
                {item.id === 'notifications' && unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
