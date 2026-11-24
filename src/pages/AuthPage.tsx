import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { loginWithCredentials } from '@/lib/supabaseService';
import { InstallApkButton } from '@/components/InstallApkButton';
import { LogoMarque } from '@/components/LogoMarque';
import { useMarqueStore } from '@/store/useMarqueStore';

export default function AuthPage() {
  const login = useAppStore((s) => s.login);
  const marque = useMarqueStore((s) => s.affichee);
  const suspendu = useMarqueStore((s) => s.abonnement.statut === 'suspendu');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!name.trim()) {
      setError("Entrez votre nom d'utilisateur");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await loginWithCredentials(name.trim(), pass.trim());
      if (user) {
        login(user);
      } else {
        setError('Identifiants incorrects. Vérifiez votre nom et mot de passe.');
      }
    } catch {
      setError('Connexion impossible pour le moment. Réessayez dans quelques instants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative">
      {/* Bouton en haut : Installer version APK */}
      <div className="absolute top-4 right-4 z-20">
        <InstallApkButton />
      </div>

      <div className="w-full max-w-sm mx-4">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="mb-5">
            <LogoMarque taille="lg" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Connexion</h1>
          {suspendu && (
            <p className="mt-3 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              Accès suspendu pour cette entreprise — seul le super-administrateur peut se connecter.
            </p>
          )}
          {marque.slogan && <p className="text-slate-400 text-sm mt-1">{marque.slogan}</p>}
          {marque.specialites.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {marque.specialites.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-7 border border-slate-200">
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5">Utilisateur</label>
              <input
                id="login-username"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Nom d'utilisateur"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5">Mot de passe</label>
              <input
                id="login-password"
                type="password"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Mot de passe"
              />
            </div>
          </div>

          <button
            id="login-submit"
            onClick={handleLogin}
            disabled={loading}
            className="mt-6 w-full py-3 rounded-lg font-semibold text-white text-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: loading ? '#90A4AE' : marque.couleurPrincipale }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>

        <p className="text-center text-slate-300 text-xs mt-6">
          {marque.nom}
          {marque.nomComplet ? ` · ${marque.nomComplet}` : ''}
        </p>
      </div>
    </div>
  );
}
