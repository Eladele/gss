import { Lock, LogOut } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useMarqueStore } from '@/store/useMarqueStore';
import { LogoMarque } from '@/components/LogoMarque';

/** Écran affiché à tous les comptes (sauf super-administrateur) quand l'entreprise est suspendue */
export default function AccesSuspendu() {
  const message = useMarqueStore((s) => s.abonnement.message);
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-sm p-8 text-center space-y-5">
        <LogoMarque taille="lg" />
        <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <Lock className="w-7 h-7 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Accès suspendu</h1>
        <p className="text-sm text-slate-600">
          {message || "L'accès à l'application est suspendu pour votre entreprise. Contactez votre fournisseur."}
        </p>
        {user && (
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50"
          >
            <LogOut className="w-4 h-4" /> Se déconnecter
          </button>
        )}
      </div>
    </div>
  );
}
