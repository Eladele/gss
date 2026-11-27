import { useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import { inscrireSuperadmin, type CompteCree } from '@/lib/entreprisesService';

const champ =
  'w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white';
const label = 'block text-slate-500 text-xs font-semibold mb-1.5';

/**
 * Inscription du super-administrateur sur une base déjà installée qui n'en a pas encore.
 * Un administrateur existant autorise la création avec son nom et son mot de passe (ou le code d'installation).
 * Le mot de passe du nouveau compte est affiché une seule fois.
 */
export function InscriptionSuperadmin({ jetonRequis, onFermer }: { jetonRequis: boolean; onFermer: (nom?: string) => void }) {
  const [adminNom, setAdminNom] = useState('');
  const [adminMdp, setAdminMdp] = useState('');
  const [jeton, setJeton] = useState('');
  const [nom, setNom] = useState('');
  const [mdp, setMdp] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreurServeur, setErreurServeur] = useState('');
  const [cree, setCree] = useState<CompteCree | null>(null);
  const [copie, setCopie] = useState(false);

  const autorisation = jeton.trim() || (adminNom.trim() && adminMdp.trim());
  const erreur =
    nom.trim().length < 2
      ? 'Nom du super-administrateur : 2 caractères minimum'
      : mdp.trim() && mdp.trim().length < 6
        ? 'Mot de passe : 6 caractères minimum (ou vide pour le générer)'
        : !autorisation
          ? 'Identifiants d’un administrateur requis'
          : '';

  const valider = async () => {
    if (erreur) return;
    setBusy(true);
    setErreurServeur('');
    try {
      setCree(
        await inscrireSuperadmin({
          superadmin: { name: nom.trim(), password: mdp.trim() || undefined },
          admin_name: adminNom.trim() || undefined,
          admin_password: adminMdp.trim() || undefined,
          token: jeton.trim() || undefined,
        }),
      );
    } catch (e) {
      setErreurServeur(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (cree)
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Super-administrateur créé. Notez le mot de passe maintenant : il ne pourra plus être affiché.
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-slate-200 rounded-xl">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{cree.name}</p>
            <p className="text-[11px] text-slate-500">Super-administrateur</p>
          </div>
          <code className="text-sm font-black tracking-wider text-slate-900 break-all">{cree.password}</code>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`Super-administrateur : ${cree.name} / ${cree.password}`);
              setCopie(true);
            } catch {
              setCopie(false);
            }
          }}
          className="w-full py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-2"
        >
          <Copy className="w-4 h-4" /> {copie ? 'Copié' : 'Copier les identifiants'}
        </button>
        <button
          type="button"
          onClick={() => onFermer(cree.name)}
          className="w-full py-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
        >
          J’ai noté le mot de passe — se connecter
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-purple-600" /> Inscription du super-administrateur
        </h2>
        <p className="text-xs text-slate-500 mt-1">Possible une seule fois : tant qu’aucun super-administrateur n’existe sur cette base.</p>
      </div>

      <section className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <p className="text-xs font-semibold text-slate-600">Autorisation par un administrateur de l’entreprise</p>
        <div>
          <label className={label}>Administrateur</label>
          <input className={champ} value={adminNom} onChange={(e) => setAdminNom(e.target.value)} placeholder="Nom d’un administrateur" autoFocus />
        </div>
        <div>
          <label className={label}>Son mot de passe</label>
          <input className={champ} type="password" value={adminMdp} onChange={(e) => setAdminMdp(e.target.value)} placeholder="Mot de passe de l’administrateur" />
        </div>
        {jetonRequis && (
          <div>
            <label className={label}>ou code d’installation</label>
            <input className={champ} type="password" value={jeton} onChange={(e) => setJeton(e.target.value)} placeholder="Secret INSTALL_TOKEN" />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <label className={label}>Nom du super-administrateur *</label>
          <input className={champ} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom d’utilisateur" />
        </div>
        <div>
          <label className={label}>Mot de passe</label>
          <input className={champ} value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="Vide = généré automatiquement" />
        </div>
      </section>

      {(erreurServeur || erreur) && <p className="text-xs text-red-600">{erreurServeur || erreur}</p>}
      <button
        type="button"
        onClick={valider}
        disabled={busy || !!erreur}
        className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? 'Création…' : 'Créer le super-administrateur'}
      </button>
      <button type="button" onClick={() => onFermer()} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
        Retour à la connexion
      </button>
    </div>
  );
}
