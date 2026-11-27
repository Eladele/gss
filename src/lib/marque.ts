// Personnalisation de l'application pour chaque entreprise cliente (« marque blanche »).
//
// Une entreprise = son propre projet Supabase (données séparées). Sa marque est rangée dans sa
// propre base (app_settings, clé « marque ») : nom, logo, couleurs, police, taille de l'écriture,
// pages du menu (affichées ou non, renommées), spécialités. Elle est lue au démarrage, avant même
// l'écran de connexion, puis appliquée à toute l'application (couleurs, police, logo, titres,
// exports Excel / PDF). Le super-administrateur la modifie depuis « Personnalisation » (sa propre
// entreprise) ou depuis « Entreprises » (n'importe quel client, à distance).
//
// L'abonnement (clé « abonnement ») : un client suspendu voit un écran « Accès suspendu ».
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { GSS_LOGO_BASE64 } from '@/assets/logoBase64';

export type PageId =
  | 'dashboard'
  | 'situations'
  | 'chef-situations'
  | 'programme'
  | 'import-excel'
  | 'equipes'
  | 'zones'
  | 'notifications'
  | 'profil'
  | 'statistiques'
  | 'employes'
  | 'vehicules'
  | 'materiels'
  | 'scans'
  | 'prets'
  | 'deploiement'
  | 'maintenance'
  | 'reseau'
  | 'conges'
  | 'caisses'
  | 'distribution'
  | 'points'
  | 'surveillance'
  | 'export-salaire'
  | 'parametres'
  | 'personnalisation'
  | 'entreprises'
  | 'utilisateurs';

/** Pages que l'on peut afficher / masquer / renommer, rangées comme dans le menu */
export const CATALOGUE_PAGES: { id: PageId; libelle: string; rubrique: string }[] = [
  { id: 'dashboard', libelle: 'Dashboard', rubrique: 'Suivi' },
  { id: 'surveillance', libelle: 'Surveillance équipes', rubrique: 'Suivi' },
  { id: 'points', libelle: 'Points équipes', rubrique: 'Suivi' },
  { id: 'programme', libelle: 'Programme', rubrique: 'Suivi' },
  { id: 'situations', libelle: 'Situations', rubrique: 'Raccordement' },
  { id: 'distribution', libelle: 'Distribuer programme', rubrique: 'Raccordement' },
  { id: 'scans', libelle: 'Scan Réseau', rubrique: 'Raccordement' },
  { id: 'import-excel', libelle: 'Import Excel', rubrique: 'Raccordement' },
  { id: 'deploiement', libelle: 'Chantiers', rubrique: 'Déploiement' },
  { id: 'reseau', libelle: 'Arborescence Réseau', rubrique: 'Déploiement' },
  { id: 'maintenance', libelle: 'Maintenance', rubrique: 'Déploiement' },
  { id: 'zones', libelle: 'Zones', rubrique: 'Déploiement' },
  { id: 'employes', libelle: 'Employés', rubrique: 'RH' },
  { id: 'conges', libelle: 'Congés', rubrique: 'RH' },
  { id: 'prets', libelle: 'Prêts', rubrique: 'RH' },
  { id: 'export-salaire', libelle: 'Export Salaires', rubrique: 'RH' },
  { id: 'equipes', libelle: 'Équipes', rubrique: 'RH' },
  { id: 'materiels', libelle: 'Matériel', rubrique: 'RH' },
  { id: 'vehicules', libelle: 'Véhicules', rubrique: 'RH' },
  { id: 'caisses', libelle: 'Caisses', rubrique: 'Gestion' },
  { id: 'notifications', libelle: 'Notifications', rubrique: 'Gestion' },
  { id: 'parametres', libelle: 'Paramètres', rubrique: 'Gestion' },
];
/** Rubriques du menu que l'on peut renommer (identifiants des groupes du menu) */
export const CATALOGUE_RUBRIQUES: { id: string; libelle: string }[] = [
  { id: 'raccordement-group', libelle: 'Raccordement' },
  { id: 'deploiement-group', libelle: 'Déploiement' },
  { id: 'rh-group', libelle: 'RH' },
];
/** Pages toujours visibles (on ne peut pas se priver de son profil ni de la personnalisation) */
export const PAGES_VERROUILLEES: PageId[] = ['profil', 'personnalisation', 'entreprises', 'utilisateurs'];

export const POLICES = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Open Sans', 'Lato', 'Nunito', 'Source Sans 3', 'Cairo', 'Tajawal'] as const;

export interface PageMarque {
  actif: boolean;
  libelle: string; // '' = libellé par défaut
}

export interface Marque {
  nom: string; // court, sur le badge et les pieds de page : « GSS »
  nomComplet: string; // « Gestion Situations & Supervision »
  slogan: string; // sous « Connexion » : « Program Manager · FTTH Moov Mauritel »
  logo: string; // data URL (PNG / JPEG) ; '' = logo GSS intégré
  logoRatio: number; // largeur / hauteur du logo (exports)
  couleurPrincipale: string;
  couleurSecondaire: string;
  police: string;
  taille: number; // taille de base de l'écriture, en px (16 = normale)
  pages: Partial<Record<PageId, PageMarque>>;
  rubriques: Record<string, string>; // groupe du menu → libellé
  specialites: string[];
}

export const COULEUR_DEFAUT = '#1565C0';
export const MARQUE_DEFAUT: Marque = {
  nom: 'GSS',
  nomComplet: 'Gestion Situations & Supervision',
  slogan: 'Program Manager · FTTH Moov Mauritel',
  logo: '',
  logoRatio: 228 / 140,
  couleurPrincipale: COULEUR_DEFAUT,
  couleurSecondaire: '#00BCD4',
  police: 'Inter',
  taille: 16,
  pages: {},
  rubriques: {},
  specialites: [],
};

export interface Abonnement {
  statut: 'actif' | 'essai' | 'suspendu';
  fin: string | null; // YYYY-MM-DD
  message: string;
}
export const ABONNEMENT_DEFAUT: Abonnement = { statut: 'actif', fin: null, message: '' };

// ─── Lecture / écriture (dans la base de l'entreprise : la sienne ou celle d'un client) ──────────

const couleurValide = (c: unknown, d: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
const texte = (v: unknown, d: string, max = 120) => (typeof v === 'string' ? v.slice(0, max) : d);

/** Nettoie une marque venue de la base (champs manquants → valeurs GSS) */
export function marqueDepuisBase(v: unknown): Marque {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pages: Marque['pages'] = {};
  const p = (o.pages && typeof o.pages === 'object' ? o.pages : {}) as Record<string, unknown>;
  for (const { id } of CATALOGUE_PAGES) {
    const x = p[id] as Record<string, unknown> | undefined;
    if (x && typeof x === 'object') pages[id] = { actif: x.actif !== false, libelle: texte(x.libelle, '', 40) };
  }
  const r = (o.rubriques && typeof o.rubriques === 'object' ? o.rubriques : {}) as Record<string, unknown>;
  const rubriques: Record<string, string> = {};
  for (const { id } of CATALOGUE_RUBRIQUES) if (typeof r[id] === 'string' && r[id]) rubriques[id] = texte(r[id], '', 40);
  const taille = Number(o.taille);
  const ratio = Number(o.logoRatio);
  return {
    nom: texte(o.nom, MARQUE_DEFAUT.nom, 24) || MARQUE_DEFAUT.nom,
    nomComplet: texte(o.nomComplet, MARQUE_DEFAUT.nomComplet),
    slogan: texte(o.slogan, MARQUE_DEFAUT.slogan),
    logo: typeof o.logo === 'string' && o.logo.startsWith('data:image/') ? o.logo : '',
    logoRatio: ratio > 0.2 && ratio < 10 ? ratio : MARQUE_DEFAUT.logoRatio,
    couleurPrincipale: couleurValide(o.couleurPrincipale, MARQUE_DEFAUT.couleurPrincipale),
    couleurSecondaire: couleurValide(o.couleurSecondaire, MARQUE_DEFAUT.couleurSecondaire),
    police: (POLICES as readonly string[]).includes(o.police as string) ? (o.police as string) : MARQUE_DEFAUT.police,
    taille: taille >= 12 && taille <= 20 ? taille : MARQUE_DEFAUT.taille,
    pages,
    rubriques,
    specialites: Array.isArray(o.specialites) ? o.specialites.filter((s) => typeof s === 'string' && s.trim()).map((s) => (s as string).trim().slice(0, 40)).slice(0, 12) : [],
  };
}

export function abonnementDepuisBase(v: unknown): Abonnement {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const statut = o.statut === 'suspendu' || o.statut === 'essai' ? o.statut : 'actif';
  return { statut, fin: typeof o.fin === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fin) ? o.fin : null, message: texte(o.message, '', 300) };
}

const lireJson = (v: unknown) => {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** Marque et abonnement d'une base (la nôtre par défaut) */
export async function lireMarque(client: SupabaseClient = supabase): Promise<{ marque: Marque; abonnement: Abonnement }> {
  const { data, error } = await client.from('app_settings').select('key, value').in('key', ['marque', 'abonnement']);
  if (error) throw new Error(error.message);
  const val = (k: string) => lireJson((data ?? []).find((r) => r.key === k)?.value);
  return { marque: marqueDepuisBase(val('marque')), abonnement: abonnementDepuisBase(val('abonnement')) };
}

export async function enregistrerMarque(m: Marque, client: SupabaseClient = supabase): Promise<Marque> {
  const propre = marqueDepuisBase(m);
  const { error } = await client.from('app_settings').upsert({ key: 'marque', value: JSON.stringify(propre) }, { onConflict: 'key' });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  return propre;
}

export async function enregistrerAbonnement(a: Abonnement, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('app_settings').upsert({ key: 'abonnement', value: JSON.stringify(abonnementDepuisBase(a)) }, { onConflict: 'key' });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
}

// ─── Application à l'écran ───────────────────────────────────────────────────

/** Nuancier à partir d'une couleur : 50 (très clair) … 950 (très foncé) */
export function nuancier(c: string): Record<number, string> {
  const clair = (p: number) => `color-mix(in oklab, ${c} ${p}%, white)`;
  const fonce = (p: number) => `color-mix(in oklab, ${c} ${p}%, black)`;
  return { 50: clair(8), 100: clair(16), 200: clair(30), 300: clair(48), 400: clair(70), 500: clair(88), 600: c, 700: fonce(85), 800: fonce(70), 900: fonce(55), 950: fonce(40) };
}

const ID_POLICE = 'marque-police';

/** Charge une police Google Fonts (Inter est déjà chargée par index.html) */
export function chargerPolice(police: string, id = `police-${police.replace(/\W+/g, '-')}`) {
  if (police === 'Inter') return;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(police).replace(/%20/g, '+')}:wght@400;500;600;700;800;900&display=swap`;
  let lien = document.getElementById(id) as HTMLLinkElement | null;
  if (!lien) {
    lien = document.createElement('link');
    lien.id = id;
    lien.rel = 'stylesheet';
    document.head.appendChild(lien);
  }
  if (lien.href !== href) lien.href = href;
}
const CLE_CACHE = 'gss.marque';

/**
 * Applique la marque à toute l'application : la couleur principale remplace le bleu de l'interface
 * (boutons, liens, onglets…), la seconde le turquoise ; police, taille de l'écriture, titre de
 * l'onglet, icône et couleur de la barre du téléphone.
 */
export function appliquerMarque(m: Marque, memoriser = true) {
  const root = document.documentElement;
  const n = nuancier(m.couleurPrincipale);
  const perso = m.couleurPrincipale.toLowerCase() !== COULEUR_DEFAUT.toLowerCase();
  for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
    // couleur GSS d'origine : on garde le bleu de Tailwind tel quel
    if (perso) root.style.setProperty(`--color-blue-${k}`, n[k]);
    else root.style.removeProperty(`--color-blue-${k}`);
  }
  root.style.setProperty('--color-blue', m.couleurPrincipale);
  root.style.setProperty('--color-blue-light', n[400]);
  root.style.setProperty('--color-accent', m.couleurSecondaire);
  root.style.setProperty('--marque-1', m.couleurPrincipale);
  root.style.setProperty('--marque-2', m.couleurSecondaire);
  root.style.fontSize = m.taille === 16 ? '' : `${m.taille}px`;

  // police (Inter est déjà chargée par index.html)
  const pile = `'${m.police}', system-ui, sans-serif`;
  root.style.setProperty('--font-sans', pile);
  document.body.style.fontFamily = pile;
  chargerPolice(m.police, ID_POLICE);

  document.title = m.nomComplet ? `${m.nom} · ${m.nomComplet}` : m.nom;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m.couleurPrincipale);
  if (m.logo) {
    let icone = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!icone) {
      icone = document.createElement('link');
      icone.rel = 'icon';
      document.head.appendChild(icone);
    }
    icone.href = m.logo;
  }
  MARQUE_ACTIVE.valeur = m;
  if (!memoriser) return;
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(m));
  } catch {
    /* stockage plein ou indisponible : la marque sera relue en base */
  }
}

/** Dernière marque connue sur cet appareil (affichage immédiat avant la lecture en base) */
export function marqueEnCache(): Marque | null {
  try {
    const t = localStorage.getItem(CLE_CACHE);
    return t ? marqueDepuisBase(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

/** Marque en cours (lue par les exports Excel / PDF, hors React) */
export const MARQUE_ACTIVE: { valeur: Marque } = { valeur: MARQUE_DEFAUT };

/** Logo pour les exports : base64 sans préfixe, format et proportions */
export function logoExport(): { base64: string; extension: 'png' | 'jpeg'; dataUrl: string; ratio: number } {
  const m = MARQUE_ACTIVE.valeur;
  if (m.logo) {
    const [entete, b64] = m.logo.split(',');
    const extension = /image\/png/.test(entete) ? 'png' : 'jpeg';
    return { base64: b64 ?? '', extension, dataUrl: m.logo, ratio: m.logoRatio };
  }
  return { base64: GSS_LOGO_BASE64, extension: 'png', dataUrl: `data:image/png;base64,${GSS_LOGO_BASE64}`, ratio: 228 / 140 };
}

/** Nom court de l'entreprise (pieds de page des PDF…) */
export const nomMarque = () => MARQUE_ACTIVE.valeur.nom;

/** Libellé d'une page selon la marque (sinon celui par défaut) */
export function libellePage(m: Marque, id: PageId, defaut: string): string {
  return m.pages[id]?.libelle || defaut;
}
/** Page affichée dans le menu ? */
export function pageActive(m: Marque, id: PageId): boolean {
  return PAGES_VERROUILLEES.includes(id) || m.pages[id]?.actif !== false;
}

/**
 * Logo choisi par l'utilisateur → data URL réduite (max 480 px de large, PNG si transparence
 * possible) + proportions. Évite de stocker une photo de plusieurs Mo dans la base.
 */
export function preparerLogo(fichier: File): Promise<{ dataUrl: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(fichier.type)) return reject(new Error('Choisissez une image PNG, JPEG, WEBP ou SVG.'));
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible'));
      img.onload = () => {
        const max = 480;
        const l = img.naturalWidth || 480;
        const h = img.naturalHeight || 240;
        const k = Math.min(1, max / l);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(l * k);
        canvas.height = Math.round(h * k);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image illisible'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG garde la transparence ; JPEG pour les photos (plus léger)
        const png = fichier.type !== 'image/jpeg';
        resolve({ dataUrl: canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), ratio: canvas.width / canvas.height });
      };
      img.src = String(lecteur.result);
    };
    lecteur.readAsDataURL(fichier);
  });
}
