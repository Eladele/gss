import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useMarqueStore } from '@/store/useMarqueStore';
import AuthPage from '@/pages/AuthPage';
import AppLayout from '@/components/layout/AppLayout';
import AccesSuspendu from '@/components/AccesSuspendu';
import { ToastProvider } from '@/components/ui';

export default function App() {
  const user = useAppStore((s) => s.user);
  const suspendu = useMarqueStore((s) => s.abonnement.statut === 'suspendu');

  // Le statut de l'entreprise est relu régulièrement : une suspension (ou un rétablissement)
  // décidée par le super-administrateur s'applique aussi aux sessions déjà ouvertes.
  useEffect(() => {
    const relire = () => void useMarqueStore.getState().charger();
    const t = window.setInterval(relire, 2 * 60 * 1000);
    window.addEventListener('focus', relire);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', relire);
    };
  }, []);

  // Entreprise suspendue : seul le super-administrateur garde l'accès (pour la rétablir)
  const bloque = suspendu && !!user && !user.superadmin;
  return <ToastProvider>{bloque ? <AccesSuspendu /> : user ? <AppLayout /> : <AuthPage />}</ToastProvider>;
}
