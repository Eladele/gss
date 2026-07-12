import { supabase } from './supabase';
import type { Situation, Equipe, ImportRecord, User } from '@/types';

// ─── SITUATIONS ──────────────────────────────────────────────────────────────

export async function fetchSituations(): Promise<Situation[]> {
  const { data, error } = await supabase
    .from('situations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchSituations:', error); return []; }
  return (data ?? []).map(mapSituation);
}

export async function upsertSituation(sit: Situation): Promise<void> {
  const { error } = await supabase.from('situations').upsert(toDbSituation(sit));
  if (error) console.error('upsertSituation:', error);
}

export async function updateSituationStatus(
  fgp: string,
  status: Situation['status'],
  comment = ''
): Promise<void> {
  const { error } = await supabase
    .from('situations')
    .update({ status, comment, updated_at: new Date().toISOString() })
    .eq('fgp', fgp);
  if (error) console.error('updateSituationStatus:', error);
}

export async function insertSituationsBulk(rows: Situation[]): Promise<void> {
  const { error } = await supabase
    .from('situations')
    .upsert(rows.map(toDbSituation), { onConflict: 'fgp' });
  if (error) console.error('insertSituationsBulk:', error);
}

// ─── EQUIPES ─────────────────────────────────────────────────────────────────

export async function fetchEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name');
  if (error) { console.error('fetchEquipes:', error); return []; }
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
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        name: equipe.leader,
        role: 'chef',
        team_id: newTeam.id,
        password_hash: 'chef2026' // default password
      });
    if (profileError) {
      console.error('createEquipe profile error:', profileError);
    }
  }

  return mapEquipe(newTeam);
}

// ─── IMPORT HISTORY ──────────────────────────────────────────────────────────

export async function fetchImportHistory(): Promise<ImportRecord[]> {
  const { data, error } = await supabase
    .from('import_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('fetchImportHistory:', error); return []; }
  return (data ?? []).map(mapImportRecord);
}

export async function insertImportRecord(record: Omit<ImportRecord, 'id'>): Promise<void> {
  const { error } = await supabase.from('import_history').insert({
    file_name: record.fileName,
    import_date: record.date,
    row_count: record.count,
    imported_by: record.by,
  });
  if (error) console.error('insertImportRecord:', error);
}

// ─── MAPPERS ─────────────────────────────────────────────────────────────────

function mapSituation(row: any): Situation {
  return {
    id:        row.id,
    fgp:       row.fgp,
    type:      row.type,
    zone:      row.zone,
    equipe:    row.equipe,
    motif:     row.motif ?? '',
    dateDepo:  row.date_depo ?? '',
    dateClt:   row.date_clt ?? '',
    delai:     row.delai ?? 0,
    status:    row.status,
    comment:   row.comment ?? '',
    updatedAt: row.updated_at,
    isUrgent:  row.is_urgent ?? false,
  };
}

function toDbSituation(s: Situation) {
  return {
    id:         s.id,
    fgp:        s.fgp,
    type:       s.type,
    zone:       s.zone,
    equipe:     s.equipe,
    motif:      s.motif,
    date_depo:  s.dateDepo,
    date_clt:   s.dateClt,
    delai:      s.delai,
    status:     s.status,
    comment:    s.comment,
    is_urgent:  s.isUrgent ?? false,
    updated_at: s.updatedAt ?? new Date().toISOString(),
  };
}

function mapEquipe(row: any): Equipe {
  return {
    id:     row.id,
    name:   row.name,
    leader: row.leader_name ?? row.name,
    zones:  row.zones ?? [],
    color:  row.color ?? '#1565C0',
    elements: row.elements ?? [],
  };
}

function mapImportRecord(row: any): ImportRecord {
  return {
    id:       row.id,
    fileName: row.file_name,
    date:     row.import_date ?? row.created_at,
    count:    row.row_count,
    by:       row.imported_by,
  };
}

// ─── ZONES (stored in teams table as array) ───────────────────────────────────

export async function addZoneToTeam(teamId: string, zone: string): Promise<void> {
  // Fetch current zones then append
  const { data, error: fetchErr } = await supabase
    .from('teams')
    .select('zones')
    .eq('id', teamId)
    .single();
  if (fetchErr) { console.error('addZoneToTeam fetch:', fetchErr); return; }
  const zones: string[] = data?.zones ?? [];
  if (zones.includes(zone)) return; // already there
  const { error } = await supabase
    .from('teams')
    .update({ zones: [...zones, zone] })
    .eq('id', teamId);
  if (error) console.error('addZoneToTeam update:', error);
}

export async function removeZoneFromTeam(teamId: string, zone: string): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('teams')
    .select('zones')
    .eq('id', teamId)
    .single();
  if (fetchErr) { console.error('removeZoneFromTeam fetch:', fetchErr); return; }
  const zones: string[] = (data?.zones ?? []).filter((z: string) => z !== zone);
  const { error } = await supabase
    .from('teams')
    .update({ zones })
    .eq('id', teamId);
  if (error) console.error('removeZoneFromTeam update:', error);
}

export async function reassignSituationEquipe(fgp: string, equipe: string): Promise<void> {
  const { error } = await supabase
    .from('situations')
    .update({ equipe, updated_at: new Date().toISOString() })
    .eq('fgp', fgp);
  if (error) console.error('reassignSituationEquipe:', error);
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
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', data.team_id)
      .single();
    teamName = team?.name ?? null;
  }

  const COLORS: Record<string, string> = {
    admin: '#6A1B9A', superviseur: '#1565C0', chef: '#2E7D32',
  };
  return {
    id:       data.id,
    name:     data.name,
    role:     data.role,
    teamId:   data.team_id ?? null,
    teamName: teamName,
    avatar:   data.name[0].toUpperCase(),
    color:    COLORS[data.role] ?? '#546E7A',
  };
}
