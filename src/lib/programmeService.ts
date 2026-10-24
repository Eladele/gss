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
    commentaire: r.commentaire ?? '',
    traiteParNom: r.traite_par_nom ?? null,
    traiteLe: r.traite_le ?? null,
    distribueParNom: r.distribue_par_nom ?? null,
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

export async function setStatut(id: string, statut: OtStatut, par: string, commentaire = ''): Promise<void> {
  const { error } = await supabase
    .from('programme_ot')
    .update({
      statut,
      commentaire: statut === 'a_faire' ? '' : commentaire,
      traite_par_nom: statut === 'a_faire' ? null : par,
      traite_le: statut === 'a_faire' ? null : new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw dbError(error, 'Mise à jour impossible');
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
