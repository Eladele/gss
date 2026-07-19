import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { loginWithCredentials } from '@/lib/supabaseService';
import { supabase } from '@/lib/supabase';
import { DEMO_USERS } from '@/data';

export default function AuthPage() {
  const login = useAppStore(s => s.login);
  const [name, setName]   = useState('');
  const [pass, setPass]   = useState('gss2026');
  const [error, setError] = useState('');
  const [loading, setLoading]   = useState(false);
  const [dbStatus, setDbStatus] = useState<'idle'|'ok'|'error'>('idle');

  const handleLogin = async () => {
    if (!name.trim()) { setError('Entrez votre nom d\'utilisateur'); return; }
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
      const msg = e?.message ?? '';
      if (msg.includes('Failed to fetch') || msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('NetworkError')) {
        setError('⚠️ Impossible de contacter la base de données. Le projet Supabase est peut-être en pause — relancez-le sur supabase.com/dashboard/projects');
      } else {
        setError('Erreur de connexion : ' + (msg || 'Réessayez.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setDbStatus('idle');
    try {
      const { error } = await supabase.from('profiles').select('name').limit(1);
      if (error) throw error;
      setDbStatus('ok');
    } catch {
      setDbStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: '#1565C0', top: '-20%', right: '-10%' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: '#00BCD4', bottom: '-15%', left: '-8%' }} />
        {/* Grid pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1565C0" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Header brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #1565C0, #00BCD4)' }}>
            <span className="text-2xl font-black text-white tracking-widest">GSS</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">Connexion</h1>
          <p className="text-slate-400 text-sm">Program Manager · FTTH Moov Mauritel</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xl">
          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center gap-2">
              <span>❌</span> {error}
            </div>
          )}

          {/* Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 text-xs font-bold mb-1.5 uppercase tracking-wide">
                Utilisateur
              </label>
              <input
                id="login-username"
                className="w-full px-4 py-3 rounded-xl text-sm text-slate-800 border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Ex: eladel, hamadi, tiam..."
                autoFocus
              />
            </div>
            <div>
              <label className="block text-slate-600 text-xs font-bold mb-1.5 uppercase tracking-wide">
                Mot de passe
              </label>
              <input
                id="login-password"
                type="password"
                className="w-full px-4 py-3 rounded-xl text-sm text-slate-800 border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                value={pass}
                onChange={e => { setPass(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            id="login-submit"
            onClick={handleLogin}
            disabled={loading}
            className="mt-6 w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            style={{ background: loading ? '#90A4AE' : 'linear-gradient(135deg, #1565C0, #1E88E5)' }}
          >
            {loading ? '⏳ Connexion...' : 'Se connecter →'}
          </button>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-slate-300 text-xs">ou accès démonstration</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Demo quick access */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '🛡️ Admin',       sub: 'eladel / gss2026', key: 'admin',       n: 'eladel',         p: 'gss2026' },
              { label: '👔 Superviseur', sub: 'tiam / gss2026',   key: 'superviseur', n: 'tiam',           p: 'gss2026' },
              { label: '🔧 Chef',         sub: 'hamadi / chef2026',key: 'chef',        n: 'hamadi',         p: 'chef2026' },
            ].map(d => (
              <button
                key={d.key}
                onClick={() => { setName(d.n); setPass(d.p); setError(''); }}
                className="flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl text-xs transition-all border border-slate-100 hover:border-blue-200 hover:bg-blue-50 text-slate-600 hover:text-blue-700"
              >
                <span className="font-semibold">{d.label}</span>
                <span className="text-slate-400 text-[10px]">{d.sub}</span>
              </button>
            ))}
          </div>

          {/* DB Connection test */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={testConnection}
              className="w-full py-2 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all border border-dashed border-slate-200"
            >
              {dbStatus === 'idle' && '📶 Tester la connexion Supabase'}
              {dbStatus === 'ok'   && '✅ Supabase connecté — base de données accessible'}
              {dbStatus === 'error'&& '❌ Supabase inaccessible — projet en pause ? Aller sur supabase.com/dashboard'}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-300 text-xs mt-6">
          GSS · Gestion Situations & Supervision
        </p>
      </div>
    </div>
  );
}
