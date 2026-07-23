import { supabase } from './supabase';
import type { Situation, Equipe, ImportRecord, User, Employee, LeaveRecord, Vehicle, Materiel, ScanRecord } from '@/types';

// ─── SITUATIONS ──────────────────────────────────────────────────────────────

export async function fetchSituations(): Promise<Situation[]> {
  const { data, error } = await supabase.from('situations').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('fetchSituations:', error);
    return [];
  }
  return (data ?? []).map(mapSituation);
}

export async function upsertSituation(sit: Situation): Promise<void> {
  const { id: _omit, ...payload } = toDbSituation(sit);
  const { error } = await supabase.from('situations').upsert(payload, { onConflict: 'fgp' });
  if (error) console.error('upsertSituation:', error);
}

export async function updateSituationStatus(fgp: string, status: Situation['status'], comment = '', dateClt?: string): Promise<void> {
  const payload: Record<string, any> = { status, comment, updated_at: new Date().toISOString() };
  if (dateClt) payload.date_clt = dateClt;
  const { error } = await supabase.from('situations').update(payload).eq('fgp', fgp);
  if (error) console.error('updateSituationStatus:', error);
}

export async function insertSituationsBulk(rows: Situation[]): Promise<void> {
  const CHUNK = 500;
  let insertedAny = false;
  let lastError: string | null = null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    // `id` n'est PAS envoyé ici : les id générés côté app (ex: "imp-546-...") ne sont pas
    // des UUID valides pour la colonne `id` de la table, ce qui faisait échouer tout le lot
    // avec "invalid input syntax for type uuid". On laisse Postgres générer le vrai UUID ;
    // le upsert se base sur `fgp` (onConflict) pour la déduplication, pas sur `id`.
    const chunk = rows.slice(i, i + CHUNK).map((r) => {
      const { id: _omit, ...rest } = toDbSituation(r);
      return rest;
    });
    const { error } = await supabase.from('situations').upsert(chunk, { onConflict: 'fgp' });
    if (error) {
      console.error('insertSituationsBulk chunk:', error);
      lastError = error.message;
      continue;
    }
    insertedAny = true;
  }
  // Si RIEN n'a pu être inséré alors qu'on avait des lignes à importer, c'est un échec réel
  // (colonne manquante, contrainte violée...) — on le signale au lieu de laisser croire à un succès.
  if (!insertedAny && rows.length > 0) {
    throw new Error(lastError ?? "Aucune situation n'a pu être importée (vérifiez le schéma de la table situations)");
  }
}

// ─── EQUIPES ─────────────────────────────────────────────────────────────────

export async function fetchEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase.from('teams').select('*').order('name');
  if (error) {
    console.error('fetchEquipes:', error);
    return [];
  }
  return (data ?? []).map(mapEquipe);
}

export async function createEquipe(equipe: Partial<Equipe>): Promise<Equipe | null> {
  const { data: newTeam, error } = await supabase
    .from('teams')
    .insert({
      name: equipe.name,
      leader_name: equipe.leader,
      color: equipe.color,
      zones: equipe.zones ?? [],
      elements: equipe.elements ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error('createEquipe team error:', error);
    return null;
  }

  // Create profile for the leader
  if (equipe.leader) {
    const { error: profileError } = await supabase.from('profiles').insert({
      name: equipe.leader,
      role: 'chef',
      team_id: newTeam.id,
      password_hash: 'chef2026', // default password
    });
    if (profileError) {
      console.error('createEquipe profile error:', profileError);
    }
  }

  return mapEquipe(newTeam);
}

export async function updateEquipe(id: string, patch: Partial<Equipe>): Promise<void> {
  const payload: Record<string, any> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.leader !== undefined) payload.leader_name = patch.leader;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.elements !== undefined) payload.elements = patch.elements;
  if (patch.ville !== undefined) payload.ville = patch.ville;
  const { error } = await supabase.from('teams').update(payload).eq('id', id);
  if (error) console.error('updateEquipe:', error);
}

export async function deleteEquipe(id: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) console.error('deleteEquipe:', error);
}

// ─── IMPORT HISTORY ──────────────────────────────────────────────────────────

export async function fetchImportHistory(): Promise<ImportRecord[]> {
  const { data, error } = await supabase.from('import_history').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) {
    console.error('fetchImportHistory:', error);
    return [];
  }
  return (data ?? []).map(mapImportRecord);
}

export async function insertImportRecord(record: Omit<ImportRecord, 'id'>): Promise<ImportRecord | null> {
  const { data, error } = await supabase
    .from('import_history')
    .insert({
      file_name: record.fileName,
      import_date: record.date,
      row_count: record.count,
      imported_by: record.by,
    })
    .select()
    .single();
  if (error) {
    console.error('insertImportRecord:', error);
    return null;
  }
  return mapImportRecord(data);
}

export async function deleteImportRecord(id: string): Promise<void> {
  const { error } = await supabase.from('import_history').delete().eq('id', id);
  if (error) {
    console.error('deleteImportRecord:', error);
    throw new Error(error.message);
  }
}

// ─── MAPPERS ─────────────────────────────────────────────────────────────────

function mapSituation(row: any): Situation {
  return {
    id: row.id,
    fgp: row.fgp,
    type: row.type,
    zone: row.zone,
    equipe: row.equipe,
    motif: row.motif ?? '',
    dateDepo: row.date_depo ?? '',
    dateClt: row.date_clt ?? '',
    dateMessage: row.date_message ?? '',
    serviceDestination: row.service_destination ?? '',
    delai: row.delai ?? 0,
    status: row.status,
    comment: row.comment ?? '',
    updatedAt: row.updated_at,
    isUrgent: row.is_urgent ?? false,
    nature: row.nature ?? 'installation',
    conformite: row.conformite ?? undefined,
  };
}

function toDbSituation(s: Situation) {
  return {
    id: s.id,
    fgp: s.fgp,
    type: s.type,
    zone: s.zone,
    equipe: s.equipe,
    motif: s.motif,
    date_depo: s.dateDepo || null,
    date_clt: s.dateClt || null,
    date_message: s.dateMessage || null,
    service_destination: s.serviceDestination || null,
    delai: s.delai,
    status: s.status,
    comment: s.comment,
    is_urgent: s.isUrgent ?? false,
    updated_at: s.updatedAt ?? new Date().toISOString(),
    nature: s.nature ?? 'installation',
    conformite: s.conformite ?? null,
  };
}

function mapEquipe(row: any): Equipe {
  return {
    id: row.id,
    name: row.name,
    leader: row.leader_name ?? row.name,
    zones: row.zones ?? [],
    color: row.color ?? '#1565C0',
    elements: row.elements ?? [],
    ville: row.ville ?? 'Nouakchott',
  };
}

function mapEmployee(row: any): Employee {
  return {
    id: row.id,
    mle: row.mle ?? '',
    name: row.name,
    poste: row.poste ?? '',
    banque: row.banque ?? '',
    rib: row.rib ?? '',
    montant: row.montant != null ? Number(row.montant) : undefined,
    telephone: row.telephone ?? '',
    nni: row.nni ?? '',
    ville: row.ville ?? '',
    equipeNom: row.equipe_nom ?? '',
    dateEmbauche: row.date_embauche ?? '',
    actif: row.actif ?? true,
    createdAt: row.created_at,
  };
}

function mapVehicle(row: any): Vehicle {
  return {
    id: row.id,
    type: row.type,
    immatriculation: row.immatriculation ?? '',
    statut: row.statut ?? 'active',
    statutDepuis: row.statut_depuis ?? row.created_at,
    equipeNom: row.equipe_nom ?? '',
    chauffeurId: row.chauffeur_id ?? undefined,
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

function mapMateriel(row: any): Materiel {
  return {
    id: row.id,
    code: row.code ?? '',
    nom: row.nom,
    equipeNom: row.equipe_nom ?? '',
    quantite: row.quantite != null ? Number(row.quantite) : 1,
    etat: row.etat ?? 'bon',
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

function mapLeave(row: any): LeaveRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    type: row.type,
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    jours: row.jours ?? 0,
    motif: row.motif ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
  };
}

function mapImportRecord(row: any): ImportRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    date: row.import_date ?? row.created_at,
    count: row.row_count,
    by: row.imported_by,
  };
}

// ─── ZONES (stored in teams table as array) ───────────────────────────────────

export async function addZoneToTeam(teamId: string, zone: string): Promise<void> {
  // Fetch current zones then append
  const { data, error: fetchErr } = await supabase.from('teams').select('zones').eq('id', teamId).single();
  if (fetchErr) {
    console.error('addZoneToTeam fetch:', fetchErr);
    return;
  }
  const zones: string[] = data?.zones ?? [];
  if (zones.includes(zone)) return; // already there
  const { error } = await supabase
    .from('teams')
    .update({ zones: [...zones, zone] })
    .eq('id', teamId);
  if (error) console.error('addZoneToTeam update:', error);
}

export async function removeZoneFromTeam(teamId: string, zone: string): Promise<void> {
  const { data, error: fetchErr } = await supabase.from('teams').select('zones').eq('id', teamId).single();
  if (fetchErr) {
    console.error('removeZoneFromTeam fetch:', fetchErr);
    return;
  }
  const zones: string[] = (data?.zones ?? []).filter((z: string) => z !== zone);
  const { error } = await supabase.from('teams').update({ zones }).eq('id', teamId);
  if (error) console.error('removeZoneFromTeam update:', error);
}

export async function reassignSituationEquipe(fgp: string, equipe: string): Promise<void> {
  const { error } = await supabase.from('situations').update({ equipe, updated_at: new Date().toISOString() }).eq('fgp', fgp);
  if (error) console.error('reassignSituationEquipe:', error);
}

// ─── VILLE (équipe) ────────────────────────────────────────────────────────────

export async function setTeamVille(teamId: string, ville: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ ville }).eq('id', teamId);
  if (error) console.error('setTeamVille:', error);
}

// ─── EMPLOYÉS ──────────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase.from('employees').select('*').order('name');
  if (error) {
    console.error('fetchEmployees:', error);
    return [];
  }
  return (data ?? []).map(mapEmployee);
}

export async function createEmployee(emp: Partial<Employee>): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('employees')
    .insert({
      mle: emp.mle,
      name: emp.name,
      poste: emp.poste,
      banque: emp.banque,
      rib: emp.rib,
      montant: emp.montant,
      telephone: emp.telephone,
      nni: emp.nni,
      ville: emp.ville,
      equipe_nom: emp.equipeNom,
      date_embauche: emp.dateEmbauche || null,
      actif: emp.actif ?? true,
    })
    .select()
    .single();
  if (error) {
    console.error('createEmployee:', error);
    return null;
  }
  return mapEmployee(data);
}

export async function updateEmployee(id: string, emp: Partial<Employee>): Promise<void> {
  const { error } = await supabase
    .from('employees')
    .update({
      mle: emp.mle,
      name: emp.name,
      poste: emp.poste,
      banque: emp.banque,
      rib: emp.rib,
      montant: emp.montant,
      telephone: emp.telephone,
      nni: emp.nni,
      ville: emp.ville,
      equipe_nom: emp.equipeNom,
      date_embauche: emp.dateEmbauche || null,
      actif: emp.actif,
    })
    .eq('id', id);
  if (error) console.error('updateEmployee:', error);
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) console.error('deleteEmployee:', error);
}

// ─── CONGÉS ────────────────────────────────────────────────────────────────────

export async function fetchLeaves(): Promise<LeaveRecord[]> {
  const { data, error } = await supabase.from('employee_leaves').select('*').order('date_debut', { ascending: false });
  if (error) {
    console.error('fetchLeaves:', error);
    return [];
  }
  return (data ?? []).map(mapLeave);
}

export async function createLeave(leave: Partial<LeaveRecord>): Promise<LeaveRecord | null> {
  const { data, error } = await supabase
    .from('employee_leaves')
    .insert({
      employee_id: leave.employeeId,
      type: leave.type,
      date_debut: leave.dateDebut,
      date_fin: leave.dateFin,
      jours: leave.jours,
      motif: leave.motif ?? '',
      created_by: leave.createdBy ?? '',
    })
    .select()
    .single();
  if (error) {
    console.error('createLeave:', error);
    return null;
  }
  return mapLeave(data);
}

export async function updateLeave(id: string, leave: Partial<LeaveRecord>): Promise<void> {
  const { error } = await supabase
    .from('employee_leaves')
    .update({
      type: leave.type,
      date_debut: leave.dateDebut,
      date_fin: leave.dateFin,
      jours: leave.jours,
      motif: leave.motif,
    })
    .eq('id', id);
  if (error) console.error('updateLeave:', error);
}

export async function deleteLeave(id: string): Promise<void> {
  const { error } = await supabase.from('employee_leaves').delete().eq('id', id);
  if (error) console.error('deleteLeave:', error);
}

// ─── VÉHICULES ─────────────────────────────────────────────────────────────────

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase.from('vehicles').select('*').order('type');
  if (error) {
    console.error('fetchVehicles:', error);
    return [];
  }
  return (data ?? []).map(mapVehicle);
}

export async function createVehicle(v: Partial<Vehicle>): Promise<Vehicle | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      type: v.type,
      immatriculation: v.immatriculation,
      statut: v.statut ?? 'active',
      statut_depuis: v.statutDepuis ?? new Date().toISOString(),
      equipe_nom: v.equipeNom,
      chauffeur_id: v.chauffeurId || null,
      notes: v.notes ?? '',
    })
    .select()
    .single();
  if (error) {
    console.error('createVehicle:', error);
    return null;
  }
  return mapVehicle(data);
}

export async function updateVehicle(id: string, v: Partial<Vehicle>): Promise<void> {
  const payload: Record<string, any> = {
    type: v.type,
    immatriculation: v.immatriculation,
    statut: v.statut,
    equipe_nom: v.equipeNom,
    chauffeur_id: v.chauffeurId || null,
    notes: v.notes,
  };
  // On ne touche à la date de référence que si le statut vient réellement de changer
  if (v.statutDepuis) payload.statut_depuis = v.statutDepuis;
  const { error } = await supabase.from('vehicles').update(payload).eq('id', id);
  if (error) console.error('updateVehicle:', error);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) console.error('deleteVehicle:', error);
}

// ─── MATÉRIEL / OUTILLAGE DES ÉQUIPES ──────────────────────────────────────────

export async function fetchMateriels(): Promise<Materiel[]> {
  const { data, error } = await supabase.from('materiels').select('*').order('nom');
  if (error) {
    console.error('fetchMateriels:', error);
    return [];
  }
  return (data ?? []).map(mapMateriel);
}

export async function createMateriel(m: Partial<Materiel>): Promise<Materiel | null> {
  const { data, error } = await supabase
    .from('materiels')
    .insert({
      code: m.code || null,
      nom: m.nom,
      equipe_nom: m.equipeNom || null,
      quantite: m.quantite ?? 1,
      etat: m.etat ?? 'bon',
      notes: m.notes ?? '',
    })
    .select()
    .single();
  if (error) {
    console.error('createMateriel:', error);
    return null;
  }
  return mapMateriel(data);
}

export async function updateMateriel(id: string, m: Partial<Materiel>): Promise<void> {
  const { error } = await supabase
    .from('materiels')
    .update({
      code: m.code,
      nom: m.nom,
      equipe_nom: m.equipeNom || null,
      quantite: m.quantite,
      etat: m.etat,
      notes: m.notes,
    })
    .eq('id', id);
  if (error) console.error('updateMateriel:', error);
}

export async function deleteMateriel(id: string): Promise<void> {
  const { error } = await supabase.from('materiels').delete().eq('id', id);
  if (error) console.error('deleteMateriel:', error);
}

function mapScan(row: any): ScanRecord {
  return {
    id: row.id,
    zone: row.zone ?? '',
    stt: row.stt ?? '',
    result: row.result === 'SCANNE' ? 'SCANNE' : 'NON SCANE',
    scanTime: row.scan_time ?? undefined,
    portId: row.port_id ?? undefined,
    onuId: row.onu_id ?? undefined,
    onuName: row.onu_name ?? undefined,
    softwareVersion: row.software_version ?? undefined,
    snMac: row.sn_mac ?? undefined,
    timeAddedToNms: row.time_added_to_nms ?? undefined,
    rxPower: row.rx_power !== null && row.rx_power !== undefined ? Number(row.rx_power) : null,
    ranging: row.ranging !== null && row.ranging !== undefined ? Number(row.ranging) : null,
    remarque: row.remarque ?? '',
    changeType: row.change_type === 'new' ? 'new' : row.change_type === 'existing' ? 'existing' : undefined,
    importedAt: row.imported_at,
  };
}

// ─── SCANS RÉSEAU (ONU/OLT) ────────────────────────────────────────────────────

// Supabase limite les SELECT à 1000 lignes par requête : on paginate.
export async function fetchScans(): Promise<ScanRecord[]> {
  const all: ScanRecord[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('scan_results')
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('fetchScans:', error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data.map(mapScan));
    if (data.length < PAGE) break;
  }
  return all;
}

// Insertion en lots (le fichier source peut contenir 10 000+ lignes)
export async function bulkInsertScans(rows: Partial<ScanRecord>[]): Promise<number> {
  const CHUNK = 500;
  let inserted = 0;
  let lastError: string | null = null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      zone: r.zone,
      stt: r.stt,
      result: r.result ?? 'NON SCANE',
      scan_time: r.scanTime || null,
      port_id: r.portId ?? null,
      onu_id: r.onuId ?? null,
      onu_name: r.onuName ?? null,
      software_version: r.softwareVersion ?? null,
      sn_mac: r.snMac ?? null,
      time_added_to_nms: r.timeAddedToNms || null,
      rx_power: r.rxPower ?? null,
      ranging: r.ranging ?? null,
      remarque: r.remarque ?? null,
      change_type: r.changeType ?? null,
    }));
    const { error, count } = await supabase.from('scan_results').insert(chunk, { count: 'exact' });
    if (error) {
      console.error('bulkInsertScans chunk:', error);
      lastError = error.message;
      continue;
    }
    inserted += count ?? chunk.length;
  }
  // Si RIEN n'a été inséré alors qu'on avait des lignes à importer, c'est un échec réel
  // (ex: colonne manquante côté base) — on le signale au lieu de laisser croire à un succès.
  if (inserted === 0 && rows.length > 0) {
    throw new Error(lastError ?? "Aucune ligne n'a pu être importée (vérifiez le schéma de la table scan_results)");
  }
  return inserted;
}

export async function clearScans(): Promise<void> {
  const { error } = await supabase.from('scan_results').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) console.error('clearScans:', error);
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await supabase.from('scan_results').delete().eq('id', id);
  if (error) console.error('deleteScan:', error);
}

// ─── HISTORIQUE DES IMPORTS DE SCAN (suivi semaine par semaine) ────────────────

export interface ScanImportSnapshot {
  id: string;
  importedAt: string;
  total: number;
  scanne: number;
  nonScanne: number;
  excellent: number;
  moyen: number;
  degrade: number;
  pctScanne: number;
  diff?: {
    nouveaux: number;
    nouveauxScanne: number;
    nouveauxNonScanne: number;
    disparus: number;
    passesNonScanne: number;
    passesScanne: number;
    signalDegrade: number;
    signalAmeliore: number;
  } | null;
}

function mapScanSnapshot(row: any): ScanImportSnapshot {
  return {
    id: row.id,
    importedAt: row.imported_at,
    total: row.total ?? 0,
    scanne: row.scanne ?? 0,
    nonScanne: row.non_scanne ?? 0,
    excellent: row.excellent ?? 0,
    moyen: row.moyen ?? 0,
    degrade: row.degrade ?? 0,
    pctScanne: row.pct_scanne != null ? Number(row.pct_scanne) : 0,
    diff:
      row.diff_nouveaux != null
        ? {
            nouveaux: row.diff_nouveaux ?? 0,
            nouveauxScanne: row.diff_nouveaux_scanne ?? 0,
            nouveauxNonScanne: row.diff_nouveaux_non_scanne ?? 0,
            disparus: row.diff_disparus ?? 0,
            passesNonScanne: row.diff_passes_non_scanne ?? 0,
            passesScanne: row.diff_passes_scanne ?? 0,
            signalDegrade: row.diff_signal_degrade ?? 0,
            signalAmeliore: row.diff_signal_ameliore ?? 0,
          }
        : null,
  };
}

export async function fetchScanImportHistory(): Promise<ScanImportSnapshot[]> {
  const { data, error } = await supabase.from('scan_import_history').select('*').order('imported_at', { ascending: false }).limit(20);
  if (error) {
    console.error('fetchScanImportHistory:', error);
    return [];
  }
  return (data ?? []).map(mapScanSnapshot);
}

export async function insertScanImportSnapshot(stats: {
  total: number;
  scanne: number;
  nonScanne: number;
  excellent: number;
  moyen: number;
  degrade: number;
  resilies?: number;
  diff?: {
    nouveaux: number;
    nouveauxScanne: number;
    nouveauxNonScanne: number;
    disparus: number;
    passesNonScanne: number;
    passesScanne: number;
    signalDegrade: number;
    signalAmeliore: number;
  } | null;
}): Promise<void> {
  const denom = stats.total - (stats.resilies ?? 0);
  const pctScanne = denom ? Math.round((stats.scanne / denom) * 1000) / 10 : 0;

  const basePayload = {
    total: stats.total,
    scanne: stats.scanne,
    non_scanne: stats.nonScanne,
    excellent: stats.excellent,
    moyen: stats.moyen,
    degrade: stats.degrade,
    pct_scanne: pctScanne,
  };
  const fullPayload = {
    ...basePayload,
    diff_nouveaux: stats.diff?.nouveaux ?? null,
    diff_nouveaux_scanne: stats.diff?.nouveauxScanne ?? null,
    diff_nouveaux_non_scanne: stats.diff?.nouveauxNonScanne ?? null,
    diff_disparus: stats.diff?.disparus ?? null,
    diff_passes_non_scanne: stats.diff?.passesNonScanne ?? null,
    diff_passes_scanne: stats.diff?.passesScanne ?? null,
    diff_signal_degrade: stats.diff?.signalDegrade ?? null,
    diff_signal_ameliore: stats.diff?.signalAmeliore ?? null,
  };

  // 1ère tentative : payload complet (avec les colonnes diff_*)
  const { error } = await supabase.from('scan_import_history').insert(fullPayload);
  if (error) {
    // Colonnes diff_* probablement absentes côté base (migration pas encore exécutée) —
    // on réessaie avec les colonnes de base uniquement, sans bloquer l'import.
    console.warn('insertScanImportSnapshot: colonnes diff_* indisponibles, repli sur le payload de base', error.message);
    const { error: error2 } = await supabase.from('scan_import_history').insert(basePayload);
    if (error2) console.error('insertScanImportSnapshot (repli):', error2);
  }
}

export async function deleteScanImportSnapshot(id: string): Promise<void> {
  const { error } = await supabase.from('scan_import_history').delete().eq('id', id);
  if (error) console.error('deleteScanImportSnapshot:', error);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function loginWithCredentials(name: string, password: string): Promise<User | null> {
  // Lookup profile by name + password (simple approach, no Supabase Auth)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, team_id, password_hash')
    .ilike('name', name.trim())
    .single();
  if (error || !data) return null;

  // Simple password check (stored as plain text for now; upgrade to bcrypt via Edge Function later)
  if (data.password_hash && data.password_hash !== password) return null;

  // Map to app User
  let teamName: string | null = null;
  if (data.team_id) {
    const { data: team } = await supabase.from('teams').select('name').eq('id', data.team_id).single();
    teamName = team?.name ?? null;
  }

  const COLORS: Record<string, string> = {
    admin: '#6A1B9A',
    superviseur: '#1565C0',
    chef: '#2E7D32',
  };
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    teamId: data.team_id ?? null,
    teamName: teamName,
    avatar: data.name[0].toUpperCase(),
    color: COLORS[data.role] ?? '#546E7A',
  };
}
