import { supabase } from './supabase';
import type { OtStatut, ProgrammeOT } from '@/types';
import type { ParsedOT } from '@/utils/otPdf';

// Les fiches OT du programme sont des lignes de la table `situations` dont `numero_ot`
// est renseigné (voir supabase_fusion_programme_situations.sql pour la correspondance
// des colonnes). Ce service garde l'interface « fiche OT » utilisée par les pages.
const TABLE = 'situations';
const OUVERT = ['pending', 'in_progress', 'urgent'];

const versStatus: Record<OtStatut, string> = { a_faire: 'pending', fait: 'ok', non_fait: 'non_ok' };
const versStatut = (status: string): OtStatut => (status === 'ok' ? 'fait' : status === 'non_ok' ? 'non_fait' : 'a_faire');

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOt(r: any): ProgrammeOT {
  const statut = versStatut(r.status);
  return {
    id: r.id,
    numeroOt: r.numero_ot,
    nature: r.nature === 'derangement' ? 'derangement' : 'installation',
    sousType: r.sous_type ?? '',
    typeOt: r.type ?? '',
    typeLigne: r.type_ligne === 'TPH' ? 'TPH' : 'FGP',
    dateRecu: r.date_recu ?? r.date_message ?? r.date_depo ?? null,
    dateProgramme: r.date_programme ?? r.date_recu ?? r.date_depo ?? (r.created_at ?? '').slice(0, 10),
    fgp: r.fgp ?? '',
    clientCode: r.client_code ?? '',
    clientNom: r.client_nom ?? '',
    clientInfo: r.client_info ?? '',
    telephones: r.telephones ?? [],
    adresse: r.adresse ?? '',
    zone: r.zone ?? '',
    pco: r.pco ?? '',
    port: r.port ?? '',
    dis: r.dis ?? '',
    ancienDis: r.ancien_dis ?? '',
    ontSerials: r.ont_serials ?? [],
    defaut: r.defaut ?? '',
    abonnement: r.abonnement ?? '',
    cableFibreM: r.cable_fibre_m ?? null,
    miseEnService: r.mise_en_service ?? '',
    equipe: r.equipe ?? '',
    statut,
    motif: r.motif_cloture ?? '',
    commentaire: r.comment ?? '',
    decharge: r.decharge ?? null,
    scanne: r.scan_statut === 'SCANNE' ? true : r.scan_statut === 'NON SCANE' ? false : null,
    cstChange: !!r.cst_change,
    nouveauDis: r.nouveau_dis ?? '',
    nouvelOnt: r.nouvel_ont ?? '',
    poteaux: Number(r.poteau) || 0,
    // clôturée depuis la page Situations (markOK) : pas de traite_le → date de mise à jour
    traiteParNom: r.traite_par_nom ?? r.closed_by ?? null,
    traiteLe: r.traite_le ?? (statut !== 'a_faire' ? (r.updated_at ?? null) : null),
    distribueParNom: r.distribue_par_nom ?? null,
    assigneLe: r.assigne_le ?? r.created_at ?? null,
    sourceFichier: r.source_fichier ?? '',
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function dbError(error: { code?: string; message?: string } | null, fallback: string): Error {
  if (error?.code === '42703' || error?.code === '42P01')
    return new Error('Les colonnes du programme ne sont pas encore dans « situations » (exécuter supabase_fusion_programme_situations.sql).');
  return new Error(error?.message || fallback);
}

/** Fiches d'une période (admin) ou d'une équipe (chef). Pour une équipe :
 *  toutes les fiches encore « à faire » + celles de la période. */
export async function fetchProgramme(opts: { from: string; to: string; equipe?: string }): Promise<ProgrammeOT[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .not('numero_ot', 'is', null)
    .order('date_programme', { ascending: false })
    .order('nature')
    .order('zone')
    .limit(2000);
  if (opts.equipe) {
    q = q.ilike('equipe', opts.equipe).or(`status.in.(${OUVERT.join(',')}),and(date_programme.gte.${opts.from},date_programme.lte.${opts.to})`);
  } else {
    q = q.gte('date_programme', opts.from).lte('date_programme', opts.to);
  }
  const { data, error } = await q;
  if (error) throw dbError(error, 'Chargement du programme impossible');
  return (data ?? []).map(mapOt);
}

/** Fiches reçues sur une période (date « OT reçu le », à défaut date du programme) — pour les points */
export async function fetchPourPoints(from: string, to: string): Promise<ProgrammeOT[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .not('numero_ot', 'is', null)
    .or(`and(date_recu.gte.${from},date_recu.lte.${to}),and(date_recu.is.null,date_programme.gte.${from},date_programme.lte.${to})`)
    .limit(5000);
  if (error) throw dbError(error, 'Chargement des points impossible');
  return (data ?? []).map(mapOt);
}

/** N° OT déjà distribués parmi ceux du PDF (pour ne pas les renvoyer) */
export async function existingNumeros(numeros: string[]): Promise<Map<string, { equipe: string; date: string }>> {
  const out = new Map<string, { equipe: string; date: string }>();
  for (let i = 0; i < numeros.length; i += 200) {
    const { data, error } = await supabase.from(TABLE).select('numero_ot, equipe, date_programme').in('numero_ot', numeros.slice(i, i + 200));
    if (error) throw dbError(error, 'Vérification des doublons impossible');
    (data ?? []).forEach((r) => out.set(r.numero_ot as string, { equipe: (r.equipe as string) ?? '', date: (r.date_programme as string) ?? '' }));
  }
  return out;
}

interface SituationOuverte {
  id: string;
  fgp: string;
  type: string;
  zone: string;
  equipe: string;
  nature: string;
}

/** Situations ouvertes (importées par Excel, sans OT) de ces FGP, par « fgp|nature ».
 *  Un OT ne complète une situation que s'il en existe UNE seule ouverte pour ce FGP. */
export async function situationsOuvertes(fgps: string[]): Promise<Map<string, SituationOuverte>> {
  const groupes = new Map<string, SituationOuverte[]>();
  const liste = [...new Set(fgps.filter(Boolean))];
  for (let i = 0; i < liste.length; i += 200) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, fgp, type, zone, equipe, nature')
      .in('fgp', liste.slice(i, i + 200))
      .is('numero_ot', null)
      .in('status', OUVERT);
    if (error) throw dbError(error, 'Recherche des situations impossible');
    (data ?? []).forEach((r) => {
      const k = `${r.fgp}|${r.nature}`;
      groupes.set(k, [...(groupes.get(k) ?? []), r as SituationOuverte]);
    });
  }
  const out = new Map<string, SituationOuverte>();
  groupes.forEach((v, k) => v.length === 1 && out.set(k, v[0]));
  return out;
}

/** Colonnes OT communes (nouvelle situation ou situation complétée) */
function colonnesOt(o: ParsedOT & { equipe: string; sourceFichier: string }, dateProgramme: string, par: string) {
  return {
    equipe: o.equipe,
    numero_ot: o.numeroOt,
    sous_type: o.sousType,
    type_ligne: o.typeLigne,
    date_recu: o.dateRecu,
    date_programme: dateProgramme,
    client_code: o.clientCode,
    client_nom: o.clientNom,
    client_info: o.clientInfo,
    telephones: o.telephones,
    adresse: o.adresse,
    pco: o.pco,
    port: o.port,
    dis: o.dis,
    ancien_dis: o.ancienDis,
    ont_serials: o.ontSerials,
    defaut: o.defaut,
    abonnement: o.abonnement,
    cable_fibre_m: o.cableFibreM,
    mise_en_service: o.miseEnService,
    distribue_par_nom: par,
    source_fichier: o.sourceFichier,
  };
}

/** Distribue les fiches : un OT complète la situation ouverte existante de son FGP,
 *  sinon une nouvelle situation est créée. Deux requêtes au plus : la base envoie une
 *  seule notification par équipe. Renvoie { crees, completees }. */
export async function distribuer(
  ots: (ParsedOT & { equipe: string; sourceFichier: string })[],
  dateProgramme: string,
  par: string,
): Promise<{ crees: number; completees: number }> {
  const existantes = await situationsOuvertes(ots.map((o) => o.fgp));
  const aCompleter: Record<string, unknown>[] = [];
  const aCreer: Record<string, unknown>[] = [];
  for (const o of ots) {
    const ex = existantes.get(`${o.fgp}|${o.nature}`);
    const type = o.typeOt || (o.nature === 'derangement' ? 'DRG' : 'CPL');
    if (ex) {
      aCompleter.push({ id: ex.id, fgp: ex.fgp, type: ex.type || type, zone: ex.zone || o.zone, ...colonnesOt(o, dateProgramme, par), cree_par_ot: false });
    } else {
      const debut = o.dateRecu ?? dateProgramme;
      aCreer.push({
        fgp: o.fgp,
        type,
        zone: o.zone || '',
        motif: o.defaut || o.sousType || '',
        date_depo: debut,
        date_message: debut,
        delai: 0,
        status: 'pending',
        comment: '',
        nature: o.nature,
        is_urgent: false,
        poteau: 0,
        ...colonnesOt(o, dateProgramme, par),
        cree_par_ot: true,
      });
    }
  }
  let completees = 0;
  let crees = 0;
  if (aCompleter.length) {
    const { data, error } = await supabase.from(TABLE).upsert(aCompleter, { onConflict: 'id' }).select('id');
    if (error) throw dbError(error, 'Distribution impossible');
    completees = data?.length ?? 0;
  }
  if (aCreer.length) {
    const { data, error } = await supabase.from(TABLE).upsert(aCreer, { onConflict: 'numero_ot', ignoreDuplicates: true }).select('id');
    if (error) throw dbError(error, 'Distribution impossible');
    crees = data?.length ?? 0;
  }
  return { crees, completees };
}

export interface Cloture {
  statut: OtStatut;
  motif?: string;
  commentaire?: string;
  decharge?: boolean | null;
  scanne?: boolean | null;
  cstChange?: boolean;
  nouveauDis?: string;
  nouvelOnt?: string;
  poteaux?: number;
}

/** Clôture d'une fiche par le chef (fait / non fait), ou remise « à faire » (tout est effacé).
 *  « Fait » renseigne aussi la date de mise en service et closed_by, comme un OK de la page Situations. */
export async function cloturer(id: string, c: Cloture, par: string): Promise<void> {
  const reset = c.statut === 'a_faire';
  const fait = c.statut === 'fait';
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: versStatus[c.statut],
      motif_cloture: reset ? '' : (c.motif ?? ''),
      comment: reset ? '' : (c.commentaire ?? ''),
      decharge: fait ? (c.decharge ?? null) : null,
      scan_statut: fait && c.scanne != null ? (c.scanne ? 'SCANNE' : 'NON SCANE') : null,
      cst_change: fait && !!c.cstChange,
      nouveau_dis: fait && c.cstChange ? (c.nouveauDis ?? '') : '',
      nouvel_ont: fait && c.cstChange ? (c.nouvelOnt ?? '') : '',
      poteau: reset ? 0 : Math.max(0, Math.round(c.poteaux ?? 0)),
      traite_par_nom: reset ? null : par,
      traite_le: reset ? null : now,
      closed_by: fait ? par : null,
      date_mise_en_service: fait ? now.slice(0, 10) : null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw dbError(error, 'Mise à jour impossible');
}

export async function reassign(ids: string[], equipe: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ equipe }).in('id', ids);
  if (error) throw dbError(error, 'Réaffectation impossible');
}

/** Retire des fiches du programme : une situation créée par l'OT est supprimée ; une
 *  situation Excel complétée par l'OT est seulement détachée du programme (elle reste). */
export async function deleteOts(ids: string[]): Promise<void> {
  const del = await supabase.from(TABLE).delete().in('id', ids).eq('cree_par_ot', true);
  if (del.error) throw dbError(del.error, 'Suppression impossible');
  const det = await supabase
    .from(TABLE)
    .update({ numero_ot: null, date_programme: null, distribue_par_nom: null, assigne_le: null })
    .in('id', ids)
    .eq('cree_par_ot', false);
  if (det.error) throw dbError(det.error, 'Suppression impossible');
}

/** Rafraîchit la page dès qu'une situation change (distribution, statut, réaffectation) */
export function subscribeProgramme(key: string, onChange: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  const channel = supabase
    .channel(`programme-${key}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      // un import Excel modifie des centaines de lignes : un seul rechargement
      if (t) clearTimeout(t);
      t = setTimeout(onChange, 500);
    })
    .subscribe();
  return () => {
    if (t) clearTimeout(t);
    supabase.removeChannel(channel);
  };
}

// ─── Liaison avec les scans réseau (vue situation_scan) ──────────────────────
export type ScanEtat = 'SCANNE' | 'NON SCANE' | 'ABSENT';
export interface ScanOT {
  avant: ScanEtat | null; // dans le dernier import AVANT la réception de l'OT
  avantLe: string | null;
  dernier: ScanEtat | null; // dans le dernier import
  dernierLe: string | null;
}

/** État de scan des ONT de ces fiches (vide si la vue n'est pas encore installée) */
export async function fetchScanOts(ids: string[]): Promise<Map<string, ScanOT>> {
  const out = new Map<string, ScanOT>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('situation_scan')
      .select('id, scan_avant_result, scan_avant_import, scan_dernier_result, scan_dernier_import')
      .in('id', ids.slice(i, i + 150));
    if (error) return out;
    (data ?? []).forEach((r) =>
      out.set(r.id as string, {
        avant: (r.scan_avant_result as ScanEtat) ?? null,
        avantLe: (r.scan_avant_import as string) ?? null,
        dernier: (r.scan_dernier_result as ScanEtat) ?? null,
        dernierLe: (r.scan_dernier_import as string) ?? null,
      }),
    );
  }
  return out;
}

/** Dernier import du fichier de scan */
export async function fetchDernierImportScan(): Promise<{ id: string; importedAt: string } | null> {
  const { data, error } = await supabase.from('scan_import_history').select('id, imported_at').order('imported_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, importedAt: data.imported_at as string };
}

/** Fiches faites (ou dérangements reçus) entre deux instants, toutes équipes — pour le rapport de scan */
export async function fetchFaitesEntre(fromIso: string, toIso: string): Promise<ProgrammeOT[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .not('numero_ot', 'is', null)
    .or(
      `and(status.eq.ok,traite_le.gte.${fromIso},traite_le.lte.${toIso}),and(nature.eq.derangement,date_recu.gte.${fromIso.slice(0, 10)},date_recu.lte.${toIso.slice(0, 10)})`,
    )
    .limit(5000);
  if (error) throw dbError(error, 'Chargement du rapport impossible');
  return (data ?? []).map(mapOt);
}
