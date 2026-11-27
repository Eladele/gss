import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Modal, Input, Select, EmptyState, useToast } from '@/components/ui';
import type { Role } from '@/types';
import {
  listerComptes,
  creerCompte,
  modifierCompte,
  reinitialiserMotDePasse,
  type CompteUtilisateur,
  type IdentifiantsAdmin,
} from '@/lib/supabaseService';
import { Copy, KeyRound, Lock, Plus, Search, ShieldCheck, UserCog, Users } from 'lucide-react';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrateur',
  superviseur: 'Superviseur',
  chef: "Chef d'équipe",
  technicien: 'Technicien',
  rh: 'RH / Comptable',
  consultation: 'Consultation',
  directeur: 'Directeur',
};
const ROLE_AIDE: Record<Role, string> = {
  admin: 'Accès complet à l’application',
  superviseur: 'Suivi technique, distribution du programme, équipes',
  chef: 'Programme de son équipe : clôture des fiches, réclamations',
  technicien: 'Programme de son équipe en lecture seule',
  rh: 'Employés, congés, prêts, salaires, caisses',
  consultation: 'Lecture seule : tableau de bord et situations',
  directeur: 'Suivi, caisses, export des salaires',
};
const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-800',
  superviseur: 'bg-blue-100 text-blue-800',
  chef: 'bg-green-100 text-green-800',
  technicien: 'bg-teal-100 text-teal-800',
  rh: 'bg-pink-100 text-pink-800',
  consultation: 'bg-slate-100 text-slate-700',
  directeur: 'bg-amber-100 text-amber-800',
};
const ROLES: Role[] = ['chef', 'technicien', 'superviseur', 'rh', 'directeur', 'consultation', 'admin'];
/** rôles rattachés à une équipe de terrain : équipe obligatoire */
const avecEquipe = (r: Role) => r === 'chef' || r === 'technicien';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Edition = { mode: 'creer' } | { mode: 'modifier'; compte: CompteUtilisateur };

export default function UtilisateursPage() {
  const user = useAppStore((s) => s.user)!;
  const equipes = useAppStore((s) => s.equipes);
  const { showToast } = useToast();

  // mot de passe de l'administrateur : gardé en mémoire le temps de la page, jamais enregistré
  const [creds, setCreds] = useState<IdentifiantsAdmin | null>(null);
  const [mdpAdmin, setMdpAdmin] = useState('');
  const [comptes, setComptes] = useState<CompteUtilisateur[]>([]);
  const [chargement, setChargement] = useState(false);

  const [recherche, setRecherche] = useState('');
  const [filtreRole, setFiltreRole] = useState<'' | Role>('');

  const [edition, setEdition] = useState<Edition | null>(null);
  const [fNom, setFNom] = useState('');
  const [fRole, setFRole] = useState<Role>('technicien');
  const [fEquipe, setFEquipe] = useState('');
  const [fMdp, setFMdp] = useState('');
  const [busy, setBusy] = useState(false);
  const [aReinitialiser, setAReinitialiser] = useState<CompteUtilisateur | null>(null);
  // mot de passe à communiquer une seule fois
  const [mdpAffiche, setMdpAffiche] = useState<{ nom: string; mdp: string } | null>(null);

  const nomEquipe = useMemo(() => new Map(equipes.map((e) => [e.id, e.name])), [equipes]);
  const equipesTriees = useMemo(() => [...equipes].sort((a, b) => a.name.localeCompare(b.name)), [equipes]);

  const recharger = async (c: IdentifiantsAdmin) => {
    setChargement(true);
    try {
      setComptes(await listerComptes(c));
      return true;
    } catch (e) {
      showToast(errText(e), 'error');
      return false;
    } finally {
      setChargement(false);
    }
  };

  const deverrouiller = async () => {
    const c = { adminId: user.id, adminPassword: mdpAdmin };
    if (await recharger(c)) {
      setCreds(c);
      setMdpAdmin('');
    }
  };

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return comptes.filter((c) => {
      if (filtreRole && c.role !== filtreRole) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.teamId && (nomEquipe.get(c.teamId) ?? '').toLowerCase().includes(q));
    });
  }, [comptes, recherche, filtreRole, nomEquipe]);

  const compteParRole = useMemo(() => {
    const m = new Map<Role, number>();
    comptes.forEach((c) => m.set(c.role, (m.get(c.role) ?? 0) + 1));
    return m;
  }, [comptes]);

  const ouvrirCreation = () => {
    setFNom('');
    setFRole('technicien');
    setFEquipe('');
    setFMdp('');
    setEdition({ mode: 'creer' });
  };
  const ouvrirModification = (c: CompteUtilisateur) => {
    setFNom(c.name);
    setFRole(c.role);
    setFEquipe(c.teamId ?? '');
    setFMdp('');
    setEdition({ mode: 'modifier', compte: c });
  };

  const erreurForm =
    edition?.mode === 'creer' && fNom.trim().length < 2
      ? 'Nom d’utilisateur trop court'
      : avecEquipe(fRole) && !fEquipe
        ? 'Choisissez l’équipe'
        : fMdp && fMdp.trim().length < 6
          ? 'Mot de passe : 6 caractères minimum'
          : '';

  const enregistrer = async () => {
    if (!creds || !edition || erreurForm) return;
    setBusy(true);
    try {
      const teamId = avecEquipe(fRole) ? fEquipe : null;
      if (edition.mode === 'creer') {
        const mdp = await creerCompte(creds, { name: fNom.trim(), role: fRole, teamId, password: fMdp.trim() || undefined });
        setMdpAffiche({ nom: fNom.trim(), mdp });
        showToast(`Compte créé : ${fNom.trim()} (${ROLE_LABEL[fRole]})`, 'success');
      } else {
        await modifierCompte(creds, edition.compte.id, { role: fRole, teamId });
        showToast(`${edition.compte.name} : ${ROLE_LABEL[fRole]}${teamId ? ` · ${nomEquipe.get(teamId)}` : ''}`, 'success');
      }
      setEdition(null);
      await recharger(creds);
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const reinitialiser = async () => {
    if (!creds || !aReinitialiser) return;
    setBusy(true);
    try {
      const mdp = await reinitialiserMotDePasse(creds, aReinitialiser.id);
      setMdpAffiche({ nom: aReinitialiser.name, mdp });
      setAReinitialiser(null);
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copier = async (texte: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      showToast('Copié', 'success');
    } catch {
      showToast('Copie impossible : notez le mot de passe', 'error');
    }
  };

  // ── Verrou : confirmation du mot de passe administrateur ──
  if (!creds) {
    return (
      <div className="max-w-md mx-auto pt-6 sm:pt-12 px-1 animate-fade-in">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900">Utilisateurs et accès</h1>
              <p className="text-xs text-slate-500">Confirmez votre mot de passe pour gérer les comptes.</p>
            </div>
          </div>
          <Input
            type="password"
            autoFocus
            placeholder="Votre mot de passe"
            value={mdpAdmin}
            onChange={(e) => setMdpAdmin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mdpAdmin && deverrouiller()}
          />
          <Button onClick={deverrouiller} disabled={!mdpAdmin || chargement} className="w-full justify-center" icon={<ShieldCheck className="w-4 h-4" />}>
            {chargement ? 'Vérification…' : 'Continuer'}
          </Button>
          <p className="text-[11px] text-slate-400">Le mot de passe n’est gardé que pendant que cette page est ouverte.</p>
        </div>
      </div>
    );
  }

  const Actions = ({ c, pleine = false }: { c: CompteUtilisateur; pleine?: boolean }) => {
    const verrouille = c.superadmin && !user.superadmin;
    return (
      <div className={`flex gap-1.5 ${pleine ? 'flex-wrap' : 'justify-end'}`}>
        <button
          type="button"
          onClick={() => ouvrirModification(c)}
          disabled={verrouille}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
        >
          <UserCog className="w-3.5 h-3.5" /> Rôle / équipe
        </button>
        <button
          type="button"
          onClick={() => setAReinitialiser(c)}
          disabled={verrouille}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <KeyRound className="w-3.5 h-3.5" /> Mot de passe
        </button>
      </div>
    );
  };

  const Badge = ({ c }: { c: CompteUtilisateur }) => (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${ROLE_STYLE[c.role] ?? 'bg-slate-100 text-slate-700'}`}>
      {ROLE_LABEL[c.role] ?? c.role}
      {c.superadmin ? ' · super-admin' : ''}
    </span>
  );

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Utilisateurs et accès</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            Comptes de connexion : chefs d’équipe, techniciens, superviseurs… Chef et technicien sont rattachés à une équipe.
          </p>
        </div>
        <Button onClick={ouvrirCreation} icon={<Plus className="w-4 h-4" />} className="justify-center">
          Nouvel utilisateur
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {(['chef', 'technicien', 'superviseur', 'admin'] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setFiltreRole(filtreRole === r ? '' : r)}
            className={`bg-white rounded-xl border shadow-sm p-3 text-left ${filtreRole === r ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}
          >
            <p className="text-xl font-black text-slate-900">{compteParRole.get(r) ?? 0}</p>
            <p className="text-xs text-slate-500 font-medium">{ROLE_LABEL[r]}s</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-2 sm:p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Nom ou équipe…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <Select value={filtreRole} onChange={(e) => setFiltreRole(e.target.value as '' | Role)}>
          <option value="">Tous les rôles ({comptes.length})</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]} ({compteParRole.get(r) ?? 0})
            </option>
          ))}
        </Select>
      </div>

      {chargement && !comptes.length ? (
        <p className="text-center text-sm text-slate-400 py-10">Chargement…</p>
      ) : filtres.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState icon="" text="Aucun compte pour ces critères" />
        </div>
      ) : (
        <>
          {/* téléphone / tablette : cartes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {filtres.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {c.teamId ? `Équipe ${nomEquipe.get(c.teamId) ?? '—'}` : 'Sans équipe'}
                      {c.id === user.id ? ' · vous' : ''}
                    </p>
                  </div>
                  <Badge c={c} />
                </div>
                <Actions c={c} pleine />
              </div>
            ))}
          </div>

          {/* grand écran : tableau */}
          <div className="hidden lg:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left">Nom d’utilisateur</th>
                  <th className="px-3 py-3 text-left">Rôle</th>
                  <th className="px-3 py-3 text-left">Équipe</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtres.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {c.name}
                      {c.id === user.id && <span className="ml-2 text-[11px] font-normal text-slate-400">(vous)</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge c={c} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">{c.teamId ? (nomEquipe.get(c.teamId) ?? '—') : '—'}</td>
                    <td className="px-4 py-3">
                      <Actions c={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Création / modification ── */}
      <Modal
        open={!!edition}
        onClose={() => !busy && setEdition(null)}
        title={edition?.mode === 'modifier' ? `Rôle et équipe — ${edition.compte.name}` : 'Nouvel utilisateur'}
      >
        {edition && (
          <div className="space-y-4">
            {edition.mode === 'creer' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom d’utilisateur (pour se connecter) *</label>
                <Input value={fNom} onChange={(e) => setFNom(e.target.value)} placeholder="Ex : Moussa Diallo" autoFocus />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Rôle *</label>
              <Select
                className="w-full"
                value={fRole}
                onChange={(e) => setFRole(e.target.value as Role)}
                disabled={edition.mode === 'modifier' && edition.compte.id === user.id}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-slate-500 mt-1">{ROLE_AIDE[fRole]}</p>
              {edition.mode === 'modifier' && edition.compte.id === user.id && (
                <p className="text-[11px] text-amber-700 mt-1">Vous ne pouvez pas changer votre propre rôle.</p>
              )}
            </div>

            {avecEquipe(fRole) && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Équipe *</label>
                <Select className="w-full" value={fEquipe} onChange={(e) => setFEquipe(e.target.value)}>
                  <option value="">— Choisir l’équipe —</option>
                  {equipesTriees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.ville ? ` · ${e.ville}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {edition.mode === 'creer' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Mot de passe (facultatif)</label>
                <Input type="text" value={fMdp} onChange={(e) => setFMdp(e.target.value)} placeholder="Vide = mot de passe temporaire généré" />
              </div>
            )}

            {erreurForm && <p className="text-xs text-red-600">{erreurForm}</p>}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <Button variant="outline" onClick={() => setEdition(null)} disabled={busy} className="justify-center">
                Annuler
              </Button>
              <Button onClick={enregistrer} disabled={busy || !!erreurForm} className="justify-center">
                {busy ? 'Enregistrement…' : edition.mode === 'creer' ? 'Créer le compte' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Réinitialiser le mot de passe ── */}
      <Modal open={!!aReinitialiser} onClose={() => !busy && setAReinitialiser(null)} title="Nouveau mot de passe">
        {aReinitialiser && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Générer un nouveau mot de passe temporaire pour <strong>{aReinitialiser.name}</strong> ? L’ancien ne fonctionnera plus.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setAReinitialiser(null)} disabled={busy} className="justify-center">
                Annuler
              </Button>
              <Button variant="warning" onClick={reinitialiser} disabled={busy} className="justify-center">
                {busy ? '…' : `Réinitialiser — ${aReinitialiser.name}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Mot de passe à communiquer (affiché une seule fois) ── */}
      <Modal open={!!mdpAffiche} onClose={() => setMdpAffiche(null)} title="Mot de passe à communiquer">
        {mdpAffiche && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Identifiants de <strong>{mdpAffiche.nom}</strong>. Notez-les maintenant : le mot de passe ne pourra plus être affiché.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs text-slate-500">
                Nom d’utilisateur : <strong className="text-slate-800">{mdpAffiche.nom}</strong>
              </p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-lg font-black tracking-wider text-slate-900 break-all">{mdpAffiche.mdp}</code>
                <Button size="sm" variant="outline" onClick={() => copier(mdpAffiche.mdp)} icon={<Copy className="w-3.5 h-3.5" />}>
                  Copier
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">L’utilisateur pourra le changer dans son profil après sa première connexion.</p>
            <Button onClick={() => setMdpAffiche(null)} className="w-full justify-center" icon={<Users className="w-4 h-4" />}>
              J’ai noté le mot de passe
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
