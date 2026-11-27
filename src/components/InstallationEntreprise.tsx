import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Input, useToast } from '@/components/ui';
import { installerBase, type CompteCree, type CompteInstallation } from '@/lib/entreprisesService';
import { Building2, Copy, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Installation d'une base vide : super-administrateur (facultatif), entreprise et ses administrateurs.
 * Les mots de passe laissés vides sont générés ; tous sont affichés une seule fois à la fin.
 */
export function InstallationEntreprise({
  client,
  avecSuperadmin,
  entrepriseInitiale = '',
  jetonRequis = false,
  onTermine,
}: {
  /** base d'une entreprise cliente (console) ; sinon la base de l'application */
  client?: SupabaseClient;
  /** créer aussi le compte super-administrateur */
  avecSuperadmin: boolean;
  entrepriseInitiale?: string;
  jetonRequis?: boolean;
  onTermine?: (comptes: CompteCree[]) => void;
}) {
  const { showToast } = useToast();
  const [superNom, setSuperNom] = useState('');
  const [superMdp, setSuperMdp] = useState('');
  const [nom, setNom] = useState(entrepriseInitiale);
  const [nomComplet, setNomComplet] = useState('');
  const [admins, setAdmins] = useState<CompteInstallation[]>([{ name: '', password: '' }]);
  const [jeton, setJeton] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<{ comptes: CompteCree[]; avertissement?: string } | null>(null);

  const majAdmin = (i: number, p: Partial<CompteInstallation>) => setAdmins((l) => l.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const adminsRemplis = admins.filter((a) => a.name.trim());
  const erreur = !nom.trim()
    ? 'Nom de l’entreprise obligatoire'
    : avecSuperadmin && superNom.trim().length < 2
      ? 'Nom du super-administrateur obligatoire'
      : adminsRemplis.length === 0
        ? 'Au moins un administrateur de l’entreprise'
        : [superMdp, ...admins.map((a) => a.password ?? '')].some((p) => p.trim() && p.trim().length < 6)
          ? 'Mot de passe : 6 caractères minimum (ou vide pour le générer)'
          : jetonRequis && !jeton.trim()
            ? 'Code d’installation obligatoire'
            : '';

  const installer = async () => {
    if (erreur) return;
    setBusy(true);
    try {
      const r = await installerBase(
        {
          entreprise: { nom: nom.trim(), nomComplet: nomComplet.trim() || undefined },
          superadmin: avecSuperadmin ? { name: superNom.trim(), password: superMdp.trim() || undefined } : null,
          admins: adminsRemplis.map((a) => ({ name: a.name.trim(), password: a.password?.trim() || undefined })),
          token: jeton.trim() || undefined,
        },
        client,
      );
      setResultat(r);
      onTermine?.(r.comptes);
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copierTout = async () => {
    if (!resultat) return;
    const texte = [`Entreprise : ${nom.trim()}`, ...resultat.comptes.map((c) => `${c.superadmin ? 'Super-administrateur' : 'Administrateur'} : ${c.name} / ${c.password}`)].join('\n');
    try {
      await navigator.clipboard.writeText(texte);
      showToast('Identifiants copiés', 'success');
    } catch {
      showToast('Copie impossible : notez les identifiants', 'error');
    }
  };

  // ── Résultat : identifiants à communiquer (affichés une seule fois) ──
  if (resultat) {
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Installation terminée pour <strong>{nom.trim()}</strong>. Notez ces identifiants maintenant : les mots de passe ne pourront plus être affichés.
        </div>
        {resultat.avertissement && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{resultat.avertissement}</p>}
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {resultat.comptes.map((c) => (
            <li key={c.name} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-500">{c.superadmin ? 'Super-administrateur' : 'Administrateur de l’entreprise'}</p>
              </div>
              <code className="text-sm font-black tracking-wider text-slate-900 break-all">{c.password}</code>
            </li>
          ))}
        </ul>
        <Button variant="outline" onClick={copierTout} className="w-full justify-center" icon={<Copy className="w-4 h-4" />}>
          Copier tous les identifiants
        </Button>
      </div>
    );
  }

  const label = 'text-xs font-semibold text-slate-500 block mb-1.5';
  return (
    <div className="space-y-5">
      {avecSuperadmin && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600" /> Super-administrateur
          </h3>
          <p className="text-[11px] text-slate-500">Votre compte fournisseur : personnalisation et gestion de l’entreprise.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input value={superNom} onChange={(e) => setSuperNom(e.target.value)} placeholder="Nom d’utilisateur" autoFocus />
            <Input value={superMdp} onChange={(e) => setSuperMdp(e.target.value)} placeholder="Mot de passe (vide = généré)" />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" /> Entreprise
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className={label}>Nom court *</label>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : TELCO" />
          </div>
          <div>
            <label className={label}>Nom complet</label>
            <Input value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} placeholder="Ex : Télécom Services SA" />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <UserCog className="w-4 h-4 text-emerald-600" /> Administrateurs de l’entreprise
        </h3>
        <p className="text-[11px] text-slate-500">Ils pourront se connecter et créer ensuite chefs, techniciens et autres comptes (page Utilisateurs).</p>
        <div className="space-y-2">
          {admins.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                <Input value={a.name} onChange={(e) => majAdmin(i, { name: e.target.value })} placeholder={`Administrateur ${i + 1}`} />
                <Input value={a.password ?? ''} onChange={(e) => majAdmin(i, { password: e.target.value })} placeholder="Mot de passe (vide = généré)" />
              </div>
              <button
                type="button"
                onClick={() => setAdmins((l) => l.filter((_, k) => k !== i))}
                disabled={admins.length === 1}
                aria-label="Retirer"
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAdmins((l) => [...l, { name: '', password: '' }])} icon={<Plus className="w-4 h-4" />}>
          Ajouter un administrateur
        </Button>
      </section>

      {jetonRequis && (
        <div>
          <label className={label}>Code d’installation *</label>
          <Input type="password" value={jeton} onChange={(e) => setJeton(e.target.value)} placeholder="Secret INSTALL_TOKEN du projet" />
        </div>
      )}

      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
      <Button onClick={installer} disabled={busy || !!erreur} className="w-full justify-center" icon={<ShieldCheck className="w-4 h-4" />}>
        {busy ? 'Installation…' : 'Créer les comptes'}
      </Button>
    </div>
  );
}
