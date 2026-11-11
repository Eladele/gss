// Paramètres modifiables par l'administrateur (table app_settings, supabase_parametres.sql) :
//   • barème des points des équipes (la base applique les mêmes valeurs aux pénalités) ;
//   • en-tête de l'ordre de virement des salaires.
// Écriture par la fonction modifier_parametre (réservée à l'admin, valeurs contrôlées, historique).
import { supabase } from '@/lib/supabase';

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

export interface Parametres {
  bareme: Bareme;
  entete: EnteteVirement;
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
const lireJson = (txt: string | null | undefined): Record<string, any> => {
  if (!txt) return {};
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
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', ['bareme_points', 'entete_virement']);
  if (error) {
    console.error('fetchParametres:', error);
    return { bareme: { ...BAREME_DEFAUT }, entete: { ...ENTETE_DEFAUT, banques: {} } };
  }
  const val = (k: string) => lireJson((data ?? []).find((r) => r.key === k)?.value);
  return { bareme: baremeDepuisBase(val('bareme_points')), entete: enteteDepuisBase(val('entete_virement')) };
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
