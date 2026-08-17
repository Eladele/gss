import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { loginWithCredentials } from '@/lib/supabaseService';

export default function AuthPage() {
  const login = useAppStore((s) => s.login);
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
    } catch (e: any) {
      setError('Connexion impossible pour le moment. Réessayez dans quelques instants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm mx-4">
        {/* Brand */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{ background: 'linear-gradient(135deg, #1565C0, #00BCD4)' }}
          >
            <span className="text-xl font-black text-white tracking-widest">GSS</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Connexion</h1>
          <p className="text-slate-400 text-sm mt-1">Program Manager · FTTH Moov Mauritel</p>
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
            style={{ background: loading ? '#90A4AE' : '#1565C0' }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>

        <p className="text-center text-slate-300 text-xs mt-6">GSS · Gestion Situations & Supervision</p>
      </div>
    </div>
  );
}
