import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Role } from '@/types';
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Upload,
  Users,
  MapPin,
  Bell,
  User,
  BarChart3,
  UserCheck,
  Car,
  Wrench,
  Network,
  LogOut,
  Menu as MenuIcon,
  X,
  Download,
} from 'lucide-react';

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
import ScansPage from '@/pages/ScansPage';

type Page =
  | 'dashboard'
  | 'situations'
  | 'chef-situations'
  | 'programme'
  | 'import-excel'
  | 'equipes'
  | 'zones'
  | 'notifications'
  | 'profil'
  | 'statistiques'
  | 'employes'
  | 'vehicules'
  | 'materiels'
  | 'scans';

const NAV: Record<Role, { id: Page; label: string }[]> = {
  superviseur: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'situations', label: 'Situations' },
    { id: 'statistiques', label: 'Statistiques' },
    { id: 'import-excel', label: 'Import Excel' },
    { id: 'equipes', label: 'Équipes' },
    { id: 'zones', label: 'Zones' },
    { id: 'notifications', label: 'Notifications' },
  ],
  chef: [
    { id: 'chef-situations', label: 'Situations' },
    { id: 'programme', label: 'Programme' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'profil', label: 'Profil' },
  ],
  admin: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'situations', label: 'Situations' },
    { id: 'statistiques', label: 'Statistiques' },
    { id: 'import-excel', label: 'Import Excel' },
    { id: 'equipes', label: 'Équipes' },
    { id: 'zones', label: 'Zones' },
    { id: 'employes', label: 'Employés' },
    { id: 'vehicules', label: 'Véhicules' },
    { id: 'materiels', label: 'Matériel' },
    { id: 'scans', label: 'Scans Réseau' },
    { id: 'notifications', label: 'Notifications' },
  ],
};

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  situations: 'Situations',
  'chef-situations': 'Mes Situations',
  programme: 'Programme du Jour',
  'import-excel': 'Import Excel',
  equipes: 'Gestion Équipes',
  zones: 'Gestion Zones',
  notifications: 'Notifications',
  profil: 'Mon Profil',
  statistiques: 'Statistiques',
  employes: 'Gestion Employés',
  vehicules: 'Gestion Véhicules',
  materiels: 'Gestion Matériel',
  scans: 'Scans Réseau (ONU/OLT)',
};

const PAGE_ICONS: Record<Page, React.ComponentType<any>> = {
  dashboard: LayoutDashboard,
  situations: ClipboardList,
  'chef-situations': ClipboardList,
  programme: FileText,
  'import-excel': Upload,
  equipes: Users,
  zones: MapPin,
  notifications: Bell,
  profil: User,
  statistiques: BarChart3,
  employes: UserCheck,
  vehicules: Car,
  materiels: Wrench,
  scans: Network,
};

export default function AppLayout() {
  const user = useAppStore((s) => s.user)!;
  const notifications = useAppStore((s) => s.notifications);
  const logout = useAppStore((s) => s.logout);
  const unread = notifications.filter((n) => !n.read).length;
  const navItems = NAV[user.role];
  const defaultPage = user.role === 'chef' ? 'chef-situations' : 'dashboard';
  const [page, setPage] = useState<Page>(defaultPage);
  const [menuOpen, setMenuOpen] = useState(false);

  // ── PWA Install Prompt ───────────────────────────────────────────────────────
  // Capture l'événement natif du navigateur AVANT qu'il ne soit affiché automatiquement
  // pour pouvoir le déclencher manuellement via notre bouton "Installer".
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Vérifie si l'app est déjà installée (mode standalone = lancée depuis l'écran d'accueil)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setInstallPrompt(null);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setInstallPrompt(null);
    }
  };

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
    scans: <ScansPage />,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Hamburger Menu button for mobile */}
          <button
            onClick={() => setMenuOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            aria-label="Open menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div
            className="px-2.5 py-1.5 rounded-lg text-white text-sm font-black tracking-wider cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #1565C0, #00BCD4)' }}
            onClick={() => setPage(defaultPage)}
          >
            GSS
          </div>
          <span className="font-semibold text-slate-800 text-sm hidden sm:block">{PAGE_TITLES[page]}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Bouton installer l'app PWA */}
          {installPrompt && !installed && (
            <button
              onClick={handleInstall}
              title="Installer l'application sur votre appareil"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Installer</span>
            </button>
          )}
          <button
            onClick={() => setPage('notifications')}
            className="relative px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-600 border border-slate-200"
          >
            Alertes
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          <button
            onClick={() => setPage('profil')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: user.color }}
            >
              {user.avatar}
            </div>
            <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.name}</span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setMenuOpen(false)}
        />
      )}
      
      {/* Mobile Drawer Menu */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 w-64 bg-white shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div
              className="px-2.5 py-1.5 rounded-lg text-white text-sm font-black tracking-wider"
              style={{ background: 'linear-gradient(135deg, #1565C0, #00BCD4)' }}
            >
              GSS
            </div>
            <span className="font-bold text-slate-700 text-sm">Menu</span>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = PAGE_ICONS[item.id];
            return (
              <button
                key={item.id}
                onClick={() => {
                  setPage(item.id);
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  page === item.id
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {Icon && <Icon className={`w-5 h-5 ${page === item.id ? 'text-blue-600' : 'text-slate-400'}`} />}
                {item.label}
                {item.id === 'notifications' && unread > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-red-100 text-red-600 font-bold rounded-full">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all text-left"
          >
            <LogOut className="w-5 h-5 text-red-500" />
            Déconnecter
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar - desktop */}
        <aside className="w-52 bg-white border-r border-slate-200 hidden md:flex flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
          <nav className="p-3 flex-1 space-y-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-2">Navigation</p>
            {navItems.map((item) => {
              const Icon = PAGE_ICONS[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${page === item.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
                >
                  {Icon && <Icon className={`w-4 h-4 transition-colors ${page === item.id ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />}
                  {item.label}
                  {item.id === 'notifications' && unread > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-red-100 text-red-600 font-bold rounded-full">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all text-left"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              Déconnecter
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 min-w-0">{PageMap[page]}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-lg">
        <div className="flex justify-around items-center h-14">
          {user.role === 'chef' ? (
            // Chef layout bottom items
            [
              { id: 'chef-situations', label: 'Situations', icon: ClipboardList },
              { id: 'programme', label: 'Programme', icon: FileText },
              { id: 'notifications', label: 'Alertes', icon: Bell, badge: unread },
              { id: 'profil', label: 'Profil', icon: User },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id as Page)}
                  className={`flex-1 flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors ${page === item.id ? 'text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <span className="relative">
                    <Icon className={`w-5 h-5 ${page === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
                    {item.badge ? (
                      <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })
          ) : (
            // Admin/Superviseur layout bottom items
            [
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'situations', label: 'Situations', icon: ClipboardList },
              { id: 'notifications', label: 'Alertes', icon: Bell, badge: unread },
              { id: 'menu', label: 'Menu', icon: MenuIcon, onClick: () => setMenuOpen(true) },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={item.onClick ? item.onClick : () => setPage(item.id as Page)}
                  className={`flex-1 flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors ${isActive ? 'text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <span className="relative">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    {item.badge ? (
                      <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })
          )}
        </div>
      </nav>
    </div>
  );
}
