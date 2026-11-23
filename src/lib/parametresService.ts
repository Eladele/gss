// Paramètres modifiables par l'administrateur (table app_settings, supabase_parametres.sql) :
//   • barème des points des équipes (la base applique les mêmes valeurs aux pénalités) ;
//   • en-tête de l'ordre de virement des salaires ;
//   • réglages généraux (heure du programme du soir, jours fériés, superviseurs régionaux…).
// Barème et en-tête : écriture par la fonction modifier_parametre (réservée à l'admin, valeurs
// contrôlées, historique). Réglages généraux : écrits directement dans app_settings.
import { supabase } from '@/lib/supabase';
import { MOTIFS_FAIT_DEFAUT, MOTIFS_NON_FAIT_DEFAUT, type MotifDef } from '@/utils/programme';

export interface Bareme {
  faitDansDelai: number; // fiche faite avant son échéance
  faitHorsDelai: number; // fiche faite après son échéance
  nonFait: number; // fiche marquée « non fait »
  coefReseau: number; // fiche faite, motif panne réseau : coefficient du point (0,5 = moitié)
  sansIntervention: number; // faite dans le délai, motif confirmé par client / modem défectueux / électricité / erreur de signalisation
  bonusDecharge: number; // … + ce bonus si la décharge est faite
  bonusScan: number; // … + ce bonus si l'ONT est scanné
  faitSansPoint: number; // faite, motif installé par quelqu'un / confirmé par client / erreur de signalisation
  penaliteNonTraitee: number; // ni faite ni « non faite » au contrôle de 22 h
  penaliteRetardee: number; // fiche ouverte retardée
  penaliteReaffectee: number; // réaffectée avec la case « pénaliser » cochée
  penaliteFauxOk: number; // fiche marquée « Fait » à tort
}

export const BAREME_DEFAUT: Bareme = {
  faitDansDelai: 1,
  faitHorsDelai: 0,
  nonFait: 0,
  coefReseau: 0.5,
  sansIntervention: 0.5,
  bonusDecharge: 0.25,
  bonusScan: 0.25,
  faitSansPoint: 0,
  penaliteNonTraitee: -1,
  penaliteRetardee: -1,
  penaliteReaffectee: -1,
  penaliteFauxOk: -1,
};

/**
 * Barème des fiches OT faites, compté depuis « OT reçu le » en jours ouvrés (page Paramètres,
 * app_settings « bareme_ot »). Voir pointsFaite dans src/utils/points.ts.
 */
export interface BaremeOT {
  inst24h: number; // installation faite en 24 h (1 jour ouvré)
  inst48h: number; // installation faite en 48 h (2 jours ouvrés)
  inst48hPoteau: number; // installation avec poteau faite en 48 h (total)
  plantationPoteau: number; // ajouté pour un poteau planté (24 h, ou en retard)
  instRetard: number; // installation : 1er jour de retard
  retardParJour: number; // chaque jour de retard en plus (installation) / chaque jour de retard (dérangement)
  drg: number; // dérangement fait dans le délai
  cableDistribution: number; // câble distribution réparé (une fiche par panne)
  cableMpo: number; // câble MPO réparé (une fiche par panne)
}

export const BAREME_OT_DEFAUT: BaremeOT = {
  inst24h: 2,
  inst48h: 1,
  inst48hPoteau: 1.5,
  plantationPoteau: 1,
  instRetard: -1,
  retardParJour: -0.5,
  drg: 0.5,
  cableDistribution: 2,
  cableMpo: 5,
};

const CLES_BAREME_OT: Record<keyof BaremeOT, string> = {
  inst24h: 'inst_24h',
  inst48h: 'inst_48h',
  inst48hPoteau: 'inst_48h_poteau',
  plantationPoteau: 'plantation_poteau',
  instRetard: 'inst_retard',
  retardParJour: 'retard_par_jour',
  drg: 'drg',
  cableDistribution: 'cable_distribution',
  cableMpo: 'cable_mpo',
};

/** Nom de chaque valeur dans la base */
const CLES_BAREME: Record<keyof Bareme, string> = {
  faitDansDelai: 'fait_dans_delai',
  faitHorsDelai: 'fait_hors_delai',
  nonFait: 'non_fait',
  coefReseau: 'coef_reseau',
  sansIntervention: 'sans_intervention',
  bonusDecharge: 'bonus_decharge',
  bonusScan: 'bonus_scan',
  faitSansPoint: 'fait_sans_point',
  penaliteNonTraitee: 'penalite_non_traitee',
  penaliteRetardee: 'penalite_retardee',
  penaliteReaffectee: 'penalite_reaffectee',
  penaliteFauxOk: 'penalite_faux_ok',
};

export interface EnteteBanque {
  destinataire?: string;
  compte?: string;
}

export interface EnteteVirement {
  siege: string;
  rc: string;
  nif: string;
  ville: string; // « Nouakchott, le 08/11/2026 »
  destinataire: string; // par défaut, pour les banques sans destinataire propre
  compte: string; // « Par le débit de notre compte n° …, veuillez virer la somme : »
  motif: string; // suivi du mois : « Paiement employés pour le mois de novembre 2026 »
  faveur: string;
  signataire: string;
  banques: Record<string, EnteteBanque>; // BPM, BII, Caisse… : destinataire / compte propres
}

export const ENTETE_DEFAUT: EnteteVirement = {
  siege: 'Siège social : Nouakchott, K.Ext SOCOGIM  873 2E A1',
  rc: ' RC N° : analytique:75781 chrono: 1522',
  nif: 'NIF : 21104523 ',
  ville: 'Nouakchott',
  destinataire: 'Monsieur Le Directeur Général de Banque Populaire Mauritanie',
  compte: 'Par le débit de notre compte n° 1005194, veuillez virer la somme :',
  motif: 'Paiement employés pour le mois de',
  faveur: 'En faveur de nos employés conformément au tableau suivant :',
  signataire: 'MOHAMED YAHYA LIMAM',
  banques: {},
};

// ─── Réglages généraux (app_settings « parametres_generaux ») ─────────────────
export const VILLES = ['Nouakchott', 'Nouadhibou', 'Kaédi', 'Rosso'] as const;
export type VilleReglage = (typeof VILLES)[number];

export interface Reglages {
  /** à partir de cette heure, la distribution prépare le programme du lendemain */
  heureProgrammeSoir: number;
  /** fiches « non faites » proposées au renvoi : celles des N derniers jours */
  joursNonFaites: number;
  /** jours fériés (YYYY-MM-DD) : ni délai ni échéance ces jours-là (calculs de l'application) */
  joursFeries: string[];
  /** superviseur régional : id du profil → ville (il ne gère que les équipes et zones de cette ville) */
  villesSuperviseurs: Record<string, VilleReglage>;
}

export const REGLAGES_DEFAUT: Reglages = {
  heureProgrammeSoir: 16,
  joursNonFaites: 30,
  joursFeries: [],
  villesSuperviseurs: {},
};

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;
const borne = (v: unknown, min: number, max: number, defaut: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : defaut;

export function reglagesDepuisBase(v: unknown): Reglages {
  const o = objet(v);
  const villes: Record<string, VilleReglage> = {};
  for (const [id, ville] of Object.entries(objet(o.villes_superviseurs)))
    if ((VILLES as readonly string[]).includes(ville as string)) villes[id] = ville as VilleReglage;
  return {
    heureProgrammeSoir: borne(o.heure_programme_soir, 0, 23, REGLAGES_DEFAUT.heureProgrammeSoir),
    joursNonFaites: borne(o.jours_non_faites, 1, 365, REGLAGES_DEFAUT.joursNonFaites),
    joursFeries: Array.isArray(o.jours_feries)
      ? [...new Set((o.jours_feries as unknown[]).filter((j): j is string => typeof j === 'string' && JOUR_ISO.test(j)))].sort()
      : [],
    villesSuperviseurs: villes,
  };
}

export function reglagesVersBase(r: Reglages): Record<string, unknown> {
  const n = reglagesDepuisBase({
    heure_programme_soir: r.heureProgrammeSoir,
    jours_non_faites: r.joursNonFaites,
    jours_feries: r.joursFeries,
    villes_superviseurs: r.villesSuperviseurs,
  });
  return {
    heure_programme_soir: n.heureProgrammeSoir,
    jours_non_faites: n.joursNonFaites,
    jours_feries: n.joursFeries,
    villes_superviseurs: n.villesSuperviseurs,
  };
}

// ─── Motifs de clôture du programme (app_settings « motifs_programme ») ────────
export interface MotifsProgramme {
  nonFait: MotifDef[];
  fait: MotifDef[];
}
export const MOTIFS_DEFAUT: MotifsProgramme = { nonFait: MOTIFS_NON_FAIT_DEFAUT, fait: MOTIFS_FAIT_DEFAUT };

function listeMotifs(v: unknown, defaut: MotifDef[], champs: (keyof MotifDef)[]): MotifDef[] {
  if (!Array.isArray(v)) return defaut.map((m) => ({ ...m }));
  const vus = new Set<string>();
  const out: MotifDef[] = [];
  for (const x of v as unknown[]) {
    const o = objet(x);
    const label = typeof o.label === 'string' ? o.label.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!label || vus.has(label.toLowerCase())) continue;
    vus.add(label.toLowerCase());
    const m: MotifDef = { label };
    for (const c of champs) {
      if (c === 'poteaux') {
        const n = Math.round(Number(o.poteaux) || 0);
        if (n > 0) m.poteaux = Math.min(5, n);
      } else if (o[c] === true) (m as unknown as Record<string, boolean>)[c] = true;
    }
    out.push(m);
  }
  return out;
}

export function motifsDepuisBase(v: unknown): MotifsProgramme {
  const o = objet(v);
  return {
    nonFait: listeMotifs(o.non_fait, MOTIFS_NON_FAIT_DEFAUT, ['installation', 'poteaux']),
    fait: listeMotifs(o.fait, MOTIFS_FAIT_DEFAUT, ['reseau', 'leger', 'sansPoint']),
  };
}

/** Motifs : écrits dans app_settings « motifs_programme » (comme les réglages généraux) */
export async function enregistrerMotifs(m: MotifsProgramme): Promise<MotifsProgramme> {
  const propre = motifsDepuisBase({ non_fait: m.nonFait, fait: m.fait });
  if (!propre.nonFait.length || !propre.fait.length) throw new Error('Il faut au moins un motif « fait » et un motif « non fait »');
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'motifs_programme', value: JSON.stringify({ non_fait: propre.nonFait, fait: propre.fait }) }, { onConflict: 'key' });
  if (error) throw new Error(error.message || 'Enregistrement impossible');
  return propre;
}

export interface Parametres {
  bareme: Bareme;
  baremeOt: BaremeOT;
  entete: EnteteVirement;
  reglages: Reglages;
  motifs: MotifsProgramme;
}

export interface ModifParametre {
  id: string;
  cle: 'bareme_points' | 'entete_virement' | string;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown>;
  le: string;
  parNom: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const objet = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const lireJson = (txt: unknown): Record<string, any> => {
  if (!txt) return {};
  if (typeof txt === 'object') return objet(txt); // colonne jsonb
  if (typeof txt !== 'string') return {};
  try {
    return objet(JSON.parse(txt));
  } catch {
    return {};
  }
};

export function baremeDepuisBase(v: unknown): Bareme {
  const o = objet(v);
  const b = { ...BAREME_DEFAUT };
  for (const k of Object.keys(CLES_BAREME) as (keyof Bareme)[]) {
    const x = o[CLES_BAREME[k]];
    if (typeof x === 'number' && Number.isFinite(x)) b[k] = x;
  }
  return b;
}

export function baremeOtDepuisBase(v: unknown): BaremeOT {
  const o = objet(v);
  const b = { ...BAREME_OT_DEFAUT };
  for (const k of Object.keys(CLES_BAREME_OT) as (keyof BaremeOT)[]) {
    const x = o[CLES_BAREME_OT[k]];
    if (typeof x === 'number' && Number.isFinite(x)) b[k] = x;
  }
  return b;
}

export function baremeOtVersBase(b: BaremeOT): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(CLES_BAREME_OT) as (keyof BaremeOT)[]) o[CLES_BAREME_OT[k]] = Number(b[k]);
  return o;
}

export function baremeVersBase(b: Bareme): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(CLES_BAREME) as (keyof Bareme)[]) o[CLES_BAREME[k]] = Number(b[k]);
  return o;
}

export function enteteDepuisBase(v: unknown): EnteteVirement {
  const o = objet(v);
  const e: EnteteVirement = { ...ENTETE_DEFAUT, banques: {} };
  for (const k of ['siege', 'rc', 'nif', 'ville', 'destinataire', 'compte', 'motif', 'faveur', 'signataire'] as const) {
    if (typeof o[k] === 'string') e[k] = o[k];
  }
  for (const [nom, x] of Object.entries(objet(o.banques))) {
    const b = objet(x);
    e.banques[nom] = {
      ...(typeof b.destinataire === 'string' && b.destinataire ? { destinataire: b.destinataire } : {}),
      ...(typeof b.compte === 'string' && b.compte ? { compte: b.compte } : {}),
    };
  }
  return e;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Paramètres enregistrés (valeurs par défaut pour ce qui manque, ou si le module n'est pas installé) */
export async function fetchParametres(): Promise<Parametres> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', ['bareme_points', 'bareme_ot', 'entete_virement', 'parametres_generaux', 'motifs_programme']);
  if (error) {
    console.error('fetchParametres:', error);
    return { bareme: { ...BAREME_DEFAUT }, baremeOt: { ...BAREME_OT_DEFAUT }, entete: { ...ENTETE_DEFAUT, banques: {} }, reglages: reglagesDepuisBase({}), motifs: motifsDepuisBase({}) };
  }
  const val = (k: string) => lireJson((data ?? []).find((r) => r.key === k)?.value);
  return {
    bareme: baremeDepuisBase(val('bareme_points')),
    baremeOt: baremeOtDepuisBase(val('bareme_ot')),
    entete: enteteDepuisBase(val('entete_virement')),
    reglages: reglagesDepuisBase(val('parametres_generaux')),
    motifs: motifsDepuisBase(val('motifs_programme')),
  };
}

function erreurParametre(error: { code?: string; message?: string }): Error {
  if (error.code === 'PGRST202' || error.code === '42883')
    return new Error('Les paramètres ne sont pas encore installés (exécuter supabase_parametres.sql).');
  return new Error(error.message || 'Enregistrement impossible');
}

export async function enregistrerBareme(parId: string, b: Bareme): Promise<Bareme> {
  const { data, error } = await supabase.rpc('modifier_parametre', { p_par: parId, p_cle: 'bareme_points', p_valeur: baremeVersBase(b) });
  if (error) throw erreurParametre(error);
  return baremeDepuisBase(data);
}

export async function enregistrerEntete(parId: string, e: EnteteVirement): Promise<EnteteVirement> {
  const { data, error } = await supabase.rpc('modifier_parametre', { p_par: parId, p_cle: 'entete_virement', p_valeur: e });
  if (error) throw erreurParametre(error);
  return enteteDepuisBase(data);
}

/** Barème des fiches OT : écrit dans app_settings « bareme_ot » (comme les réglages généraux) */
export async function enregistrerBaremeOt(b: BaremeOT): Promise<BaremeOT> {
  const valeur = baremeOtVersBase(b);
  const { error } = await supabase.from('app_settings').upsert({ key: 'bareme_ot', value: JSON.stringify(valeur) }, { onConflict: 'key' });
  if (error) throw new Error(error.message || 'Enregistrement impossible');
  return baremeOtDepuisBase(valeur);
}

/** Réglages généraux : écrits dans app_settings (comme la signature du directeur) */
export async function enregistrerReglages(r: Reglages): Promise<Reglages> {
  const valeur = reglagesVersBase(r);
  const { error } = await supabase.from('app_settings').upsert({ key: 'parametres_generaux', value: JSON.stringify(valeur) }, { onConflict: 'key' });
  if (error) throw new Error(error.message || 'Enregistrement impossible');
  return reglagesDepuisBase(valeur);
}

export async function fetchHistoriqueParametres(limit = 20): Promise<ModifParametre[]> {
  const { data, error } = await supabase.from('parametres_historique_detail').select('*').order('le', { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    cle: r.cle,
    avant: r.avant ?? null,
    apres: r.apres ?? {},
    le: r.le,
    parNom: r.par_nom ?? null,
  }));
}
