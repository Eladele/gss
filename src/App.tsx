import { useAppStore } from '@/store/useAppStore';
import AuthPage from '@/pages/AuthPage';
import AppLayout from '@/components/layout/AppLayout';
import { ToastProvider } from '@/components/ui';

export default function App() {
  const user = useAppStore((s) => s.user);
  return <ToastProvider>{user ? <AppLayout /> : <AuthPage />}</ToastProvider>;
}
