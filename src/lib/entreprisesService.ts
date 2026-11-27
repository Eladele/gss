// Entreprises clientes (console du super-administrateur).
//
// Chaque entreprise a SON projet Supabase (données séparées). La liste des entreprises est rangée
// dans la base du fournisseur (table « entreprises », supabase_superadmin.sql) avec l'adresse et la
// clé publique (anon) de leur base : la console s'y connecte pour lire leurs chiffres, modifier
// leur personnalisation et suspendre / rétablir leur accès.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ABONNEMENT_DEFAUT, enregistrerAbonnement, lireMarque, MARQUE_DEFAUT, type Abonnement, type Marque } from './marque';

export type StatutEntreprise = 'essai' | 'actif' | 'suspendu';

export interface Entreprise {
  id: string;
  nom: string;
  slug: string;
  siteUrl: string;
  supabaseUrl: string;
  supabaseCle: string; // clé publique « anon » du projet Supabase de l'entreprise
  contactNom: string;
  contactTelephone: string;
  contactEmail: string;
  statut: StatutEntreprise;
  debut: string | null;
  fin: string | null;
  notes: string;
  createdAt: string;
}

export const ENTREPRISE_VIDE: Omit<Entreprise, 'id' | 'createdAt'> = {
  nom: '',
  slug: '',
  siteUrl: '',
  supabaseUrl: '',
  supabaseCle: '',
  contactNom: '',
  contactTelephone: '',
  contactEmail: '',
  statut: 'essai',
  debut: new Date().toISOString().slice(0, 10),
  fin: null,
  notes: '',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const versEntreprise = (r: any): Entreprise => ({
  id: r.id,
  nom: r.nom ?? '',
  slug: r.slug ?? '',
  siteUrl: r.site_url ?? '',
  supabaseUrl: r.supabase_url ?? '',
  supabaseCle: r.supabase_cle ?? '',
  contactNom: r.contact_nom ?? '',
  contactTelephone: r.contact_telephone ?? '',
  contactEmail: r.contact_email ?? '',
  statut: r.statut === 'actif' || r.statut === 'suspendu' ? r.statut : 'essai',
  debut: r.debut ?? null,
  fin: r.fin ?? null,
  notes: r.notes ?? '',
  createdAt: r.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function erreur(e: { code?: string; message?: string } | null, defaut: string) {
  if (e?.code === '42P01' || /relation .*entreprises/.test(e?.message ?? '')) return new Error('La table des entreprises n’est pas encore créée (exécuter supabase_superadmin.sql).');
  return new Error(e?.message || defaut);
}

export const slugDe = (nom: string) =>
  nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export async function fetchEntreprises(): Promise<Entreprise[]> {
  const { data, error } = await supabase.from('entreprises').select('*').order('nom');
  if (error) throw erreur(error, 'Chargement des entreprises impossible');
  return (data ?? []).map(versEntreprise);
}

export async function enregistrerEntreprise(e: Omit<Entreprise, 'id' | 'createdAt'> & { id?: string }): Promise<Entreprise> {
  const ligne = {
    nom: e.nom.trim(),
    slug: (e.slug || slugDe(e.nom)).trim(),
    site_url: e.siteUrl.trim(),
    supabase_url: e.supabaseUrl.trim().replace(/\/+$/, ''),
    supabase_cle: e.supabaseCle.trim(),
    contact_nom: e.contactNom.trim(),
    contact_telephone: e.contactTelephone.trim(),
    contact_email: e.contactEmail.trim(),
    statut: e.statut,
    debut: e.debut || null,
    fin: e.fin || null,
    notes: e.notes,
    updated_at: new Date().toISOString(),
  };
  const q = e.id ? supabase.from('entreprises').update(ligne).eq('id', e.id).select().single() : supabase.from('entreprises').insert(ligne).select().single();
  const { data, error } = await q;
  if (error) {
    if (error.code === '23505') throw new Error('Une entreprise porte déjà cet identifiant (slug).');
    throw erreur(error, 'Enregistrement impossible');
  }
  return versEntreprise(data);
}

export async function supprimerEntreprise(id: string): Promise<void> {
  const { error } = await supabase.from('entreprises').delete().eq('id', id);
  if (error) throw erreur(error, 'Suppression impossible');
}

// ─── Connexion à la base d'une entreprise ────────────────────────────────────

const clients = new Map<string, SupabaseClient>();
/** Client Supabase vers la base de l'entreprise (sans session : lecture / réglages seulement) */
export function clientDe(e: Pick<Entreprise, 'supabaseUrl' | 'supabaseCle'>): SupabaseClient | null {
  if (!/^https:\/\/.+/.test(e.supabaseUrl) || e.supabaseCle.length < 20) return null;
  const cle = `${e.supabaseUrl}|${e.supabaseCle}`;
  let c = clients.get(cle);
  if (!c) {
    c = createClient(e.supabaseUrl, e.supabaseCle, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `ent-${cle.length}-${e.supabaseUrl}` } });
    clients.set(cle, c);
  }
  return c;
}

export interface ChiffresEntreprise {
  joignable: boolean;
  erreur?: string;
  marque: Marque;
  abonnement: Abonnement;
  utilisateurs: number | null;
  equipes: number | null;
  situations: number | null;
  ouvertes: number | null;
  ceMois: number | null;
  derniereActivite: string | null;
}

const compter = async (c: SupabaseClient, table: string, filtre?: (q: any) => any): Promise<number | null> => { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = c.from(table).select('id', { count: 'exact', head: true });
  if (filtre) q = filtre(q);
  const { count, error } = await q;
  return error ? null : (count ?? 0);
};

/** Chiffres d'une entreprise, lus dans sa base (null si la base ne répond pas) */
export async function chiffresEntreprise(e: Entreprise): Promise<ChiffresEntreprise> {
  const vide: ChiffresEntreprise = { joignable: false, marque: MARQUE_DEFAUT, abonnement: ABONNEMENT_DEFAUT, utilisateurs: null, equipes: null, situations: null, ouvertes: null, ceMois: null, derniereActivite: null };
  const c = clientDe(e);
  if (!c) return { ...vide, erreur: 'Adresse ou clé Supabase manquante' };
  const debutMois = new Date();
  debutMois.setDate(1);
  const mois = debutMois.toISOString().slice(0, 10);
  try {
    const [m, utilisateurs, equipes, situations, ouvertes, ceMois, derniere] = await Promise.all([
      lireMarque(c).catch(() => null),
      compter(c, 'profiles'),
      compter(c, 'teams'),
      compter(c, 'situations'),
      compter(c, 'situations', (q) => q.in('status', ['pending', 'in_progress', 'urgent'])),
      compter(c, 'situations', (q) => q.gte('created_at', mois)),
      c.from('situations').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    ]);
    const joignable = utilisateurs != null || situations != null;
    return {
      joignable,
      erreur: joignable ? undefined : 'Base injoignable (adresse, clé ou tables manquantes)',
      marque: m?.marque ?? MARQUE_DEFAUT,
      abonnement: m?.abonnement ?? ABONNEMENT_DEFAUT,
      utilisateurs,
      equipes,
      situations,
      ouvertes,
      ceMois,
      derniereActivite: (derniere.data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null,
    };
  } catch (err) {
    return { ...vide, erreur: err instanceof Error ? err.message : String(err) };
  }
}

/** Statut du registre → abonnement dans la base de l'entreprise (l'écran « Accès suspendu ») */
export async function pousserAbonnement(e: Entreprise, message = ''): Promise<void> {
  const c = clientDe(e);
  if (!c) throw new Error('Adresse ou clé Supabase manquante');
  await enregistrerAbonnement({ statut: e.statut, fin: e.fin, message }, c);
}

// ─── Installation d'une nouvelle base (Edge Function « installation ») ───────

export interface EtatInstallation {
  /** fonction « installation » déployée et joignable */
  disponible: boolean;
  /** au moins un administrateur existe déjà */
  installe: boolean;
  /** la fonction demande un code d'installation (secret INSTALL_TOKEN) */
  jetonRequis: boolean;
  /** un super-administrateur existe déjà (sinon : inscription possible depuis la connexion) */
  superadmin: boolean;
  erreur?: string;
}

export interface CompteInstallation {
  name: string;
  password?: string;
}

export interface CompteCree {
  name: string;
  password: string;
  superadmin: boolean;
}

/** message précis d'une Edge Function en erreur (corps JSON de la réponse) */
async function messageFonction(error: { message: string; context?: unknown }, defaut: string): Promise<string> {
  try {
    const ctx = error.context as { json?: () => Promise<{ error?: string }> } | undefined;
    const corps = ctx?.json ? await ctx.json() : undefined;
    if (corps?.error) return corps.error;
  } catch {
    // corps illisible
  }
  if (/Failed to send|not found|404/i.test(error.message)) return 'Fonction « installation » non déployée sur ce projet';
  return defaut;
}

/** La base est-elle vide (aucun administrateur) ? — base de l'application, ou celle d'une entreprise */
export async function etatInstallation(client: SupabaseClient = supabase): Promise<EtatInstallation> {
  const { data, error } = await client.functions.invoke('installation', { body: { action: 'etat' } });
  if (error) return { disponible: false, installe: true, jetonRequis: false, superadmin: true, erreur: await messageFonction(error, 'Installation indisponible') };
  // ancienne version de la fonction (sans « superadmin ») : on ne propose pas l'inscription
  return { disponible: true, installe: data?.installe !== false, jetonRequis: data?.jetonRequis === true, superadmin: data?.superadmin !== false };
}

/** Base déjà installée sans super-administrateur : inscription avec les identifiants d'un administrateur */
export async function inscrireSuperadmin(params: {
  superadmin: CompteInstallation;
  admin_name?: string;
  admin_password?: string;
  token?: string;
}): Promise<CompteCree> {
  const { data, error } = await supabase.functions.invoke('installation', { body: { action: 'inscrire_superadmin', ...params } });
  if (error) throw new Error(await messageFonction(error, 'Inscription impossible'));
  const c = (data?.comptes ?? [])[0] as CompteCree | undefined;
  if (!c) throw new Error('Réponse inattendue de la fonction installation');
  return c;
}

/** Crée le super-administrateur (facultatif), le nom de l'entreprise et ses administrateurs */
export async function installerBase(
  params: { entreprise: { nom: string; nomComplet?: string }; superadmin?: CompteInstallation | null; admins: CompteInstallation[]; token?: string },
  client: SupabaseClient = supabase,
): Promise<{ comptes: CompteCree[]; avertissement?: string }> {
  const { data, error } = await client.functions.invoke('installation', { body: { action: 'installer', ...params } });
  if (error) throw new Error(await messageFonction(error, 'Installation impossible'));
  return { comptes: (data?.comptes ?? []) as CompteCree[], avertissement: data?.avertissement };
}
