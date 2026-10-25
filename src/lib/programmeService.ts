import { supabase } from './supabase';
import type { OtStatut, ProgrammeOT } from '@/types';
import type { ParsedOT } from '@/utils/otPdf';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOt(r: any): ProgrammeOT {
  return {
    id: r.id,
    numeroOt: r.numero_ot,
    nature: r.nature,
    sousType: r.sous_type ?? '',
    typeOt: r.type_ot ?? '',
    typeLigne: r.type_ligne === 'TPH' ? 'TPH' : 'FGP',
    dateRecu: r.date_recu ?? null,
    dateProgramme: r.date_programme,
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
    statut: r.statut,
    motif: r.motif ?? '',
    commentaire: r.commentaire ?? '',
    decharge: r.decharge ?? null,
    scanne: r.scanne ?? null,
    cstChange: !!r.cst_change,
    nouveauDis: r.nouveau_dis ?? '',
    nouvelOnt: r.nouvel_ont ?? '',
    poteaux: r.poteaux ?? 0,
    traiteParNom: r.traite_par_nom ?? null,
    traiteLe: r.traite_le ?? null,
    distribueParNom: r.distribue_par_nom ?? null,
    assigneLe: r.assigne_le ?? r.created_at ?? null,
    sourceFichier: r.source_fichier ?? '',
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function dbError(error: { code?: string; message?: string } | null, fallback: string): Error {
  if (error?.code === '42P01') return new Error('Le programme par fiches OT n’est pas encore installé (exécuter supabase_programme_ot_schema.sql).');
  return new Error(error?.message || fallback);
}

/** Fiches d'une période (admin) ou d'une équipe (chef). Pour une équipe :
 *  toutes les fiches encore « à faire » + celles de la période. */
export async function fetchProgramme(opts: { from: string; to: string; equipe?: string }): Promise<ProgrammeOT[]> {
  let q = supabase.from('programme_ot').select('*').order('date_programme', { ascending: false }).order('nature').order('zone').limit(2000);
  if (opts.equipe) {
    q = q.ilike('equipe', opts.equipe).or(`statut.eq.a_faire,and(date_programme.gte.${opts.from},date_programme.lte.${opts.to})`);
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
    .from('programme_ot')
    .select('*')
    .or(`and(date_recu.gte.${from},date_recu.lte.${to}),and(date_recu.is.null,date_programme.gte.${from},date_programme.lte.${to})`)
    .limit(5000);
  if (error) throw dbError(error, 'Chargement des points impossible');
  return (data ?? []).map(mapOt);
}

/** N° OT déjà distribués parmi ceux du PDF (pour ne pas les renvoyer) */
export async function existingNumeros(numeros: string[]): Promise<Map<string, { equipe: string; date: string }>> {
  const out = new Map<string, { equipe: string; date: string }>();
  for (let i = 0; i < numeros.length; i += 200) {
    const { data, error } = await supabase.from('programme_ot').select('numero_ot, equipe, date_programme').in('numero_ot', numeros.slice(i, i + 200));
    if (error) throw dbError(error, 'Vérification des doublons impossible');
    (data ?? []).forEach((r) => out.set(r.numero_ot as string, { equipe: r.equipe as string, date: r.date_programme as string }));
  }
  return out;
}

/** Distribue les fiches en UNE requête : la base envoie une seule notification par équipe. */
export async function distribuer(
  ots: (ParsedOT & { equipe: string; sourceFichier: string })[],
  dateProgramme: string,
  par: string,
): Promise<number> {
  const rows = ots.map((o) => ({
    numero_ot: o.numeroOt,
    nature: o.nature,
    sous_type: o.sousType,
    type_ot: o.typeOt,
    type_ligne: o.typeLigne,
    date_recu: o.dateRecu,
    date_programme: dateProgramme,
    fgp: o.fgp,
    client_code: o.clientCode,
    client_nom: o.clientNom,
    client_info: o.clientInfo,
    telephones: o.telephones,
    adresse: o.adresse,
    zone: o.zone,
    pco: o.pco,
    port: o.port,
    dis: o.dis,
    ancien_dis: o.ancienDis,
    ont_serials: o.ontSerials,
    defaut: o.defaut,
    abonnement: o.abonnement,
    cable_fibre_m: o.cableFibreM,
    mise_en_service: o.miseEnService,
    equipe: o.equipe,
    distribue_par_nom: par,
    source_fichier: o.sourceFichier,
  }));
  const { data, error } = await supabase
    .from('programme_ot')
    .upsert(rows, { onConflict: 'numero_ot', ignoreDuplicates: true })
    .select('id');
  if (error) throw dbError(error, 'Distribution impossible');
  return data?.length ?? 0;
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

/** Clôture d'une fiche par le chef (fait / non fait), ou remise « à faire » (tout est effacé). */
export async function cloturer(id: string, c: Cloture, par: string): Promise<void> {
  const reset = c.statut === 'a_faire';
  const { error } = await supabase
    .from('programme_ot')
    .update({
      statut: c.statut,
      motif: reset ? '' : (c.motif ?? ''),
      commentaire: reset ? '' : (c.commentaire ?? ''),
      decharge: reset || c.statut !== 'fait' ? null : (c.decharge ?? null),
      scanne: reset || c.statut !== 'fait' ? null : (c.scanne ?? null),
      cst_change: !reset && c.statut === 'fait' && !!c.cstChange,
      nouveau_dis: !reset && c.cstChange ? (c.nouveauDis ?? '') : '',
      nouvel_ont: !reset && c.cstChange ? (c.nouvelOnt ?? '') : '',
      poteaux: reset ? 0 : Math.max(0, Math.round(c.poteaux ?? 0)),
      traite_par_nom: reset ? null : par,
      traite_le: reset ? null : new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw dbError(error, 'Mise à jour impossible');
}

/** Fiches qui comptent des poteaux (pour les statistiques) */
export async function fetchPoteauxProgramme(): Promise<{ fgp: string; equipe: string; nature: string; poteaux: number; date: string }[]> {
  const { data, error } = await supabase
    .from('programme_ot')
    .select('fgp, equipe, nature, poteaux, date_programme, traite_le')
    .gt('poteaux', 0)
    .limit(5000);
  if (error) return []; // colonne pas encore créée : les statistiques restent celles des situations
  return (data ?? []).map((r) => ({
    fgp: (r.fgp as string) ?? '',
    equipe: (r.equipe as string) ?? '',
    nature: r.nature as string,
    poteaux: Number(r.poteaux) || 0,
    date: ((r.traite_le as string) ?? (r.date_programme as string) ?? '').slice(0, 10),
  }));
}

export async function reassign(ids: string[], equipe: string): Promise<void> {
  const { error } = await supabase.from('programme_ot').update({ equipe }).in('id', ids);
  if (error) throw dbError(error, 'Réaffectation impossible');
}

export async function deleteOts(ids: string[]): Promise<void> {
  const { error } = await supabase.from('programme_ot').delete().in('id', ids);
  if (error) throw dbError(error, 'Suppression impossible');
}

/** Rafraîchit la page dès qu'une fiche change (distribution, statut, réaffectation) */
export function subscribeProgramme(key: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`programme-${key}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'programme_ot' }, () => onChange())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Liaison avec les scans réseau (vue programme_ot_scan) ───────────────────
export type ScanEtat = 'SCANNE' | 'NON SCANE' | 'ABSENT';
export interface ScanOT {
  avant: ScanEtat | null; // dans le dernier import AVANT la réception de l'OT
  avantLe: string | null;
  dernier: ScanEtat | null; // dans le dernier import
  dernierLe: string | null;
}

/** État de scan des ONT de ces fiches (vide si la liaison n'est pas encore installée) */
export async function fetchScanOts(ids: string[]): Promise<Map<string, ScanOT>> {
  const out = new Map<string, ScanOT>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('programme_ot_scan')
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

/** Fiches faites (ou reçues) entre deux instants, toutes équipes — pour le rapport de scan */
export async function fetchFaitesEntre(fromIso: string, toIso: string): Promise<ProgrammeOT[]> {
  const { data, error } = await supabase
    .from('programme_ot')
    .select('*')
    .or(`and(statut.eq.fait,traite_le.gte.${fromIso},traite_le.lte.${toIso}),and(nature.eq.derangement,date_recu.gte.${fromIso.slice(0, 10)},date_recu.lte.${toIso.slice(0, 10)})`)
    .limit(5000);
  if (error) throw dbError(error, 'Chargement du rapport impossible');
  return (data ?? []).map(mapOt);
}
