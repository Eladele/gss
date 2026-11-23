import { supabase } from './supabase';
import type { ClotureAVerifier, OtStatut, Penalite, ProgrammeOT } from '@/types';
import type { ParsedOT } from '@/utils/otPdf';
import { disDuMotifCst, poteauxBesoin, zoneDuDis, type MotifFauxOk } from '@/utils/programme';
import { normOnt, teamIdFor, teamIdsFor, upsertLignes, upsertOnts } from './refs';

// Les fiches OT du programme sont des situations dont `numero_ot` est renseigné.
// Une information n'est stockée qu'une fois (voir supabase_normalisation.sql) :
//   - client, téléphones, adresse, DIS → table lignes (une par FGP / TPH)
//   - numéro de série ONT → table onts (situations.ont_id / nouvel_ont_id)
//   - équipe → team_id, personnes → profiles
// Lecture par la vue situations_detail, écriture dans la table situations.
const TABLE = 'situations';
const VUE = 'situations_detail';
const OUVERT = ['pending', 'in_progress', 'urgent'];

type Par = { id: string; name: string };

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
    ontSerials: r.ont_sn ? [r.ont_sn] : [],
    defaut: r.defaut ?? '',
    abonnement: r.abonnement ?? '',
    cableFibreM: r.cable_fibre_m ?? null,
    miseEnService: r.mise_en_service ?? '',
    equipe: r.equipe ?? '',
    statut,
    motif: r.motif_cloture ?? '',
    commentaire: r.comment ?? '',
    decharge: r.decharge ?? null,
    scanne: r.scan_declare ?? null,
    cstChange: !!(r.nouveau_dis || r.nouvel_ont_sn),
    nouveauDis: r.nouveau_dis ?? '',
    nouvelOnt: r.nouvel_ont_sn ?? '',
    poteaux: Number(r.poteau) || 0,
    // clôturée depuis la page Situations (markOK) : pas de traite_le → date de mise à jour
    traiteParNom: r.traite_par_nom ?? null,
    traiteLe: r.traite_le ?? (statut !== 'a_faire' ? (r.updated_at ?? null) : null),
    distribueParNom: r.distribue_par_nom ?? null,
    assigneLe: r.assigne_le ?? r.created_at ?? null,
    sourceFichier: r.source_fichier ?? '',
    nbPenalites: Number(r.nb_penalites) || 0,
    echeanceEquipe: r.echeance_equipe ?? null,
    prioritaire: !!r.prioritaire,
    isUrgent: !!(r.is_urgent || r.status === 'urgent'),
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function dbError(error: { code?: string; message?: string } | null, fallback: string): Error {
  if (error?.code === '42703' || error?.code === '42P01')
    return new Error('La base n’est pas à jour (exécuter supabase_normalisation.sql).');
  if (error?.code === 'PGRST202' || error?.code === '42883')
    return new Error('Le contrôle du programme n’est pas encore installé (exécuter supabase_programme_controle.sql).');
  return new Error(error?.message || fallback);
}

/** Fiches d'une période (admin) ou d'une équipe (chef). Pour une équipe :
 *  toutes les fiches encore « à faire » + celles de la période. */
export async function fetchProgramme(opts: { from: string; to: string; equipe?: string }): Promise<ProgrammeOT[]> {
  let q = supabase
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .order('date_programme', { ascending: false })
    .order('nature')
    .order('zone')
    .limit(2000);
  if (opts.equipe) {
    const teamId = await teamIdFor(opts.equipe);
    if (!teamId) return [];
    q = q.eq('team_id', teamId).or(`status.in.(${OUVERT.join(',')}),and(date_programme.gte.${opts.from},date_programme.lte.${opts.to})`);
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
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .or(`and(date_recu.gte.${from},date_recu.lte.${to}),and(date_recu.is.null,date_programme.gte.${from},date_programme.lte.${to})`)
    .limit(5000);
  if (error) throw dbError(error, 'Chargement des points impossible');
  return (data ?? []).map(mapOt);
}

/**
 * Surveillance des équipes : fiches clôturées (faites / non faites) entre from et to (jours, bornes
 * comprises, heure de Nouakchott = UTC) + toutes les fiches encore ouvertes (programme en cours).
 */
export async function fetchSurveillance(from: string, to: string): Promise<ProgrammeOT[]> {
  const fin = new Date(`${to}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  const finIso = fin.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .not('team_id', 'is', null)
    .or(`status.in.(${OUVERT.join(',')}),and(traite_le.gte.${from}T00:00:00Z,traite_le.lt.${finIso}T00:00:00Z)`)
    .limit(10000);
  if (error) throw dbError(error, 'Chargement de la surveillance impossible');
  return (data ?? []).map(mapOt);
}

/** N° OT déjà distribués parmi ceux du PDF (pour ne pas les renvoyer) */
export interface OtExistant {
  id: string;
  equipe: string;
  date: string;
  /** « non_ok » : fiche déjà « non faite », qu'on peut renvoyer en gardant son motif */
  status: string;
  motif: string;
  traiteLe: string | null;
}
export async function existingNumeros(numeros: string[]): Promise<Map<string, OtExistant>> {
  const out = new Map<string, OtExistant>();
  for (let i = 0; i < numeros.length; i += 200) {
    const { data, error } = await supabase
      .from(VUE)
      .select('id, numero_ot, equipe, date_programme, status, motif_cloture, traite_le')
      .in('numero_ot', numeros.slice(i, i + 200));
    if (error) throw dbError(error, 'Vérification des doublons impossible');
    (data ?? []).forEach((r) =>
      out.set(r.numero_ot as string, {
        id: r.id as string,
        equipe: (r.equipe as string) ?? '',
        date: (r.date_programme as string) ?? '',
        status: (r.status as string) ?? '',
        motif: (r.motif_cloture as string) ?? '',
        traiteLe: (r.traite_le as string) ?? null,
      }),
    );
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
      .from(VUE)
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

/** Distribue les fiches : un OT complète la situation ouverte existante de son FGP,
 *  sinon une nouvelle situation est créée. La ligne (client, DIS) et l'ONT sont
 *  enregistrés une seule fois et reliés à la situation. Deux requêtes au plus sur les
 *  situations : la base envoie une seule notification par équipe. */
/** Infos de la ligne lues sur l'OT (DIS, zone, client, contacts…) */
const infosLigne = (o: ParsedOT) => ({
  fgp: o.fgp,
  zone: o.zone,
  typeLigne: o.typeLigne,
  dis: o.dis,
  clientCode: o.clientCode,
  clientNom: o.clientNom,
  clientInfo: o.clientInfo,
  telephones: o.telephones,
  adresse: o.adresse,
  abonnement: o.abonnement,
  miseEnService: o.miseEnService,
});

/**
 * OT réimporté pour une fiche déjà « non faite » (renvoi) : la ligne prend ce qui est écrit sur le
 * nouvel OT — nouveau DIS (ex. après une CST), zone, client, contacts — et le nouvel ONT. Avant, le
 * renvoi ne touchait pas la ligne : le DIS restait l'ancien.
 */
export async function majLignesDepuisOt(ots: ParsedOT[]): Promise<void> {
  if (!ots.length) return;
  // DIS d'avant, pour le garder comme « ancien DIS » sur les fiches de la ligne s'il change
  const avant = await disDesLignes(ots.map((o) => o.fgp));
  const lignes = await upsertLignes(ots.map(infosLigne));
  await upsertOnts(ots.filter((o) => o.ontSerials[0]).map((o) => ({ sn: o.ontSerials[0], ligneId: lignes.get(o.fgp.trim()) })));
  await noterAncienDis(
    ots.flatMap((o) => {
      const a = avant.get(o.fgp.trim());
      const n = normDis(o.dis);
      return a && a.dis && n && n !== a.dis ? [{ ligneId: a.id, ancien: a.dis }] : [];
    }),
  );
}

const normDis = (d?: string | null) => (d ?? '').replace(/\s+/g, '').toUpperCase();

/** DIS actuel des lignes : fgp → { id, dis } */
async function disDesLignes(fgps: string[]): Promise<Map<string, { id: string; dis: string }>> {
  const out = new Map<string, { id: string; dis: string }>();
  const liste = [...new Set(fgps.map((f) => f.trim()).filter(Boolean))];
  for (let i = 0; i < liste.length; i += 200) {
    const { data } = await supabase.from('lignes').select('id, fgp, dis').in('fgp', liste.slice(i, i + 200));
    (data ?? []).forEach((r) => out.set(r.fgp as string, { id: r.id as string, dis: normDis(r.dis as string) }));
  }
  return out;
}

/**
 * DIS d'une ligne changé (CST, OT réimporté, superviseur) : l'ancien DIS est gardé sur ses fiches
 * en cours et « non faites », pour que le chef et la distribution le voient encore.
 */
async function noterAncienDis(changes: { ligneId: string; ancien: string }[]) {
  for (const c of changes) {
    const { error } = await supabase
      .from(TABLE)
      .update({ ancien_dis: c.ancien })
      .eq('ligne_id', c.ligneId)
      .in('status', [...OUVERT, versStatus.non_fait]);
    if (error) console.warn('Ancien DIS non enregistré', error.message);
  }
}

export async function distribuer(
  ots: (ParsedOT & { equipe: string; sourceFichier: string })[],
  dateProgramme: string,
  par: Par,
): Promise<{ crees: number; completees: number }> {
  const [existantes, lignes, equipes] = await Promise.all([
    situationsOuvertes(ots.map((o) => o.fgp)),
    upsertLignes(ots.map(infosLigne)),
    teamIdsFor(ots.map((o) => o.equipe)),
  ]);
  const onts = await upsertOnts(ots.filter((o) => o.ontSerials[0]).map((o) => ({ sn: o.ontSerials[0], ligneId: lignes.get(o.fgp.trim()) })));

  const colonnesOt = (o: (typeof ots)[number]) => ({
    team_id: equipes.get(o.equipe) ?? null,
    numero_ot: o.numeroOt,
    sous_type: o.sousType,
    date_recu: o.dateRecu,
    date_programme: dateProgramme,
    ancien_dis: o.ancienDis,
    ont_id: o.ontSerials[0] ? (onts.get(normOnt(o.ontSerials[0])) ?? null) : null,
    defaut: o.defaut,
    cable_fibre_m: o.cableFibreM,
    distribue_par: par.id,
    source_fichier: o.sourceFichier,
  });

  const aCompleter: Record<string, unknown>[] = [];
  const aCreer: Record<string, unknown>[] = [];
  for (const o of ots) {
    const ex = existantes.get(`${o.fgp}|${o.nature}`);
    const type = o.typeOt || (o.nature === 'derangement' ? 'DRG' : 'CPL');
    if (ex) {
      // le type lu sur l'OT (ANS, CST…) l'emporte sur celui d'un ancien import Excel
      aCompleter.push({ id: ex.id, type: o.typeOt || ex.type || type, ...colonnesOt(o), cree_par_ot: false });
    } else {
      const debut = o.dateRecu ?? dateProgramme;
      aCreer.push({
        ligne_id: lignes.get(o.fgp.trim()) ?? null,
        type,
        motif: o.defaut || o.sousType || '',
        date_depo: debut,
        date_message: debut,
        delai: 0,
        status: 'pending',
        comment: '',
        nature: o.nature,
        is_urgent: false,
        poteau: 0,
        ...colonnesOt(o),
        cree_par_ot: true,
      });
    }
  }
  let completees = 0;
  let crees = 0;
  if (aCompleter.length) {
    // mise à jour des situations existantes (upsert sur id : une seule requête)
    const { data, error } = await supabase.from(TABLE).upsert(aCompleter, { onConflict: 'id' }).select('id');
    if (error) throw dbError(error, 'Distribution impossible');
    completees = data?.length ?? 0;
  }
  if (aCreer.length) {
    const { data, error } = await supabase.from(TABLE).upsert(aCreer, { onConflict: 'numero_ot', ignoreDuplicates: true }).select('id');
    if (error) throw dbError(error, 'Distribution impossible');
    crees = data?.length ?? 0;
  }
  await enregistrerIps(ots);
  return { crees, completees };
}

// ─── Adresses IP des OT Réseau (IPS / IPM de la constitution, supabase_ot_ip.sql) ─
export interface IpsOT {
  ips: string;
  ipm: string;
}

/** Garde les IPS / IPM lus dans le PDF (sans bloquer la distribution si la table n'existe pas encore) */
async function enregistrerIps(ots: Pick<ParsedOT, 'numeroOt' | 'ips' | 'ipm'>[]) {
  const rows = ots.filter((o) => o.numeroOt && (o.ips || o.ipm)).map((o) => ({ numero_ot: o.numeroOt, ips: o.ips ?? '', ipm: o.ipm ?? '', maj_le: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await supabase.from('ot_adresses_ip').upsert(rows, { onConflict: 'numero_ot' });
  if (error) console.warn('Adresses IP non enregistrées (exécuter supabase_ot_ip.sql) :', error.message);
}

/** IPS / IPM des fiches : n° d'OT → adresses */
export async function fetchIpsOts(numeros: (string | null | undefined)[]): Promise<Map<string, IpsOT>> {
  const out = new Map<string, IpsOT>();
  const liste = [...new Set(numeros.filter((n): n is string => !!n))];
  for (let i = 0; i < liste.length; i += 200) {
    const { data, error } = await supabase.from('ot_adresses_ip').select('numero_ot, ips, ipm').in('numero_ot', liste.slice(i, i + 200));
    if (error) return out; // table pas encore installée
    for (const r of data ?? []) out.set(r.numero_ot as string, { ips: (r.ips as string) ?? '', ipm: (r.ipm as string) ?? '' });
  }
  return out;
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
 *  « Fait » renseigne aussi la date de mise en service et la personne (traite_par), comme un OK de la page Situations. */
/**
 * Poteaux posés par une fiche faite : ceux demandés avant (« Besoin poteau », « Besoin 2 poteaux »,
 * « Poteau cassé ») par la fiche elle-même ou par ses « non fait » passés (historique des renvois).
 */
async function poteauxAPoser(id: string): Promise<number> {
  let n = 0;
  const { data: row } = await supabase.from(TABLE).select('poteau').eq('id', id).maybeSingle();
  n = Math.max(n, Number(row?.poteau) || 0);
  const { data: hist, error } = await supabase.from('historique_clotures_detail').select('*').eq('situation_id', id);
  if (!error)
    for (const h of hist ?? []) if (h.statut === 'non_ok') n = Math.max(n, Number(h.poteau) || 0, poteauxBesoin(h.motif_cloture as string));
  return n;
}

export async function cloturer(id: string, c: Cloture, par: Par): Promise<void> {
  const reset = c.statut === 'a_faire';
  const fait = c.statut === 'fait';
  const now = new Date().toISOString();
  // fait : les poteaux demandés avant sont maintenant posés ; non fait : poteaux nécessaires
  const poteau = reset ? 0 : fait ? await poteauxAPoser(id) : Math.max(0, Math.round(c.poteaux ?? 0));
  // nouvel ONT posé lors d'un changement de constitution : enregistré dans onts
  let nouvelOntId: string | null = null;
  if (fait && c.cstChange && normOnt(c.nouvelOnt)) {
    const onts = await upsertOnts([{ sn: c.nouvelOnt as string }]);
    nouvelOntId = onts.get(normOnt(c.nouvelOnt)) ?? null;
  }
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: versStatus[c.statut],
      motif_cloture: reset ? '' : (c.motif ?? ''),
      comment: reset ? '' : (c.commentaire ?? ''),
      decharge: fait ? (c.decharge ?? null) : null,
      // déclaration du chef ; le statut réel vient du fichier de scan
      scan_declare: fait ? (c.scanne ?? null) : null,
      // la ligne prend le nouveau DIS / ONT (règle automatique de la base)
      nouveau_dis: fait && c.cstChange ? (c.nouveauDis ?? '') : '',
      nouvel_ont_id: nouvelOntId,
      poteau,
      traite_par: reset ? null : par.id,
      traite_le: reset ? null : now,
      date_mise_en_service: fait ? now.slice(0, 10) : null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw dbError(error, 'Mise à jour impossible');
}

/** Réaffecte des fiches à une autre équipe : sans pénalité, la nouvelle équipe repart avec sa
 *  propre échéance (après l'échéance, l'ancienne équipe a déjà perdu son point à 22 h).
 *  `penaliser` reste possible pour un cas exceptionnel. Renvoie le nombre de pénalités. */
export async function reassign(ids: string[], equipe: string, opts: { par?: Par; penaliser?: boolean } = {}): Promise<number> {
  const teamId = await teamIdFor(equipe);
  if (!teamId) throw new Error(`Équipe « ${equipe} » introuvable`);
  const { data, error } = await supabase.rpc('reaffecter_fiches', {
    p_ids: ids,
    p_team: teamId,
    p_par: opts.par?.id ?? null,
    p_penaliser: opts.penaliser ?? false,
  });
  if (error) throw dbError(error, 'Réaffectation impossible');
  return Number(data) || 0;
}

/** Reporte des fiches ouvertes à un autre jour : 1 point de moins pour l'équipe (sauf si elle a
 *  déjà été pénalisée au dernier contrôle, ou `penaliser: false`) */
export async function retarder(ids: string[], date: string, opts: { par?: Par; penaliser?: boolean } = {}): Promise<number> {
  const { data, error } = await supabase.rpc('retarder_fiches', {
    p_ids: ids,
    p_date: date,
    p_par: opts.par?.id ?? null,
    p_penaliser: opts.penaliser ?? true,
  });
  if (error) throw dbError(error, 'Report impossible');
  return Number(data) || 0;
}

/** Toutes les fiches encore ouvertes (en cours), quel que soit le jour de leur programme */
export async function fetchFichesOuvertes(): Promise<ProgrammeOT[]> {
  const { data, error } = await supabase
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .in('status', OUVERT)
    .order('echeance_equipe', { ascending: true, nullsFirst: false })
    .limit(2000);
  if (error) throw dbError(error, 'Chargement des fiches en cours impossible');
  return (data ?? []).map(mapOt);
}

/** Fiches encore ouvertes dont l'échéance d'équipe est AVANT ce jour (non traitées à 22 h) */
export async function fetchEnRetard(avant: string): Promise<ProgrammeOT[]> {
  const { data, error } = await supabase
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .in('status', OUVERT)
    .lt('echeance_equipe', avant)
    .order('echeance_equipe')
    .limit(1000);
  if (error) throw dbError(error, 'Chargement des fiches en retard impossible');
  return (data ?? []).map(mapOt);
}

// ─── Cas urgents (dérangements & installations) ──────────────────────────────

/** Envoie une notification persistante aux chefs d'une équipe pour une urgence */
async function notifierChefsEquipe(
  teamId: string,
  titre: string,
  message: string,
  refId?: string,
): Promise<void> {
  try {
    const { data: chefs } = await supabase
      .from('profiles')
      .select('id')
      .eq('team_id', teamId)
      .eq('role', 'chef');

    if (chefs && chefs.length > 0) {
      const notifs = chefs.map((c) => ({
        destinataire_id: c.id,
        titre,
        message,
        type: 'programme_urgent',
        module: 'programme',
        ref_id: refId ?? null,
      }));
      await supabase.from('app_notifications').insert(notifs);
    }
  } catch (err) {
    console.warn('Impossible d’envoyer la notification chef:', err);
  }
}

/** Active ou désactive le marquage urgent d'une fiche */
export async function marquerUrgent(id: string, isUrgent = true): Promise<void> {
  const now = new Date().toISOString();
  const { data: cur } = await supabase.from(TABLE).select('status, team_id, motif').eq('id', id).maybeSingle();
  const updateData: Record<string, unknown> = {
    is_urgent: isUrgent,
    updated_at: now,
  };
  if (cur && OUVERT.includes(cur.status)) {
    updateData.status = isUrgent ? 'urgent' : 'pending';
  }
  const { error } = await supabase.from(TABLE).update(updateData).eq('id', id);
  if (error) throw dbError(error, 'Mise à jour du statut urgent impossible');

  if (isUrgent && cur?.team_id) {
    const { data: row } = await supabase.from(VUE).select('fgp, client_nom').eq('id', id).maybeSingle();
    await notifierChefsEquipe(
      cur.team_id,
      `🚨 Cas Urgent — ${row?.fgp || 'Ligne'}`,
      `Une intervention de votre programme a été passée en cas urgent par la supervision.${cur.motif ? ` Motif : ${cur.motif}` : ''}`,
      id,
    );
  }
}

/** Affecte ou réaffecte une fiche existante en cas urgent */
export async function affecterUrgent(
  id: string,
  equipe: string,
  opts: { dateProgramme?: string; isUrgent?: boolean; par?: Par; motif?: string } = {},
): Promise<void> {
  const teamId = await teamIdFor(equipe);
  if (!teamId) throw new Error(`Équipe « ${equipe} » introuvable`);
  const now = new Date().toISOString();
  const dateProg = opts.dateProgramme || now.slice(0, 10);
  const patch: Record<string, unknown> = {
    team_id: teamId,
    is_urgent: opts.isUrgent ?? true,
    status: (opts.isUrgent ?? true) ? 'urgent' : 'pending',
    date_programme: dateProg,
    assigne_le: now,
    updated_at: now,
  };
  if (opts.par?.id) patch.distribue_par = opts.par.id;
  if (opts.motif) patch.motif = opts.motif;

  // fiche « non faite » renvoyée en urgence : « OT reçu le » = jour du renvoi
  await redaterRenvoi([id], dateProg, {});
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
  if (error) throw dbError(error, 'Affectation urgente impossible');

  if (opts.isUrgent ?? true) {
    const { data: row } = await supabase.from(VUE).select('fgp, client_nom').eq('id', id).maybeSingle();
    await notifierChefsEquipe(
      teamId,
      `🚨 Cas Urgent — ${row?.fgp || 'Fiche programme'}`,
      `Intervention urgente affectée à votre équipe · Client : ${row?.client_nom || 'Client'}${opts.motif ? ` · Motif : ${opts.motif}` : ''}`,
      id,
    );
  }
}

/**
 * Ajoute un contact à une ligne après la distribution : le numéro passe en premier, il apparaît
 * sur toutes les fiches de ce FGP (chef d'équipe compris). Renvoie la nouvelle liste.
 */
export async function ajouterContact(fgp: string, tel: string): Promise<string[]> {
  const d = tel.replace(/\D/g, '');
  const t = /^(?:00)?222\d{8}$/.test(d) ? d.slice(-8) : d; // 22252750 reste tel quel
  if (!/^[234]\d{7}$/.test(t)) throw new Error('Numéro invalide : 8 chiffres commençant par 2, 3 ou 4');
  const { data, error } = await supabase.from('lignes').select('id, telephones').eq('fgp', fgp.trim()).maybeSingle();
  if (error) throw dbError(error, 'Lecture de la ligne impossible');
  if (!data) throw new Error(`Ligne ${fgp} introuvable`);
  const telephones = [t, ...((data.telephones as string[] | null) ?? []).filter((x) => x !== t)];
  const { error: e2 } = await supabase.from('lignes').update({ telephones }).eq('id', data.id);
  if (e2) throw dbError(e2, 'Ajout du contact impossible');
  return telephones;
}

/**
 * Nouvelle zone / nouveau DIS d'une ligne (superviseur, au renvoi ou en cas urgent) : enregistré
 * sur la ligne, donc sur toutes ses fiches. La zone vide n'est pas écrite.
 */
export async function modifierZoneDis(fgp: string, opts: { zone?: string; dis?: string }): Promise<void> {
  const patch: Record<string, string> = {};
  const zone = opts.zone?.replace(/\s+/g, '').toUpperCase();
  const dis = opts.dis?.replace(/\s+/g, '').toUpperCase();
  if (zone) patch.zone = zone;
  if (dis) patch.dis = dis;
  if (!Object.keys(patch).length) return;
  const avant = dis ? (await disDesLignes([fgp])).get(fgp.trim()) : undefined;
  const { data, error } = await supabase.from('lignes').update(patch).eq('fgp', fgp.trim()).select('id');
  if (error) throw dbError(error, 'Changement de zone / DIS impossible');
  if (!data?.length) throw new Error(`Ligne ${fgp} introuvable`);
  // l'ancien DIS reste visible sur les fiches de la ligne
  if (avant?.dis && dis && avant.dis !== dis) await noterAncienDis([{ ligneId: avant.id, ancien: avant.dis }]);
}

// ─── Commentaire du superviseur pour le chef d'équipe (supabase_note_chef.sql) ──
const SQL_NOTE = 'Le commentaire pour le chef n’est pas encore installé (exécuter supabase_note_chef.sql).';
const erreurNote = (e: { code?: string; message: string }) =>
  e.code === '42703' || e.code === 'PGRST204' || /note_chef/.test(e.message) ? new Error(SQL_NOTE) : dbError(e, 'Commentaire non enregistré');

/** Commentaires pour le chef : id de fiche → commentaire (vide si la colonne n'existe pas encore) */
export async function fetchNotesChef(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const liste = [...new Set(ids.filter((i) => i && !i.startsWith('h:')))];
  for (let i = 0; i < liste.length; i += 200) {
    const { data, error } = await supabase.from(TABLE).select('id, note_chef').in('id', liste.slice(i, i + 200)).neq('note_chef', '');
    if (error) return out;
    (data ?? []).forEach((r) => r.note_chef && out.set(r.id as string, r.note_chef as string));
  }
  return out;
}

/** Commentaire pour le chef sur une fiche ('' l'efface) */
export async function enregistrerNoteChef(id: string, note: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ note_chef: note.trim() }).eq('id', id);
  if (error) throw erreurNote(error);
}

/** Commentaires saisis à la distribution : par n° OT (fiches qui viennent d'être créées / complétées) */
export async function enregistrerNotesParOt(notes: Record<string, string>): Promise<void> {
  for (const [numeroOt, note] of Object.entries(notes)) {
    if (!note.trim()) continue;
    const { error } = await supabase.from(TABLE).update({ note_chef: note.trim() }).eq('numero_ot', numeroOt);
    if (error) throw erreurNote(error);
  }
}

/** Clôture précédente d'une ligne (autre fiche du même FGP), pour la distribution */
export interface MotifPrecedent {
  id: string;
  numeroOt: string;
  nature: ProgrammeOT['nature'];
  statut: OtStatut;
  motif: string;
  commentaire: string;
  equipe: string;
  traiteLe: string | null;
  dateProgramme: string;
}

/**
 * Motifs des fiches déjà clôturées (faites ou non faites) de ces lignes : FGP → clôtures, la plus
 * récente d'abord (5 au plus par ligne). Les clôtures archivées (fiche renvoyée puis refaite) en font partie.
 */
export async function fetchMotifsPrecedents(fgps: string[]): Promise<Map<string, MotifPrecedent[]>> {
  const out = new Map<string, MotifPrecedent[]>();
  const liste = [...new Set(fgps.map((f) => f.trim()).filter(Boolean))];
  for (let i = 0; i < liste.length; i += 200) {
    const { data, error } = await supabase
      .from(VUE)
      .select('id, numero_ot, nature, status, motif_cloture, comment, equipe, traite_le, updated_at, date_programme, fgp')
      .in('fgp', liste.slice(i, i + 200))
      .in('status', [versStatus.fait, versStatus.non_fait])
      .order('traite_le', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (error) throw dbError(error, 'Lecture des motifs précédents impossible');
    for (const r of data ?? []) {
      const m: MotifPrecedent = {
        id: r.id as string,
        numeroOt: (r.numero_ot as string) ?? '',
        nature: r.nature === 'derangement' ? 'derangement' : 'installation',
        statut: versStatut(r.status as string),
        motif: (r.motif_cloture as string) ?? '',
        commentaire: (r.comment as string) ?? '',
        equipe: (r.equipe as string) ?? '',
        traiteLe: (r.traite_le as string) ?? (r.updated_at as string) ?? null,
        dateProgramme: (r.date_programme as string) ?? '',
      };
      out.set(r.fgp as string, [...(out.get(r.fgp as string) ?? []), m]);
    }
    // anciennes clôtures des fiches renvoyées (motif « non fait » gardé dans l'historique)
    const { data: arch, error: e2 } = await supabase
      .from('historique_clotures_detail')
      .select('*')
      .in('fgp', liste.slice(i, i + 200))
      .limit(2000);
    if (!e2)
      for (const r of arch ?? []) {
        const h = mapArchive(r);
        out.set(h.fgp, [
          ...(out.get(h.fgp) ?? []),
          {
            id: h.id,
            numeroOt: '',
            nature: h.nature === 'installation' ? 'installation' : 'derangement',
            statut: h.statut === 'non_ok' ? 'non_fait' : 'fait',
            motif: h.motif,
            commentaire: h.commentaire,
            equipe: h.equipe,
            traiteLe: h.traiteLe,
            dateProgramme: '',
          },
        ]);
      }
  }
  out.forEach((l, k) => out.set(k, l.sort((a, b) => (b.traiteLe ?? '').localeCompare(a.traiteLe ?? '')).slice(0, 5)));
  return out;
}

export interface OtUrgentInput {
  nature: 'derangement' | 'installation';
  typeLigne?: 'FGP' | 'TPH';
  sousType?: string;
  defaut?: string;
  abonnement?: string;
  numeroOt?: string;
  fgp: string;
  clientNom?: string;
  clientCode?: string;
  telephones?: string[];
  adresse?: string;
  zone: string;
  dis?: string;
  pco?: string;
  port?: string;
  ontSerial?: string;
  cableFibreM?: number | null;
  typeOt?: string;
  motif?: string;
  equipe: string;
  dateProgramme?: string;
}

/** Crée et affecte immédiatement un nouvel OT en cas urgent */
export async function creerEtAffecterOtUrgent(input: OtUrgentInput, par: Par): Promise<ProgrammeOT> {
  const fgp = input.fgp.trim();
  const dateProg = input.dateProgramme || new Date().toISOString().slice(0, 10);
  const numeroOt = input.numeroOt?.trim() || `URG-${dateProg.replace(/-/g, '')}-${fgp}`;

  const disVal = input.dis?.trim() || (input.pco?.trim() ? `PCO-${input.pco.trim()}${input.port?.trim() ? `-${input.port.trim()}` : ''}` : undefined);

  const [lignes, teamId] = await Promise.all([
    upsertLignes([
      {
        fgp,
        zone: input.zone.trim(),
        typeLigne: input.typeLigne ?? 'FGP',
        dis: disVal,
        clientNom: input.clientNom?.trim(),
        clientCode: input.clientCode?.trim(),
        telephones: input.telephones?.filter(Boolean),
        adresse: input.adresse?.trim(),
        abonnement: input.abonnement?.trim() || undefined,
      },
    ]),
    teamIdFor(input.equipe),
  ]);

  if (!teamId) throw new Error(`Équipe « ${input.equipe} » introuvable`);

  let ontId: string | null = null;
  if (input.ontSerial?.trim()) {
    const onts = await upsertOnts([{ sn: input.ontSerial.trim(), ligneId: lignes.get(fgp) }]);
    ontId = onts.get(normOnt(input.ontSerial.trim())) ?? null;
  }

  const type = input.typeOt?.trim() || (input.nature === 'derangement' ? 'DRG' : 'CPL');
  const now = new Date().toISOString();

  // On recherche si une situation ouverte existe pour ce FGP
  const ouvertes = await situationsOuvertes([fgp]);
  const ex = ouvertes.get(`${fgp}|${input.nature}`);

  let recordId: string;
  if (ex) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        numero_ot: numeroOt,
        team_id: teamId,
        type: ex.type || type,
        nature: input.nature,
        is_urgent: true,
        status: 'urgent',
        motif: input.motif?.trim() || (input.nature === 'derangement' ? 'Dérangement urgent' : 'Installation urgente'),
        date_programme: dateProg,
        date_recu: dateProg,
        ont_id: ontId,
        cable_fibre_m: input.cableFibreM ?? null,
        ...(input.sousType ? { sous_type: input.sousType } : {}),
        ...(input.defaut ? { defaut: input.defaut } : {}),
        distribue_par: par.id,
        assigne_le: now,
        updated_at: now,
      })
      .eq('id', ex.id)
      .select('id')
      .single();
    if (error) throw dbError(error, 'Mise à jour en cas urgent impossible');
    recordId = data.id;
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        ligne_id: lignes.get(fgp) ?? null,
        numero_ot: numeroOt,
        team_id: teamId,
        type,
        nature: input.nature,
        motif: input.motif?.trim() || (input.nature === 'derangement' ? 'Dérangement urgent' : 'Installation urgente'),
        date_depo: dateProg,
        date_message: dateProg,
        date_recu: dateProg,
        date_programme: dateProg,
        delai: 0,
        status: 'urgent',
        is_urgent: true,
        comment: '',
        poteau: 0,
        ont_id: ontId,
        cable_fibre_m: input.cableFibreM ?? null,
        sous_type: input.sousType ?? '',
        defaut: input.defaut ?? '',
        distribue_par: par.id,
        assigne_le: now,
        cree_par_ot: true,
        source_fichier: 'Manuel Urgent',
      })
      .select('id')
      .single();
    if (error) throw dbError(error, 'Création du cas urgent impossible');
    recordId = data.id;
  }

  const { data: row, error: fetchErr } = await supabase.from(VUE).select('*').eq('id', recordId).single();
  if (fetchErr) throw dbError(fetchErr, 'Relecture de la fiche impossible');

  await notifierChefsEquipe(
    teamId,
    `🚨 Nouveau Cas Urgent (${input.nature === 'derangement' ? 'Dérangement' : 'Installation'}) — ${input.fgp}`,
    `Nouvelle intervention urgente affectée à votre équipe · Client : ${input.clientNom || 'Client'} · Zone : ${input.zone || '?'}${input.motif ? ` · Motif : ${input.motif}` : ''}`,
    recordId,
  );

  return mapOt(row);
}

/**
 * Cas urgent à partir d'une fiche de l'historique (déjà faite, non faite, ou d'une autre nature) :
 * nouvel OT urgent avec toute la fiche (client, contacts, adresse, DIS, ONT, câble…). La fiche
 * d'origine garde sa clôture. `nature` permet par ex. un dérangement sur une ancienne installation.
 */
export async function urgentDepuisFiche(
  o: ProgrammeOT,
  opts: { nature: ProgrammeOT['nature']; equipe: string; dateProgramme: string; motif?: string },
  par: Par,
): Promise<ProgrammeOT> {
  const heure = new Date().toISOString().slice(11, 16).replace(':', '');
  return creerEtAffecterOtUrgent(
    {
      nature: opts.nature,
      numeroOt: `URG-${opts.dateProgramme.replace(/-/g, '')}${heure}-${o.fgp}`,
      typeLigne: o.typeLigne,
      // même nature : même type d'OT (CPL, ANS…) ; sinon DRG / CPL par défaut
      typeOt: opts.nature === o.nature ? o.typeOt || undefined : undefined,
      sousType: opts.nature === o.nature ? o.sousType : undefined,
      defaut: opts.nature === 'derangement' ? o.defaut || undefined : undefined,
      abonnement: o.abonnement,
      fgp: o.fgp,
      clientNom: o.clientNom,
      clientCode: o.clientCode,
      telephones: o.telephones,
      adresse: o.adresse,
      zone: o.zone,
      dis: o.dis || undefined,
      pco: o.pco,
      port: o.port,
      ontSerial: o.ontSerials[0],
      cableFibreM: opts.nature === 'installation' ? o.cableFibreM : null,
      motif: opts.motif,
      equipe: opts.equipe,
      dateProgramme: opts.dateProgramme,
    },
    par,
  );
}

/**
 * Recherche pour un cas urgent dans tout l'historique (fiches OT et situations) : FGP, compte
 * client, nom du client, n° d'OT ou zone — fiches ouvertes comme clôturées.
 */
export async function rechercherFichesProgramme(recherche: string): Promise<ProgrammeOT[]> {
  // virgules / parenthèses : réservées par la syntaxe « or » de PostgREST
  const term = recherche.replace(/[,()*%\\]/g, ' ').trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from(VUE)
    .select('*')
    .or(`fgp.ilike.%${term}%,client_code.ilike.%${term}%,numero_ot.ilike.%${term}%,client_nom.ilike.%${term}%,zone.ilike.%${term}%`)
    .order('date_programme', { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) throw dbError(error, 'Recherche impossible');
  return (data ?? []).map(mapOt);
}

/**
 * Recherche dans tout le programme distribué (page Distribuer) : FGP, compte client, nom du client
 * ou n° d'OT — pour voir tout de suite le statut et le motif d'une fiche.
 */
export async function rechercherProgramme(recherche: string): Promise<ProgrammeOT[]> {
  // virgules / parenthèses : réservées par la syntaxe « or » de PostgREST
  const term = recherche.replace(/[,()*%\\]/g, ' ').trim();
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .or(`fgp.ilike.%${term}%,client_code.ilike.%${term}%,client_nom.ilike.%${term}%,numero_ot.ilike.%${term}%`)
    .order('date_programme', { ascending: false })
    .limit(30);
  if (error) throw dbError(error, 'Recherche impossible');
  return (data ?? []).map(mapOt);
}

/** Fiches « non faites » encore à renvoyer, programmées depuis `depuis` (et avant `avant` si donné) */
export async function fetchNonFaitesARenvoyer(depuis: string, avant?: string): Promise<ProgrammeOT[]> {
  let q = supabase
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .eq('status', versStatus.non_fait)
    .gte('date_programme', depuis);
  if (avant) q = q.lt('date_programme', avant);
  const { data, error } = await q.order('date_programme', { ascending: false }).limit(1000);
  if (error) throw dbError(error, 'Chargement des fiches non faites impossible');
  return (data ?? []).map(mapOt);
}

// ─── Pénalités et contrôle de 22 h ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapPenalite = (r: any): Penalite => ({
  id: r.id,
  situationId: r.situation_id,
  equipe: r.equipe ?? '',
  jour: r.jour,
  motif: r.motif,
  points: Number(r.points) || 0,
  creeParNom: r.cree_par_nom ?? null,
  note: r.note ?? null,
  motifFauxOk: r.motif_faux_ok ?? null,
  fgp: r.fgp ?? '',
  typeLigne: r.type_ligne ?? 'FGP',
  clientNom: r.client_nom ?? '',
  nature: r.nature === 'derangement' ? 'derangement' : 'installation',
  numeroOt: r.numero_ot ?? '',
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Pénalités d'une période (jour du contrôle ou de l'action) */
export async function fetchPenalites(from: string, to: string): Promise<Penalite[]> {
  const { data, error } = await supabase.from('penalites_detail').select('*').gte('jour', from).lte('jour', to).order('jour').limit(5000);
  if (error) {
    // module pas encore installé (supabase_programme_controle.sql) : pas de pénalités
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw dbError(error, 'Chargement des pénalités impossible');
  }
  return (data ?? []).map(mapPenalite);
}

/**
 * Fiche marquée « Fait » à tort : pénalité « faux OK » du barème pour l'équipe, fiche rouverte
 * chez elle (ses points disparaissent). motif : code de MOTIFS_FAUX_OK ; « autre » → note obligatoire.
 */
export async function signalerFauxOk(id: string, par: Par, motif: MotifFauxOk, note = ''): Promise<void> {
  const { error } = await supabase.rpc('signaler_faux_ok', { p_id: id, p_par: par.id, p_motif: motif, p_note: note });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883')
      throw new Error('Les motifs du faux OK ne sont pas encore installés (exécuter supabase_parametres.sql).');
    throw dbError(error, 'Signalement impossible');
  }
}

/** OK suspects (ONT non scanné après l'installation, nouveau dérangement sur le FGP) */
export async function fetchCloturesAVerifier(): Promise<ClotureAVerifier[]> {
  const { data, error } = await supabase.from('clotures_a_verifier').select('*').order('traite_le', { ascending: false }).limit(500);
  if (error) return []; // module pas encore installé
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    id: r.id,
    numeroOt: r.numero_ot ?? '',
    nature: r.nature === 'derangement' ? 'derangement' : 'installation',
    equipe: r.equipe ?? '',
    fgp: r.fgp ?? '',
    typeLigne: r.type_ligne ?? 'FGP',
    clientNom: r.client_nom ?? '',
    traiteLe: r.traite_le ?? null,
    traiteParNom: r.traite_par_nom ?? null,
    cause: r.cause === 'rechute' ? 'rechute' : 'scan',
    raison: r.raison ?? '',
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Annule une pénalité (erreur de distribution, fiche faite mais pas cliquée…) */
export async function annulerPenalite(id: string): Promise<void> {
  const { error } = await supabase.from('penalites').delete().eq('id', id);
  if (error) throw dbError(error, 'Annulation impossible');
}

/** Contrôle les jours ouvrés passés qui ne l'ont pas été (si la tâche de 22 h n'a pas tourné) */
export async function rattraperControles(): Promise<number> {
  const { data, error } = await supabase.rpc('rattraper_controles');
  // photo du programme du jour (fiches en cours par équipe) : sans effet si le SQL n'est pas installé
  await supabase.rpc('photographier_programme').then(
    () => undefined,
    () => undefined,
  );
  return error ? 0 : Number(data) || 0;
}

/**
 * Photos du programme entre from et to (supabase_photo_programme.sql) : pour chaque jour, les
 * fiches encore en cours de chaque équipe en fin de journée. Vide si la table n'existe pas.
 */
export async function fetchPhotosProgramme(from: string, to: string): Promise<{ jour: string; ot: ProgrammeOT }[]> {
  const { data, error } = await supabase.from('programme_photo').select('jour, donnees').gte('jour', from).lte('jour', to).limit(20000);
  if (error) return [];
  return (data ?? []).map((r) => ({ jour: String(r.jour).slice(0, 10), ot: mapOt(r.donnees) }));
}

/** Dernier contrôle de 22 h effectué */
export async function fetchDernierControle(): Promise<{ jour: string; nbFiches: number } | null> {
  const { data, error } = await supabase.from('controles_soir').select('jour, nb_fiches').order('jour', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { jour: data.jour as string, nbFiches: Number(data.nb_fiches) || 0 };
}

/** Mémorise l'équipe d'une zone (retirée des autres équipes) */
export async function attribuerZone(zone: string, equipe: string): Promise<void> {
  const teamId = await teamIdFor(equipe);
  if (!teamId) throw new Error(`Équipe « ${equipe} » introuvable`);
  const { error } = await supabase.rpc('attribuer_zone', { p_zone: zone, p_team: teamId });
  if (error) throw dbError(error, 'Enregistrement de la zone impossible');
}

/** Retire des fiches du programme : une situation créée par l'OT est supprimée ; une
 *  situation Excel complétée par l'OT est seulement détachée du programme (elle reste). */
export async function deleteOts(ids: string[]): Promise<void> {
  const del = await supabase.from(TABLE).delete().in('id', ids).eq('cree_par_ot', true);
  if (del.error) throw dbError(del.error, 'Suppression impossible');
  const det = await supabase
    .from(TABLE)
    .update({ numero_ot: null, date_programme: null, distribue_par: null, assigne_le: null })
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'penalites' }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(onChange, 500);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reclamations_faux_ok' }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(onChange, 500);
    })
    .subscribe();
  return () => {
    if (t) clearTimeout(t);
    supabase.removeChannel(channel);
  };
}

// ─── Renvoi des fiches « non faites » (supabase_redistribution.sql) ───────────
export interface ClotureArchivee {
  id: string;
  situationId: string;
  equipe: string;
  statut: 'ok' | 'non_ok';
  motif: string;
  commentaire: string;
  traiteLe: string | null;
  traiteParNom: string | null;
  renvoyeLe: string;
  renvoyeParNom: string | null;
  fgp: string;
  typeLigne: string;
  clientNom: string;
  zone: string;
  nature: string;
}

const mapArchive = (r: Record<string, any>): ClotureArchivee => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  id: r.id,
  situationId: r.situation_id,
  equipe: r.equipe ?? '',
  statut: r.statut,
  motif: r.motif_cloture ?? '',
  commentaire: r.commentaire ?? '',
  traiteLe: r.traite_le ?? null,
  traiteParNom: r.traite_par_nom ?? null,
  renvoyeLe: r.renvoye_le,
  renvoyeParNom: r.renvoye_par_nom ?? null,
  fgp: r.fgp ?? '',
  typeLigne: r.type_ligne ?? 'FGP',
  clientNom: r.client_nom ?? '',
  zone: r.zone ?? '',
  nature: r.nature ?? '',
});

/** Fiches par identifiant (pour retrouver une fiche renvoyée puis refaite plus tard) */
export async function fetchFichesParIds(ids: string[]): Promise<ProgrammeOT[]> {
  const out: ProgrammeOT[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(VUE).select('*').in('id', ids.slice(i, i + 200));
    if (error) throw dbError(error, 'Chargement des fiches impossible');
    out.push(...(data ?? []).map(mapOt));
  }
  return out;
}

/** Motifs passés des fiches renvoyées : fiche → clôtures précédentes (la plus ancienne d'abord) */
export async function fetchHistoriqueClotures(ids: string[]): Promise<Map<string, ClotureArchivee[]>> {
  const out = new Map<string, ClotureArchivee[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('historique_clotures_detail')
      .select('*')
      .in('situation_id', ids.slice(i, i + 200))
      .order('traite_le', { ascending: true });
    if (error) return out; // module pas encore installé
    for (const r of data ?? []) {
      const a = mapArchive(r);
      out.set(a.situationId, [...(out.get(a.situationId) ?? []), a]);
    }
  }
  return out;
}

/** Clôtures archivées entre from et to (jours inclus) : elles comptent comme « non faites » de leur jour */
export async function fetchHistoriquePeriode(from: string, to: string): Promise<ClotureArchivee[]> {
  const fin = new Date(`${to}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  const { data, error } = await supabase
    .from('historique_clotures_detail')
    .select('*')
    .gte('traite_le', `${from}T00:00:00Z`)
    .lt('traite_le', fin.toISOString())
    .limit(10000);
  if (error) return [];
  return (data ?? []).map(mapArchive);
}

/**
 * Une fiche « non faite » renvoyée repart d'une nouvelle date « OT reçu le » (date_recu et
 * date_message) : la date lue sur l'OT réimporté si elle est plus récente, sinon le jour du renvoi
 * (au plus tard le jour du programme). Sans cela, le délai partait toujours de la première
 * réception et la fiche renvoyée était « hors délai » d'office. La date n'avance jamais en arrière.
 *
 * Seulement si la fiche a été dite « non faite » AVEC un motif (problème du client) ; sans motif,
 * elle garde sa date. Même « non faite » après son échéance, la fiche renvoyée repart du jour du
 * renvoi : l'équipe qui la reçoit a son délai complet (ex. reçue le 16, « non faite » le 19 pour
 * besoin de poteau, renvoyée le 23 et faite le 23 : dans le délai).
 */
async function redaterRenvoi(ids: string[], date: string, datesOt: Record<string, string | null | undefined>) {
  const n = new Date();
  const aujourdhui = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const jourRenvoi = date && date < aujourdhui ? date : aujourdhui;
  const parDate = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, status, date_recu, date_message, motif_cloture')
      .in('id', ids.slice(i, i + 200));
    if (error) throw dbError(error, 'Lecture des fiches à renvoyer impossible');
    for (const r of data ?? []) {
      if (r.status !== 'non_ok') continue;
      // « non fait » sans motif : rien ne prouve un problème du client, la fiche garde sa date
      if (!String(r.motif_cloture ?? '').trim()) continue;
      const ancienne = ((r.date_recu ?? r.date_message ?? '') as string).slice(0, 10);
      const lue = (datesOt[r.id as string] ?? '').slice(0, 10);
      const nouvelle = lue && lue > ancienne ? lue : jourRenvoi;
      if (nouvelle > ancienne) parDate.set(nouvelle, [...(parDate.get(nouvelle) ?? []), r.id as string]);
    }
  }
  for (const [d, liste] of parDate) {
    const { error } = await supabase.from(TABLE).update({ date_recu: d, date_message: d }).in('id', liste);
    if (error) throw dbError(error, 'Mise à jour de la date « OT reçu le » impossible');
  }
}

/**
 * Fiches « non faites » avec une CST dans le motif (« … + CST CA1Z042611/1-4 ») : au renvoi, la
 * ligne prend ce nouveau DIS et sa zone, pour que l'équipe voie la bonne distribution et le bon port.
 */
async function appliquerCstRenvoi(ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(VUE).select('id, status, fgp, dis, zone, motif_cloture').in('id', ids.slice(i, i + 200));
    if (error) throw dbError(error, 'Lecture des fiches à renvoyer impossible');
    for (const r of data ?? []) {
      if (r.status !== 'non_ok' || !r.fgp) continue;
      const dis = disDuMotifCst(r.motif_cloture as string);
      if (!dis || dis === String(r.dis ?? '').replace(/\s+/g, '').toUpperCase()) continue;
      try {
        await modifierZoneDis(r.fgp as string, { dis, zone: zoneDuDis(dis) ?? undefined });
      } catch {
        /* droit insuffisant sur la ligne : le renvoi se fait quand même, DIS inchangé */
      }
    }
  }
}

/**
 * Renvoie des fiches « non faites » à une équipe (null : la même) pour le jour donné : le motif
 * passé est gardé dans l'historique, la fiche redevient « à faire ». Renvoie le nombre renvoyé.
 * Motif avec CST : le nouveau DIS (et sa zone) est appliqué à la ligne, sauf `cst: false`
 * (zone / DIS déjà choisis à la main par le superviseur).
 */
export async function redistribuer(
  ids: string[],
  equipe: string | null,
  date: string,
  par: Par,
  /** date « OT reçu le » lue sur l'OT réimporté, par id de fiche */
  datesOt: Record<string, string | null | undefined> = {},
  opts: { cst?: boolean } = {},
): Promise<number> {
  const teamId = equipe ? await teamIdFor(equipe) : null;
  if (equipe && !teamId) throw new Error(`Équipe « ${equipe} » introuvable`);
  if (opts.cst !== false) await appliquerCstRenvoi(ids);
  // avant le renvoi : l'échéance et la priorité calculées par la base partent de la nouvelle date
  await redaterRenvoi(ids, date, datesOt);
  const { data, error } = await supabase.rpc('redistribuer_fiches', { p_ids: ids, p_team: teamId, p_date: date, p_par: par.id });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883')
      throw new Error('Le renvoi des fiches n’est pas encore installé (exécuter supabase_redistribution.sql).');
    throw dbError(error, 'Renvoi impossible');
  }
  return Number(data ?? 0);
}

// ─── Réclamations d'un faux OK (supabase_parametres.sql, section 5) ──────────
export interface ReclamationFauxOk {
  id: string;
  situationId: string;
  teamId: string;
  equipe: string;
  jourFauxOk: string;
  motifFauxOk: string | null;
  noteFauxOk: string | null;
  points: number;
  message: string;
  demandeParNom: string | null;
  demandeLe: string;
  statut: 'en_attente' | 'acceptee' | 'refusee';
  reponse: string | null;
  traiteParNom: string | null;
  traiteLe: string | null;
  fgp: string;
  typeLigne: string;
  clientNom: string;
  numeroOt: string | null;
  nature: string;
}

const mapReclamation = (r: Record<string, any>): ReclamationFauxOk => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  id: r.id,
  situationId: r.situation_id,
  teamId: r.team_id,
  equipe: r.equipe ?? '',
  jourFauxOk: r.jour_faux_ok,
  motifFauxOk: r.motif_faux_ok ?? null,
  noteFauxOk: r.note_faux_ok ?? null,
  points: Number(r.points ?? 0),
  message: r.message ?? '',
  demandeParNom: r.demande_par_nom ?? null,
  demandeLe: r.demande_le,
  statut: r.statut,
  reponse: r.reponse ?? null,
  traiteParNom: r.traite_par_nom ?? null,
  traiteLe: r.traite_le ?? null,
  fgp: r.fgp ?? '',
  typeLigne: r.type_ligne ?? 'FGP',
  clientNom: r.client_nom ?? '',
  numeroOt: r.numero_ot ?? null,
  nature: r.nature ?? '',
});

/** Réclamations : toutes (superviseur) ou celles d'une équipe (chef) ; les en attente d'abord */
export async function fetchReclamations(opts: { teamId?: string | null; depuisJours?: number } = {}): Promise<ReclamationFauxOk[]> {
  const depuis = new Date(Date.now() - (opts.depuisJours ?? 30) * 86400000).toISOString();
  let q = supabase.from('reclamations_faux_ok_detail').select('*').gte('demande_le', depuis).order('demande_le', { ascending: false }).limit(500);
  if (opts.teamId) q = q.eq('team_id', opts.teamId);
  const { data, error } = await q;
  if (error) {
    // module pas encore installé : pas de réclamations
    if (error.code === 'PGRST205' || error.code === '42P01') return [];
    throw dbError(error, 'Chargement des réclamations impossible');
  }
  return (data ?? []).map(mapReclamation).sort((a, b) => Number(b.statut === 'en_attente') - Number(a.statut === 'en_attente'));
}

const installerReclamations = (error: { code?: string }) =>
  error.code === 'PGRST202' || error.code === '42883' ? new Error('Les réclamations ne sont pas encore installées (exécuter supabase_parametres.sql).') : null;

/** Le chef conteste le faux OK de cette fiche */
export async function reclamerFauxOk(situationId: string, par: Par, message: string): Promise<void> {
  const { error } = await supabase.rpc('reclamer_faux_ok', { p_situation: situationId, p_par: par.id, p_message: message });
  if (error) throw installerReclamations(error) ?? dbError(error, 'Réclamation impossible');
}

/** L'admin / le superviseur accepte (faux OK annulé, fiche rétablie) ou refuse (raison obligatoire) */
export async function traiterReclamation(id: string, par: Par, accepter: boolean, reponse = ''): Promise<'acceptee' | 'acceptee_retablie' | 'refusee'> {
  const { data, error } = await supabase.rpc('traiter_reclamation_faux_ok', { p_id: id, p_par: par.id, p_accepter: accepter, p_reponse: reponse });
  if (error) throw installerReclamations(error) ?? dbError(error, 'Traitement impossible');
  return data as 'acceptee' | 'acceptee_retablie' | 'refusee';
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
    .from(VUE)
    .select('*')
    .not('numero_ot', 'is', null)
    .or(
      `and(status.eq.ok,traite_le.gte.${fromIso},traite_le.lte.${toIso}),and(nature.eq.derangement,date_recu.gte.${fromIso.slice(0, 10)},date_recu.lte.${toIso.slice(0, 10)})`,
    )
    .limit(5000);
  if (error) throw dbError(error, 'Chargement du rapport impossible');
  return (data ?? []).map(mapOt);
}
