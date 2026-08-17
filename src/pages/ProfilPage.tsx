import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, useToast } from '@/components/ui';
import { changePassword } from '@/lib/supabaseService';

export default function ProfilPage() {
  const user = useAppStore((s) => s.user)!;
  const logout = useAppStore((s) => s.logout);
  const { showToast } = useToast();

  const roleLabel: Record<string, string> = {
    superviseur: 'Superviseur',
    chef: "Chef d'Équipe",
    admin: 'Administrateur',
    rh: 'RH',
    consultation: 'Consultation',
  };

  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white';

  const resetPwdForm = () => {
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setPwdError('');
  };

  const handleChangePassword = async () => {
    setPwdError('');
    if (!currentPwd || !newPwd || !confirmPwd) {
      setPwdError('Remplissez tous les champs');
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('Le nouveau mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('La confirmation ne correspond pas au nouveau mot de passe');
      return;
    }
    setPwdLoading(true);
    try {
      const result = await changePassword(user.id, currentPwd, newPwd);
      if (result.success) {
        showToast('Mot de passe modifié avec succès', 'success');
        resetPwdForm();
        setShowPwdForm(false);
      } else {
        setPwdError(result.error ?? 'Échec du changement de mot de passe');
      }
    } catch {
      setPwdError('Connexion impossible pour le moment. Réessayez.');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-sm">
      <h1 className="text-2xl font-black text-slate-900">Mon Profil</h1>
      <Card className="p-6">
        <div className="text-center mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black mx-auto mb-3 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${user.color}, #00BCD4)` }}
          >
            {user.avatar}
          </div>
          <h2 className="text-xl font-bold text-slate-800">{user.name}</h2>
          <p className="text-slate-400 text-sm">{roleLabel[user.role]}</p>
          {user.teamName && <p className="text-blue-600 text-sm font-medium mt-1">Équipe {user.teamName}</p>}
        </div>

        <div className="space-y-3 mb-6">
          {[
            { label: 'Notifications Push', checked: true },
            { label: 'Alertes Urgences', checked: true },
            { label: 'Rapport Quotidien', checked: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-700">{item.label}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked={item.checked} className="sr-only peer" />
                <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 after:shadow-sm" />
              </label>
            </div>
          ))}
        </div>

        {!showPwdForm ? (
          <Button variant="outline" className="w-full justify-center mb-3" onClick={() => setShowPwdForm(true)}>
            Changer mon mot de passe
          </Button>
        ) : (
          <div className="mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            {pwdError && (
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-700 text-xs">{pwdError}</div>
            )}
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5">Mot de passe actuel</label>
              <input
                type="password"
                className={inputClass}
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Mot de passe actuel"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5">Nouveau mot de passe</label>
              <input
                type="password"
                className={inputClass}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Au moins 6 caractères"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5">Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                placeholder="Retapez le nouveau mot de passe"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 justify-center"
                onClick={() => {
                  resetPwdForm();
                  setShowPwdForm(false);
                }}
              >
                Annuler
              </Button>
              <Button className="flex-1 justify-center" onClick={handleChangePassword} disabled={pwdLoading}>
                {pwdLoading ? 'Enregistrement...' : 'Valider'}
              </Button>
            </div>
          </div>
        )}

        <Button variant="danger" className="w-full justify-center" onClick={logout}>
          Se Déconnecter
        </Button>
      </Card>
    </div>
  );
}