// Console du super-administrateur : entreprises clientes (une base Supabase par entreprise).
// Tableau de bord de toutes les entreprises (utilisateurs, équipes, fiches, activité), fiche de
// chacune (contact, abonnement, connexion à sa base), personnalisation à distance (logo, couleurs,
// écriture, menus) et suspension / rétablissement de l'accès.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ExternalLink, Palette, Pencil, Plus, RefreshCw, Trash2, X, PauseCircle, PlayCircle, ChevronDown, UserCog } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, EmptyState, Input, Modal, Select, StatCard, Textarea, useToast } from '@/components/ui';
import { LogoMarque } from '@/components/LogoMarque';
import { EditeurMarque } from '@/components/parametres/EditeurMarque';
import { enregistrerMarque } from '@/lib/marque';
import {
  ENTREPRISE_VIDE,
  chiffresEntreprise,
  clientDe,
  enregistrerEntreprise,
  fetchEntreprises,
  pousserAbonnement,
  slugDe,
  supprimerEntreprise,
  type ChiffresEntreprise,
  type Entreprise,
  type StatutEntreprise,
} from '@/lib/entreprisesService';
import { errMsg } from '@/utils';
import { InstallationEntreprise } from '@/components/InstallationEntreprise';
import { etatInstallation, type EtatInstallation } from '@/lib/entreprisesService';

const STATUT: Record<StatutEntreprise, { label: string; cls: string }> = {
  actif: { label: 'Actif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  essai: { label: 'Essai', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  suspendu: { label: 'Suspendu', cls: 'bg-red-50 text-red-700 border-red-200' },
};
const label = 'block text-xs font-semibold text-slate-500 mb-1.5';
const jours = (iso: string | null) => (iso ? Math.ceil((new Date(`${iso}T23:59:59`).getTime() - Date.now()) / 86400000) : null);
const fr = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : '—');
const nb = (n: number | null) => (n == null ? '—' : n.toLocaleString('fr-FR'));

export default function EntreprisesPage() {
  const user = useAppStore((s) => s.user)!;
  const { showToast } = useToast();
  const [liste, setListe] = useState<Entreprise[]>([]);
  const [chiffres, setChiffres] = useState<Record<string, ChiffresEntreprise | 'chargement'>>({});
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  const [form, setForm] = useState<(Omit<Entreprise, 'id' | 'createdAt'> & { id?: string }) | null>(null);
  const [perso, setPerso] = useState<Entreprise | null>(null);
  const [guide, setGuide] = useState(false);
  // comptes administrateurs d'une entreprise (installation de sa base vide)
  const [admins, setAdmins] = useState<Entreprise | null>(null);

  const lireChiffres = useCallback((e: Entreprise) => {
    setChiffres((c) => ({ ...c, [e.id]: 'chargement' }));
    chiffresEntreprise(e).then((r) => setChiffres((c) => ({ ...c, [e.id]: r })));
  }, []);
  const charger = useCallback(async () => {
    try {
      const l = await fetchEntreprises();
      setListe(l);
      setErreur('');
      l.forEach(lireChiffres);
    } catch (e) {
      setErreur(errMsg(e));
    } finally {
      setCharge(true);
    }
  }, [lireChiffres]);
  useEffect(() => {
    // premier chargement (les mises à jour d'état ont lieu après la réponse de la base)
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const resume = useMemo(() => {
    const r = { total: liste.length, actives: 0, essai: 0, suspendues: 0, expirent: 0, utilisateurs: 0, fiches: 0 };
    for (const e of liste) {
      if (e.statut === 'actif') r.actives++;
      if (e.statut === 'essai') r.essai++;
      if (e.statut === 'suspendu') r.suspendues++;
      const j = jours(e.fin);
      if (j != null && j <= 30 && e.statut !== 'suspendu') r.expirent++;
      const c = chiffres[e.id];
      if (c && c !== 'chargement') {
        r.utilisateurs += c.utilisateurs ?? 0;
        r.fiches += c.ceMois ?? 0;
      }
    }
    return r;
  }, [liste, chiffres]);

  const changerStatut = async (e: Entreprise, statut: StatutEntreprise) => {
    try {
      const maj = await enregistrerEntreprise({ ...e, statut });
      try {
        await pousserAbonnement(maj, statut === 'suspendu' ? `L'accès de ${e.nom} est suspendu. Contactez votre fournisseur.` : '');
      } catch (err) {
        showToast(`Registre mis à jour, mais la base de ${e.nom} n'a pas répondu : ${errMsg(err)}`, 'warning');
      }
      setListe((l) => l.map((x) => (x.id === e.id ? maj : x)));
      lireChiffres(maj);
      showToast(statut === 'suspendu' ? `${e.nom} : accès suspendu` : `${e.nom} : accès rétabli`, statut === 'suspendu' ? 'warning' : 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };
  const supprimer = async (e: Entreprise) => {
    if (!window.confirm(`Retirer ${e.nom} de la liste ? Sa base de données n'est pas touchée.`)) return;
    try {
      await supprimerEntreprise(e.id);
      setListe((l) => l.filter((x) => x.id !== e.id));
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  if (!user.superadmin) return <EmptyState icon="" text="Réservé au super-administrateur." />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Entreprises clientes</h1>
            <p className="text-sm text-slate-500">Une base de données par entreprise : données séparées, personnalisation et abonnement gérés d'ici.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => (setChiffres({}), charger())} icon={<RefreshCw className="w-4 h-4" />}>
            Actualiser
          </Button>
          <Button onClick={() => setForm({ ...ENTREPRISE_VIDE })} icon={<Plus className="w-4 h-4" />}>
            Nouvelle entreprise
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard value={resume.total} label="Entreprises" icon="" accent="#1565C0" />
        <StatCard value={resume.actives} label="Actives" icon="" accent="#2E7D32" />
        <StatCard value={resume.essai} label="En essai" icon="" accent="#0284C7" />
        <StatCard value={resume.suspendues} label="Suspendues" icon="" accent="#C62828" />
        <StatCard value={resume.expirent} label="Fin d'abonnement ≤ 30 j" icon="" accent="#E65100" />
        <StatCard value={resume.utilisateurs} label="Utilisateurs (total)" icon="" accent="#6D28D9" />
      </div>

      <Card className="p-0 overflow-hidden">
        <button type="button" onClick={() => setGuide(!guide)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Mettre en service une nouvelle entreprise
          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${guide ? 'rotate-180' : ''}`} />
        </button>
        {guide && (
          <ol className="px-6 pb-4 text-sm text-slate-600 list-decimal space-y-1.5">
            <li>Créer un projet Supabase pour l'entreprise (ses données restent dans sa propre base).</li>
            <li>Y exécuter les fichiers SQL de l'application (schéma complet, puis les modules), dont <code className="text-xs bg-slate-100 px-1 rounded">supabase_superadmin.sql</code>.</li>
            <li>Déployer les fonctions du dossier supabase/functions (login, change-password, admin-users, installation, create-team-leader).</li>
            <li>Créer ses comptes : « Administrateurs » sur sa fiche ici, ou l’écran d’installation qui s’affiche à la première ouverture de son site.</li>
            <li>Publier l'application (même code) avec <code className="text-xs bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code> et <code className="text-xs bg-slate-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> de ce projet, sur son adresse (ex. client.gss-app.com).</li>
            <li>L'ajouter ici (« Nouvelle entreprise ») avec l'adresse et la clé anon du projet, puis « Personnaliser » : nom, logo, couleurs, police, menus.</li>
          </ol>
        )}
      </Card>

      {erreur && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{erreur}</p>}
      {charge && !erreur && liste.length === 0 && <EmptyState icon="" text="Aucune entreprise pour l'instant : ajoutez la première avec « Nouvelle entreprise »." />}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {liste.map((e) => {
          const c = chiffres[e.id];
          const pret = c && c !== 'chargement' ? c : null;
          const j = jours(e.fin);
          return (
            <Card key={e.id} className="p-0 overflow-hidden flex flex-col">
              <div className="h-1.5" style={{ background: pret ? `linear-gradient(90deg, ${pret.marque.couleurPrincipale}, ${pret.marque.couleurSecondaire})` : '#E2E8F0' }} />
              <div className="p-4 space-y-3 flex-1">
                <div className="flex items-start gap-3">
                  {pret ? <LogoMarque taille="md" marque={pret.marque} /> : <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900 truncate">{e.nom}</p>
                    <p className="text-xs text-slate-400 truncate">{pret?.marque.nomComplet || e.slug}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUT[e.statut].cls}`}>{STATUT[e.statut].label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ['Utilisateurs', pret?.utilisateurs ?? null],
                      ['Équipes', pret?.equipes ?? null],
                      ['Fiches ce mois', pret?.ceMois ?? null],
                      ['Fiches (total)', pret?.situations ?? null],
                      ['Ouvertes', pret?.ouvertes ?? null],
                    ] as const
                  ).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-base font-black text-slate-800 tabular-nums">{c === 'chargement' ? '…' : nb(v)}</p>
                      <p className="text-[10px] text-slate-400">{l}</p>
                    </div>
                  ))}
                  <div className="rounded-lg bg-slate-50 py-1.5">
                    <p className="text-xs font-bold text-slate-700 mt-1">{pret?.derniereActivite ? fr(pret.derniereActivite) : '—'}</p>
                    <p className="text-[10px] text-slate-400">Dernière activité</p>
                  </div>
                </div>
                {pret && !pret.joignable && <p className="text-[11px] text-red-600 bg-red-50 rounded-md px-2 py-1">{pret.erreur}</p>}
                <div className="text-xs text-slate-500 space-y-0.5">
                  {(e.contactNom || e.contactTelephone) && (
                    <p>
                      Contact : <span className="text-slate-700">{[e.contactNom, e.contactTelephone, e.contactEmail].filter(Boolean).join(' · ')}</span>
                    </p>
                  )}
                  <p>
                    Abonnement : {fr(e.debut)} → {fr(e.fin)}
                    {j != null && e.statut !== 'suspendu' && (
                      <span className={`ml-1 font-semibold ${j < 0 ? 'text-red-600' : j <= 30 ? 'text-orange-600' : 'text-slate-500'}`}>
                        ({j < 0 ? `échu depuis ${-j} j` : `${j} j restants`})
                      </span>
                    )}
                  </p>
                  {pret && pret.marque.specialites.length > 0 && <p className="truncate">Spécialités : {pret.marque.specialites.join(', ')}</p>}
                </div>
              </div>
              <div className="border-t border-slate-100 p-2 flex flex-wrap gap-1">
                {e.siteUrl && (
                  <a href={e.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    <ExternalLink className="w-3.5 h-3.5" /> Site
                  </a>
                )}
                <button type="button" disabled={!pret?.joignable} onClick={() => setPerso(e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                  <Palette className="w-3.5 h-3.5" /> Personnaliser
                </button>
                <button type="button" disabled={!clientDe(e)} onClick={() => setAdmins(e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                  <UserCog className="w-3.5 h-3.5" /> Administrateurs
                </button>
                <button type="button" onClick={() => setForm({ ...e })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  <Pencil className="w-3.5 h-3.5" /> Modifier
                </button>
                {e.statut === 'suspendu' ? (
                  <button type="button" onClick={() => changerStatut(e, 'actif')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                    <PlayCircle className="w-3.5 h-3.5" /> Rétablir
                  </button>
                ) : (
                  <button type="button" onClick={() => changerStatut(e, 'suspendu')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-orange-700 hover:bg-orange-50">
                    <PauseCircle className="w-3.5 h-3.5" /> Suspendre
                  </button>
                )}
                <button type="button" onClick={() => supprimer(e)} className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50" aria-label={`Retirer ${e.nom}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {form && (
        <FormulaireEntreprise
          initiale={form}
          onClose={() => setForm(null)}
          onEnregistre={(e) => {
            setListe((l) => (l.some((x) => x.id === e.id) ? l.map((x) => (x.id === e.id ? e : x)) : [...l, e].sort((a, b) => a.nom.localeCompare(b.nom))));
            lireChiffres(e);
            // nouvelle entreprise : créer tout de suite ses administrateurs
            if (!form.id && clientDe(e)) setAdmins(e);
            setForm(null);
          }}
        />
      )}

      {admins && (
        <AdministrateursEntreprise
          entreprise={admins}
          onClose={() => {
            lireChiffres(admins);
            setAdmins(null);
          }}
        />
      )}

      {perso && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center p-0 sm:p-4" onClick={(ev) => ev.target === ev.currentTarget && setPerso(null)}>
          <div className="bg-slate-50 w-full max-w-6xl sm:rounded-2xl overflow-y-auto shadow-2xl">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3">
              <Palette className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 truncate">Personnaliser {perso.nom}</h2>
              <button type="button" onClick={() => setPerso(null)} className="ml-auto p-1.5 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <EditeurMarque
                pour={perso.nom}
                initiale={(chiffres[perso.id] as ChiffresEntreprise).marque}
                onEnregistrer={async (m) => {
                  const c = clientDe(perso);
                  if (!c) throw new Error('Adresse ou clé Supabase manquante');
                  await enregistrerMarque(m, c);
                  lireChiffres(perso);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormulaireEntreprise({
  initiale,
  onClose,
  onEnregistre,
}: {
  initiale: Omit<Entreprise, 'id' | 'createdAt'> & { id?: string };
  onClose: () => void;
  onEnregistre: (e: Entreprise) => void;
}) {
  const { showToast } = useToast();
  const [f, setF] = useState(initiale);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<string>('');
  const maj = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const tester = async () => {
    setTest('Connexion…');
    const r = await chiffresEntreprise({ ...f, id: f.id ?? 'test', createdAt: '' } as Entreprise);
    setTest(r.joignable ? `✓ Base joignable : ${r.utilisateurs ?? 0} utilisateur(s), ${r.situations ?? 0} fiche(s), marque « ${r.marque.nom} »` : `✗ ${r.erreur}`);
  };
  const enregistrer = async () => {
    if (!f.nom.trim()) return showToast("Nom de l'entreprise obligatoire", 'error');
    setSaving(true);
    try {
      const e = await enregistrerEntreprise(f);
      // le statut est recopié dans la base de l'entreprise (écran « Accès suspendu »)
      if (clientDe(e)) await pousserAbonnement(e, e.statut === 'suspendu' ? `L'accès de ${e.nom} est suspendu. Contactez votre fournisseur.` : '').catch(() => undefined);
      showToast(`${e.nom} enregistrée`, 'success');
      onEnregistre(e);
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={f.id ? `Modifier ${initiale.nom}` : 'Nouvelle entreprise'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="e-nom">Nom de l'entreprise *</label>
            <Input id="e-nom" value={f.nom} onChange={(e) => maj({ nom: e.target.value, slug: f.id ? f.slug : slugDe(e.target.value) })} placeholder="ex. Télécom Services SA" />
          </div>
          <div>
            <label className={label} htmlFor="e-slug">Identifiant</label>
            <Input id="e-slug" value={f.slug} onChange={(e) => maj({ slug: slugDe(e.target.value) })} placeholder="telecom-services" />
          </div>
          <div>
            <label className={label} htmlFor="e-statut">Statut</label>
            <Select id="e-statut" className="w-full" value={f.statut} onChange={(e) => maj({ statut: e.target.value as StatutEntreprise })}>
              <option value="essai">Essai</option>
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
            </Select>
          </div>
          <div>
            <label className={label} htmlFor="e-debut">Début d'abonnement</label>
            <Input id="e-debut" type="date" value={f.debut ?? ''} onChange={(e) => maj({ debut: e.target.value || null })} />
          </div>
          <div>
            <label className={label} htmlFor="e-fin">Fin d'abonnement</label>
            <Input id="e-fin" type="date" value={f.fin ?? ''} onChange={(e) => maj({ fin: e.target.value || null })} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="e-site">Adresse du site</label>
            <Input id="e-site" value={f.siteUrl} onChange={(e) => maj({ siteUrl: e.target.value })} placeholder="https://client.gss-app.com" />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="e-sburl">Supabase : adresse du projet</label>
            <Input id="e-sburl" value={f.supabaseUrl} onChange={(e) => maj({ supabaseUrl: e.target.value })} placeholder="https://xxxx.supabase.co" />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="e-sbcle">Supabase : clé publique (anon)</label>
            <Textarea id="e-sbcle" rows={2} value={f.supabaseCle} onChange={(e) => maj({ supabaseCle: e.target.value })} placeholder="eyJhbGciOi…" className="font-mono text-xs" />
            <div className="flex items-center gap-2 mt-1.5">
              <Button variant="outline" size="sm" onClick={tester}>
                Tester la connexion
              </Button>
              {test && <span className={`text-xs ${test.startsWith('✓') ? 'text-emerald-700' : test.startsWith('✗') ? 'text-red-600' : 'text-slate-500'}`}>{test}</span>}
            </div>
          </div>
          <div>
            <label className={label} htmlFor="e-cnom">Contact</label>
            <Input id="e-cnom" value={f.contactNom} onChange={(e) => maj({ contactNom: e.target.value })} placeholder="Nom" />
          </div>
          <div>
            <label className={label} htmlFor="e-ctel">Téléphone</label>
            <Input id="e-ctel" value={f.contactTelephone} onChange={(e) => maj({ contactTelephone: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="e-cmail">E-mail</label>
            <Input id="e-cmail" type="email" value={f.contactEmail} onChange={(e) => maj({ contactEmail: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="e-notes">Notes</label>
            <Textarea id="e-notes" rows={2} value={f.notes} onChange={(e) => maj({ notes: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1 justify-center" onClick={enregistrer} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Administrateurs d'une entreprise : créés dans SA base tant qu'elle n'a aucun administrateur */
function AdministrateursEntreprise({ entreprise, onClose }: { entreprise: Entreprise; onClose: () => void }) {
  const client = clientDe(entreprise);
  const [etat, setEtat] = useState<EtatInstallation | null>(null);
  const [avecSuper, setAvecSuper] = useState(false);
  useEffect(() => {
    if (client) etatInstallation(client).then(setEtat);
  }, [client]);

  return (
    <Modal open onClose={onClose} title={`Administrateurs — ${entreprise.nom}`} size="lg">
      {!client ? (
        <p className="text-sm text-red-600">Adresse ou clé Supabase manquante : complétez la fiche de l’entreprise.</p>
      ) : !etat ? (
        <p className="text-sm text-slate-500 py-6 text-center">Vérification de la base…</p>
      ) : !etat.disponible ? (
        <div className="space-y-2 text-sm">
          <p className="text-red-600 font-semibold">{etat.erreur}</p>
          <p className="text-slate-600">
            Déployez la fonction dans le projet de l’entreprise : <code className="text-xs bg-slate-100 px-1 rounded">supabase functions deploy installation</code>, après avoir exécuté
            <code className="text-xs bg-slate-100 px-1 rounded ml-1">supabase_schema.sql</code>.
          </p>
        </div>
      ) : etat.installe ? (
        <p className="text-sm text-slate-700">
          La base de <strong>{entreprise.nom}</strong> a déjà un administrateur. Les autres comptes (chefs, techniciens, administrateurs…) se créent dans sa page
          <strong> Utilisateurs</strong>, en se connectant à son application.
        </p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={avecSuper} onChange={(e) => setAvecSuper(e.target.checked)} />
            Créer aussi un compte super-administrateur dans cette base
          </label>
          <InstallationEntreprise key={String(avecSuper)} client={client} avecSuperadmin={avecSuper} entrepriseInitiale={entreprise.nom} jetonRequis={etat.jetonRequis} />
        </div>
      )}
    </Modal>
  );
}
