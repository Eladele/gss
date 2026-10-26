import { supabase } from './supabase';
import { invalidateTeams, normNom, teamIdFor, teamIdsFor, upsertLignes } from './refs';
import type { Situation, Equipe, ImportRecord, User, Employee, LeaveRecord, Vehicle, Materiel, ScanRecord, Loan, Chantier, NoeudReseau } from '@/types';

// ─── RÉFÉRENCES ──────────────────────────────────────────────────────────────
// La base relie chaque enregistrement à son équipe (team_id) et à la personne qui a agi
// (profiles.id) ; l'application continue de manipuler des noms. Les noms sont lus par
// jointure (une seule source), et un nom saisi est converti en identifiant à l'écriture.

const EQUIPE = 'team:teams!team_id(name)';

/** { team_id } pour un nom d'équipe ; {} si le nom n'est pas fourni (champ inchangé) */
async function colEquipe(nom: string | null | undefined): Promise<{ team_id?: string | null }> {
  if (nom === undefined) return {};
  return { team_id: await teamIdFor(nom) };
}

// ─── SITUATIONS ──────────────────────────────────────────────────────────────
// Lecture : vue situations_detail (situation + ligne FGP + équipe + noms).
// Écriture : table situations (ligne_id, team_id, …).

const DEDUP = 'date_message,type,ligne_id,service_destination,date_depo,motif';

export async function fetchSituations(): Promise<Situation[]> {
  // Supabase limite les SELECT à 1000 lignes par requête par défaut — sans pagination,
  // au-delà de 1000 situations, le refresh de la page en perdait silencieusement une
  // partie (ex: 1552 juste après import, mais seulement 1000 après actualisation).
  const all: Situation[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('situations_detail')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('fetchSituations:', error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data.map(mapSituation));
    if (data.length < PAGE) break;
  }
  return all;
}

export async function upsertSituation(sit: Situation): Promise<void> {
  const [row] = await toDbSituations([sit]);
  const { error } = await supabase.from('situations').upsert(row, { onConflict: DEDUP });
  if (error) console.error('upsertSituation:', error);
}

export async function updateSituationStatus(
  id: string,
  status: Situation['status'],
  comment = '',
  dateClt?: string,
  extra?: {
    poteau?: number;
    equipe?: string;
    motif?: string;
    /** profil qui clôture (id) — le nom affiché vient de profiles */
    closedById?: string | null;
  },
): Promise<void> {
  // Rx, ranging et statut réseau ne sont plus enregistrés ici : ils viennent du fichier de scan
  const now = new Date().toISOString();
  const payload: Record<string, any> = { status, comment, updated_at: now };
  if (dateClt) payload.date_mise_en_service = dateClt;
  if (extra) {
    if (extra.poteau !== undefined) payload.poteau = extra.poteau;
    if (extra.equipe !== undefined) Object.assign(payload, await colEquipe(extra.equipe));
    if (extra.motif !== undefined) payload.motif = extra.motif;
    if (extra.closedById) {
      payload.traite_par = extra.closedById;
      payload.traite_le = now;
    }
  }
  const { error } = await supabase.from('situations').update(payload).eq('id', id);
  if (error) {
    console.error('updateSituationStatus:', error);
    throw new Error(error.message);
  }
}

export async function insertSituationsBulk(rows: Situation[]): Promise<void> {
  const CHUNK = 500;
  let insertedAny = false;
  let lastError: string | null = null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    // `id` n'est PAS envoyé ici : les id générés côté app (ex: "imp-546-...") ne sont pas
    // des UUID valides pour la colonne `id` de la table, ce qui faisait échouer tout le lot
    // avec "invalid input syntax for type uuid". On laisse Postgres générer le vrai UUID ;
    // le upsert se base sur la clé composite (onConflict, cf. contrainte situations_dedup_key
    // en base) pour la déduplication, pas sur `id`.
    let chunk: Record<string, unknown>[];
    try {
      chunk = await toDbSituations(rows.slice(i, i + CHUNK));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    // deux lignes du même lot avec la même clé : la dernière l'emporte (sinon tout le lot échoue)
    const parCle = new Map<string, Record<string, unknown>>();
    chunk.forEach((r, k) => {
      const cle = DEDUP.split(',').map((c) => r[c]);
      parCle.set(cle.some((v) => v == null) ? `#${k}` : JSON.stringify(cle), r);
    });
    chunk = [...parCle.values()];
    const { error } = await supabase.from('situations').upsert(chunk, { onConflict: DEDUP });
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

export async function deleteSituation(id: string): Promise<void> {
  const { error } = await supabase.from('situations').delete().eq('id', id);
  if (error) {
    console.error('deleteSituation:', error);
    throw new Error(error.message);
  }
}

// ─── EQUIPES ─────────────────────────────────────────────────────────────────

// Chef = employé (teams.chef_id) ; à défaut, le compte « chef » rattaché à l'équipe.
// Membres = employés de l'équipe (employees.team_id).
const EQUIPE_SELECT = '*, chef:employees!chef_id(name), membres:employees!team_id(name), comptes:profiles(name, role)';

/** Chef d'équipe : employé de ce nom, créé (poste « Chef d'équipe ») s'il n'existe pas */
async function chefId(nom: string | undefined, teamId: string): Promise<string | null> {
  const n = normNom(nom);
  if (!n) return null;
  const { data } = await supabase.from('employees').select('id, name, team_id');
  const trouve = (data ?? []).find((e) => normNom(e.name as string) === n);
  if (trouve) {
    if (!trouve.team_id) await supabase.from('employees').update({ team_id: teamId }).eq('id', trouve.id);
    return trouve.id as string;
  }
  const ins = await supabase.from('employees').insert({ name: (nom ?? '').trim(), poste: "Chef d'équipe", team_id: teamId, actif: true }).select('id').single();
  return (ins.data?.id as string) ?? null;
}

export async function fetchEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase.from('teams').select(EQUIPE_SELECT).order('name');
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
      color: equipe.color,
      zones: equipe.zones ?? [],
      ...(equipe.ville ? { ville: equipe.ville } : {}),
    })
    .select()
    .single();

  if (error) {
    console.error('createEquipe team error:', error);
    return null;
  }
  invalidateTeams();
  const chef = await chefId(equipe.leader, newTeam.id);
  if (chef) await supabase.from('teams').update({ chef_id: chef }).eq('id', newTeam.id);

  // Create profile for the leader via Edge Function (service_role) —
  // the client no longer inserts into `profiles` directly, and each leader
  // gets a random temporary password instead of the old fixed 'chef2026'.
  if (equipe.leader) {
    const { data: fnData, error: profileError } = await supabase.functions.invoke('create-team-leader', {
      body: { name: equipe.leader, team_id: newTeam.id },
    });
    if (profileError) {
      console.error('createEquipe profile error:', profileError);
    } else if (fnData?.tempPassword) {
      // eslint-disable-next-line no-alert
      alert(`Compte créé pour ${equipe.leader}.\nMot de passe temporaire : ${fnData.tempPassword}\n(à communiquer une seule fois — non récupérable ensuite)`);
    }
  }

  const { data: complet } = await supabase.from('teams').select(EQUIPE_SELECT).eq('id', newTeam.id).single();
  return mapEquipe(complet ?? newTeam);
}

export async function updateEquipe(id: string, patch: Partial<Equipe>): Promise<void> {
  const payload: Record<string, any> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.ville !== undefined) payload.ville = patch.ville;
  // les membres se gèrent depuis la fiche de chaque employé (employees.team_id)
  if (patch.leader !== undefined) payload.chef_id = await chefId(patch.leader, id);
  const { error } = await supabase.from('teams').update(payload).eq('id', id);
  if (error) console.error('updateEquipe:', error);
  invalidateTeams();
}

export async function deleteEquipe(id: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) console.error('deleteEquipe:', error);
  invalidateTeams();
}

// ─── IMPORT HISTORY ──────────────────────────────────────────────────────────

export async function fetchImportHistory(): Promise<ImportRecord[]> {
  const { data, error } = await supabase
    .from('import_history')
    .select('*, auteur:profiles!importe_par(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('fetchImportHistory:', error);
    return [];
  }
  return (data ?? []).map(mapImportRecord);
}

export async function insertImportRecord(record: Omit<ImportRecord, 'id'> & { byId?: string | null }): Promise<ImportRecord | null> {
  const { data, error } = await supabase
    .from('import_history')
    .insert({
      file_name: record.fileName,
      import_date: record.date,
      row_count: record.count,
      importe_par: record.byId ?? null,
    })
    .select('*, auteur:profiles!importe_par(name)')
    .single();
  if (error) {
    console.error('insertImportRecord:', error);
    throw new Error(error.message);
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
    fgp: row.fgp ?? '',
    type: row.type,
    zone: row.zone ?? '',
    equipe: row.equipe ?? '',
    motif: row.motif ?? '',
    dateDepo: row.date_depo ?? '',
    dateClt: row.date_mise_en_service ?? '',
    dateMessage: row.date_message ?? '',
    serviceDestination: row.service_destination ?? '',
    delai: row.delai ?? 0,
    status: row.status,
    comment: row.comment ?? '',
    updatedAt: row.updated_at,
    isUrgent: row.is_urgent ?? false,
    nature: row.nature ?? 'installation',
   conformite: row.conformite ?? undefined,
    importId: row.import_id ?? undefined,
    poteau: row.poteau != null ? Number(row.poteau) : 0,
    closedBy: row.traite_par_nom ?? undefined,
  };
}

/** Situations de l'application → lignes de la table : la ligne FGP (avec sa zone) est
 *  créée si besoin, le nom d'équipe devient team_id. */
async function toDbSituations(list: Situation[]): Promise<Record<string, unknown>[]> {
  const [lignes, equipes] = await Promise.all([
    upsertLignes(list.map((s) => ({ fgp: s.fgp, zone: s.zone }))),
    teamIdsFor(list.map((s) => s.equipe)),
  ]);
  return list.map((s) => ({
    ligne_id: lignes.get((s.fgp ?? '').trim()) ?? null,
    team_id: equipes.get(s.equipe ?? '') ?? null,
    type: s.type,
    motif: s.motif,
    date_depo: s.dateDepo || null,
    date_mise_en_service: s.dateClt || null,
    date_message: s.dateMessage || null,
    service_destination: s.serviceDestination || null,
    delai: s.delai,
    status: s.status,
    comment: s.comment,
    is_urgent: s.isUrgent ?? false,
    updated_at: s.updatedAt ?? new Date().toISOString(),
    nature: s.nature ?? 'installation',
   conformite: s.conformite ?? null,
    import_id: s.importId ?? null,
    poteau: s.poteau ?? 0,
  }));
}

// Les équipes en base ont parfois des codes bruts (NKTT, NDB...) au lieu du vrai nom
// de ville — on normalise ici pour que les 4 vraies villes soient toujours reconnues.
function normalizeVille(raw?: string | null): string {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return 'Nouakchott';
  if (v.includes('nktt') || v.includes('nouakchott') || v === 'nkc') return 'Nouakchott';
  if (v.includes('ndb') || v.includes('nouadhibou')) return 'Nouadhibou';
  if (v.includes('kaedi') || v.includes('kaédi') || v.includes('keadi')) return 'Kaédi';
  if (v.includes('rosso')) return 'Rosso';
  return raw!; // valeur déjà correcte / inconnue, on la laisse telle quelle
}

function mapEquipe(row: any): Equipe {
  const compteChef = ((row.comptes ?? []) as { name: string; role: string }[]).find((p) => p.role === 'chef');
  return {
    id: row.id,
    name: row.name,
    leader: row.chef?.name ?? compteChef?.name ?? '',
    chefId: row.chef_id ?? null,
    zones: row.zones ?? [],
    color: row.color ?? '#1565C0',
    elements: ((row.membres ?? []) as { name: string }[]).map((m) => m.name),
    ville: normalizeVille(row.ville) as Equipe['ville'],
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
    equipeNom: row.team?.name ?? '',
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
    equipeNom: row.team?.name ?? '',
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
    equipeNom: row.team?.name ?? '',
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
    createdBy: row.auteur?.name ?? '',
    createdAt: row.created_at,
  };
}

function mapImportRecord(row: any): ImportRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    date: row.import_date ?? row.created_at,
    count: row.row_count,
    by: row.auteur?.name ?? '',
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

export async function reassignSituationEquipe(id: string, equipe: string): Promise<void> {
  const { error } = await supabase.from('situations').update({ ...(await colEquipe(equipe)), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('reassignSituationEquipe:', error);
}

// ─── VILLE (équipe) ────────────────────────────────────────────────────────────

export async function setTeamVille(teamId: string, ville: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ ville }).eq('id', teamId);
  if (error) console.error('setTeamVille:', error);
}


export async function fetchDirectorSignature(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'director_signature')
    .maybeSingle();
  if (error) {
    console.error('fetchDirectorSignature error:', error);
    return null;
  }
  return data?.value ?? null;
}

export async function saveDirectorSignature(base64: string | null): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'director_signature', value: base64 }, { onConflict: 'key' });
  if (error) throw error;
}

// ─── EMPLOYÉS ──────────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase.from('employees').select(`*, ${EQUIPE}`).order('name');
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
      ...(await colEquipe(emp.equipeNom)),
      date_embauche: emp.dateEmbauche || null,
      actif: emp.actif ?? true,
    })
    .select(`*, ${EQUIPE}`)
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
      ...(await colEquipe(emp.equipeNom)),
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

// ─── PRÊTS ─────────────────────────────────────────────────────────────────────

function mapLoan(row: any): Loan {
  return {
    id: row.id,
    employeeId: row.employee_id,
    montantTotal: Number(row.montant_total),
    mensualite: Number(row.mensualite),
    dateDebut: row.date_debut,
    dureeMois: row.duree_mois != null ? Number(row.duree_mois) : undefined,
    reste: Number(row.reste),
    banqueCaisse: row.banque_caisse ?? undefined,
    statut: row.statut,
    createdAt: row.created_at,
  };
}

export async function fetchLoans(): Promise<Loan[]> {
  const { data, error } = await supabase.from('loans').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('fetchLoans:', error);
    return [];
  }
  return (data ?? []).map(mapLoan);
}

export async function createLoan(loan: {
  employeeId: string;
  montantTotal: number;
  mensualite: number;
  dateDebut: string;
  dureeMois?: number;
  banqueCaisse?: string;
}): Promise<Loan | null> {
  const { data, error } = await supabase
    .from('loans')
    .insert({
      employee_id: loan.employeeId,
      montant_total: loan.montantTotal,
      mensualite: loan.mensualite,
      date_debut: loan.dateDebut,
      duree_mois: loan.dureeMois ?? null,
      reste: loan.montantTotal,
      banque_caisse: loan.banqueCaisse ?? null,
      statut: 'actif',
    })
    .select()
    .single();
  if (error) {
    console.error('createLoan:', error);
    return null;
  }
  return mapLoan(data);
}

export async function updateLoan(
  id: string,
  patch: Partial<{
    montantTotal: number;
    mensualite: number;
    dateDebut: string;
    dureeMois?: number;
    banqueCaisse?: string;
    reste: number;
    statut: 'actif' | 'solde';
  }>,
): Promise<void> {
  const payload: Record<string, any> = {};
  if (patch.montantTotal !== undefined) payload.montant_total = patch.montantTotal;
  if (patch.mensualite !== undefined) payload.mensualite = patch.mensualite;
  if (patch.dateDebut !== undefined) payload.date_debut = patch.dateDebut;
  if (patch.dureeMois !== undefined) payload.duree_mois = patch.dureeMois ?? null;
  if (patch.banqueCaisse !== undefined) payload.banque_caisse = patch.banqueCaisse ?? null;
  if (patch.reste !== undefined) payload.reste = patch.reste;
  if (patch.statut !== undefined) payload.statut = patch.statut;
  const { error } = await supabase.from('loans').update(payload).eq('id', id);
  if (error) {
    console.error('updateLoan:', error);
    throw new Error(error.message);
  }
}

export async function deleteLoan(id: string): Promise<void> {
  // loan_payments est supprimé automatiquement (ON DELETE CASCADE côté base).
  const { error } = await supabase.from('loans').delete().eq('id', id);
  if (error) {
    console.error('deleteLoan:', error);
    throw new Error(error.message);
  }
}

// Enregistre la mensualité du mois (idempotent — la contrainte UNIQUE(loan_id, month)
// empêche de déduire deux fois la même mensualité si on clique par erreur deux fois),
// puis met à jour le reste dû (et passe le prêt en "solde" s'il atteint 0).
export async function recordLoanPayment(loanId: string, month: string, montant: number, newReste: number): Promise<void> {
  const { error: payErr } = await supabase.from('loan_payments').insert({ loan_id: loanId, month, montant });
  if (payErr) {
    console.error('recordLoanPayment (insert):', payErr);
    throw new Error(payErr.message);
  }
  const { error: updErr } = await supabase
    .from('loans')
    .update({ reste: newReste, statut: newReste <= 0 ? 'solde' : 'actif' })
    .eq('id', loanId);
  if (updErr) {
    console.error('recordLoanPayment (update reste):', updErr);
    throw new Error(updErr.message);
  }
}

export async function fetchLoanPayments(): Promise<{ id: string; loanId: string; month: string; montant: number }[]> {
  const { data, error } = await supabase.from('loan_payments').select('*');
  if (error) {
    console.error('fetchLoanPayments:', error);
    return [];
  }
  return (data ?? []).map((r: any) => ({ id: r.id, loanId: r.loan_id, month: r.month, montant: Number(r.montant) }));
}

// ─── CHANTIERS (déploiement) ───────────────────────────────────────────────────

function mapChantier(row: any): Chantier {
  return {
    id: row.id,
    nom: row.nom,
    zone: row.zone ?? undefined,
    ville: row.ville ?? undefined,
    equipeNom: row.team?.name ?? undefined,
    typeDeploiement: row.type_deploiement === 'souterrain' ? 'souterrain' : 'aerien',
    statut: row.statut,
    dateDebut: row.date_debut ?? undefined,
    dateFinPrevue: row.date_fin_prevue ?? undefined,
    poteauxPrevus: row.poteaux_prevus ?? 0,
    poteauxPoses: row.poteaux_poses ?? 0,
    tranchéePrevueM: row.tranchee_prevue_m != null ? Number(row.tranchee_prevue_m) : 0,
    tranchéePoseeM: row.tranchee_posee_m != null ? Number(row.tranchee_posee_m) : 0,
    blocagePrevu: row.blocage_prevu ?? 0,
    blocageFait: row.blocage_fait ?? 0,
    ouverturePrevue: row.ouverture_prevue ?? 0,
    ouvertureFaite: row.ouverture_faite ?? 0,
    closerMpoPrevu: row.closer_mpo_prevu ?? 0,
    closerMpoFait: row.closer_mpo_fait ?? 0,
    closerDisPrevu: row.closer_dis_prevu ?? 0,
    closerDisFait: row.closer_dis_fait ?? 0,
    xBoxPrevus: row.x_box_prevus ?? 0,
    xBoxPoses: row.x_box_poses ?? 0,
    hubBoxPrevus: row.hub_box_prevus ?? 0,
    hubBoxPoses: row.hub_box_poses ?? 0,
    subBoxPrevus: row.sub_box_prevus ?? 0,
    subBoxPoses: row.sub_box_poses ?? 0,
    endBoxPrevus: row.end_box_prevus ?? 0,
    endBoxPoses: row.end_box_poses ?? 0,
    cableMpoPrevuM: row.cable_mpo_prevu_m != null ? Number(row.cable_mpo_prevu_m) : 0,
    cableMpoPoseM: row.cable_mpo_pose_m != null ? Number(row.cable_mpo_pose_m) : 0,
    cableDistributionPrevuM: row.cable_distribution_prevu_m != null ? Number(row.cable_distribution_prevu_m) : 0,
    cableDistributionPoseM: row.cable_distribution_pose_m != null ? Number(row.cable_distribution_pose_m) : 0,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

async function toDbChantier(c: Partial<Chantier>): Promise<Record<string, any>> {
  const payload: Record<string, any> = {};
  if (c.nom !== undefined) payload.nom = c.nom;
  if (c.zone !== undefined) payload.zone = c.zone || null;
  if (c.ville !== undefined) payload.ville = c.ville || null;
  if (c.equipeNom !== undefined) Object.assign(payload, await colEquipe(c.equipeNom));
  if (c.typeDeploiement !== undefined) payload.type_deploiement = c.typeDeploiement;
  if (c.statut !== undefined) payload.statut = c.statut;
  if (c.dateDebut !== undefined) payload.date_debut = c.dateDebut || null;
  if (c.dateFinPrevue !== undefined) payload.date_fin_prevue = c.dateFinPrevue || null;
  if (c.poteauxPrevus !== undefined) payload.poteaux_prevus = c.poteauxPrevus;
  if (c.poteauxPoses !== undefined) payload.poteaux_poses = c.poteauxPoses;
  if (c.tranchéePrevueM !== undefined) payload.tranchee_prevue_m = c.tranchéePrevueM;
  if (c.tranchéePoseeM !== undefined) payload.tranchee_posee_m = c.tranchéePoseeM;
  if (c.blocagePrevu !== undefined) payload.blocage_prevu = c.blocagePrevu;
  if (c.blocageFait !== undefined) payload.blocage_fait = c.blocageFait;
  if (c.ouverturePrevue !== undefined) payload.ouverture_prevue = c.ouverturePrevue;
  if (c.ouvertureFaite !== undefined) payload.ouverture_faite = c.ouvertureFaite;
  if (c.closerMpoPrevu !== undefined) payload.closer_mpo_prevu = c.closerMpoPrevu;
  if (c.closerMpoFait !== undefined) payload.closer_mpo_fait = c.closerMpoFait;
  if (c.closerDisPrevu !== undefined) payload.closer_dis_prevu = c.closerDisPrevu;
  if (c.closerDisFait !== undefined) payload.closer_dis_fait = c.closerDisFait;
  if (c.xBoxPrevus !== undefined) payload.x_box_prevus = c.xBoxPrevus;
  if (c.xBoxPoses !== undefined) payload.x_box_poses = c.xBoxPoses;
  if (c.hubBoxPrevus !== undefined) payload.hub_box_prevus = c.hubBoxPrevus;
  if (c.hubBoxPoses !== undefined) payload.hub_box_poses = c.hubBoxPoses;
  if (c.subBoxPrevus !== undefined) payload.sub_box_prevus = c.subBoxPrevus;
  if (c.subBoxPoses !== undefined) payload.sub_box_poses = c.subBoxPoses;
  if (c.endBoxPrevus !== undefined) payload.end_box_prevus = c.endBoxPrevus;
  if (c.endBoxPoses !== undefined) payload.end_box_poses = c.endBoxPoses;
  if (c.cableMpoPrevuM !== undefined) payload.cable_mpo_prevu_m = c.cableMpoPrevuM;
  if (c.cableMpoPoseM !== undefined) payload.cable_mpo_pose_m = c.cableMpoPoseM;
  if (c.cableDistributionPrevuM !== undefined) payload.cable_distribution_prevu_m = c.cableDistributionPrevuM;
  if (c.cableDistributionPoseM !== undefined) payload.cable_distribution_pose_m = c.cableDistributionPoseM;
  if (c.notes !== undefined) payload.notes = c.notes || null;
  payload.updated_at = new Date().toISOString();
  return payload;
}

export async function fetchChantiers(): Promise<Chantier[]> {
  const { data, error } = await supabase.from('chantiers').select(`*, ${EQUIPE}`).order('created_at', { ascending: false });
  if (error) {
    console.error('fetchChantiers:', error);
    return [];
  }
  return (data ?? []).map(mapChantier);
}

export async function createChantier(c: Partial<Chantier>): Promise<Chantier | null> {
  const { data, error } = await supabase
    .from('chantiers')
    .insert(await toDbChantier(c))
    .select(`*, ${EQUIPE}`)
    .single();
  if (error) {
    console.error('createChantier:', error);
    return null;
  }
  return mapChantier(data);
}

export async function updateChantier(id: string, c: Partial<Chantier>): Promise<void> {
  const { error } = await supabase.from('chantiers').update(await toDbChantier(c)).eq('id', id);
  if (error) {
    console.error('updateChantier:', error);
    throw new Error(error.message);
  }
}

export async function deleteChantier(id: string): Promise<void> {
  const { error } = await supabase.from('chantiers').delete().eq('id', id);
  if (error) {
    console.error('deleteChantier:', error);
    throw new Error(error.message);
  }
}

// ─── ARBORESCENCE RÉSEAU (OLT/Closures/X-BOX/HUB-BOX/SUB-BOX/END-BOX) ──────────

function mapNoeud(row: any): NoeudReseau {
  return {
    id: row.id,
    zone: row.zone,
    type: row.type,
    nom: row.nom,
    sn: row.sn ?? undefined,
    parentId: row.parent_id ?? null,
    parentPort: row.parent_port ?? undefined,
    cableSn: row.cable_sn ?? undefined,
    cableLongueurM: row.cable_longueur_m != null ? Number(row.cable_longueur_m) : undefined,
    cableDistanceReelleM: row.cable_distance_reelle_m != null ? Number(row.cable_distance_reelle_m) : undefined,
    nbPorts: row.nb_ports ?? 0,
    portsOccupes: row.ports_occupes ?? 0,
    coordonnees: row.coordonnees ?? undefined,
    puissanceOptiqueDbm: row.puissance_optique_dbm != null ? Number(row.puissance_optique_dbm) : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function fetchReseauNoeuds(zone?: string): Promise<NoeudReseau[]> {
  let query = supabase.from('reseau_noeuds').select('*').order('created_at', { ascending: true });
  if (zone) query = query.eq('zone', zone);
  const { data, error } = await query;
  if (error) {
    console.error('fetchReseauNoeuds:', error);
    return [];
  }
  return (data ?? []).map(mapNoeud);
}

export async function createReseauNoeud(n: Partial<NoeudReseau>): Promise<NoeudReseau | null> {
  const { data, error } = await supabase
    .from('reseau_noeuds')
    .insert({
      zone: n.zone,
      type: n.type,
      nom: n.nom,
      sn: n.sn || null,
      parent_id: n.parentId || null,
      parent_port: n.parentPort ?? null,
      cable_sn: n.cableSn || null,
      cable_longueur_m: n.cableLongueurM ?? null,
      cable_distance_reelle_m: n.cableDistanceReelleM ?? null,
      nb_ports: n.nbPorts ?? 8,
      ports_occupes: n.portsOccupes ?? 0,
      coordonnees: n.coordonnees || null,
      puissance_optique_dbm: n.puissanceOptiqueDbm ?? null,
      notes: n.notes || null,
    })
    .select()
    .single();
  if (error) {
    console.error('createReseauNoeud:', error);
    throw new Error(error.message);
  }
  return data ? mapNoeud(data) : null;
}

export async function deleteReseauNoeud(id: string): Promise<void> {
  const { error } = await supabase.from('reseau_noeuds').delete().eq('id', id);
  if (error) {
    console.error('deleteReseauNoeud:', error);
    throw new Error(error.message);
  }
}

// ─── CONGÉS ────────────────────────────────────────────────────────────────────

export async function fetchLeaves(): Promise<LeaveRecord[]> {
  const { data, error } = await supabase
    .from('employee_leaves')
    .select('*, auteur:profiles!cree_par(name)')
    .order('date_debut', { ascending: false });
  if (error) {
    console.error('fetchLeaves:', error);
    return [];
  }
  return (data ?? []).map(mapLeave);
}

export async function createLeave(leave: Partial<LeaveRecord> & { createdById?: string | null }): Promise<LeaveRecord | null> {
  const { data, error } = await supabase
    .from('employee_leaves')
    .insert({
      employee_id: leave.employeeId,
      type: leave.type,
      date_debut: leave.dateDebut,
      date_fin: leave.dateFin,
      jours: leave.jours,
      motif: leave.motif ?? '',
      cree_par: leave.createdById ?? null,
    })
    .select('*, auteur:profiles!cree_par(name)')
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
  const { data, error } = await supabase.from('vehicles').select(`*, ${EQUIPE}`).order('type');
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
      ...(await colEquipe(v.equipeNom)),
      chauffeur_id: v.chauffeurId || null,
      notes: v.notes ?? '',
    })
    .select(`*, ${EQUIPE}`)
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
    ...(await colEquipe(v.equipeNom)),
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
  const { data, error } = await supabase.from('materiels').select(`*, ${EQUIPE}`).order('nom');
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
      ...(await colEquipe(m.equipeNom ?? null)),
      quantite: m.quantite ?? 1,
      etat: m.etat ?? 'bon',
      notes: m.notes ?? '',
    })
    .select(`*, ${EQUIPE}`)
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
      ...(await colEquipe(m.equipeNom ?? null)),
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
    importId: row.import_id ?? undefined,
  };
}

// ─── SCANS RÉSEAU (ONU/OLT) ────────────────────────────────────────────────────

// Supabase limite les SELECT à 1000 lignes par requête : on paginate.
// Récupère l'id du dernier import (le plus récent scan_import_history) — sert
// de référence pour "l'état actuel" du réseau (par défaut, dans toute l'app).
export async function fetchLatestImportId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('scan_import_history')
    .select('id')
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('fetchLatestImportId:', error);
    return null;
  }
  return data?.id ?? null;
}

async function fetchScansPaginated(filterImportId?: string | null): Promise<ScanRecord[]> {
  const all: ScanRecord[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    // vue scan_resultats : résultat de l'import + équipement (onts) + FGP (lignes)
    let query = supabase.from('scan_resultats').select('*').order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (filterImportId) query = query.eq('import_id', filterImportId);
    const { data, error } = await query;
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

// Charge les scans de "l'état actuel" (dernier import uniquement) — c'est ce
// qu'utilisent les cartes/filtres de la page Scans et la correspondance
// FGP ↔ scan sur la page Situations. Ne renvoie rien si aucun import n'existe.
export async function fetchScans(): Promise<ScanRecord[]> {
  const latestId = await fetchLatestImportId();
  if (!latestId) return [];
  return fetchScansPaginated(latestId);
}

// Charge les scans d'un import précis (n'importe quelle date passée) — pour la
// fonctionnalité "voir un import passé" de la page Scans.
export async function fetchScansByImportId(importId: string): Promise<ScanRecord[]> {
  return fetchScansPaginated(importId);
}

// Import par paquets : la fonction SQL importer_scans enregistre l'équipement une seule
// fois (table onts, avec sa ligne FGP) et, pour cet import, uniquement ce qui change
// (résultat, date du scan, Rx, ranging, remarque). Un même ONT deux fois dans le
// fichier n'est compté qu'une fois (la ligne « scanné » l'emporte).
export async function bulkInsertScans(rows: Partial<ScanRecord>[], importId: string): Promise<number> {
  const CHUNK = 1000;
  let inserted = 0;
  let lastError: string | null = null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      sn: r.snMac ?? null,
      fgp: r.onuName ?? null,
      zone: r.zone ?? null,
      stt: r.stt ?? null,
      port_id: r.portId ?? null,
      onu_id: r.onuId ?? null,
      software_version: r.softwareVersion ?? null,
      time_added: r.timeAddedToNms || null,
      result: r.result ?? 'NON SCANE',
      scan_time: r.scanTime || null,
      rx_power: r.rxPower ?? null,
      ranging: r.ranging ?? null,
      remarque: r.remarque ?? null,
    }));
    const { data, error } = await supabase.rpc('importer_scans', { p_import: importId, p_lignes: chunk });
    if (error) {
      console.error('bulkInsertScans chunk:', error);
      lastError = error.message;
      continue;
    }
    inserted += typeof data === 'number' ? data : chunk.length;
  }
  // Si RIEN n'a été inséré alors qu'on avait des lignes à importer, c'est un échec réel
  // (ex: migration pas encore exécutée) — on le signale au lieu de laisser croire à un succès.
  if (inserted === 0 && rows.length > 0) {
    throw new Error(lastError ?? "Aucune ligne n'a pu être importée (exécuter supabase_normalisation.sql)");
  }
  return inserted;
}

// Vide TOUT l'historique des scans (tous les imports confondus) — action admin
// destructrice, distincte de la suppression d'un seul import (voir
// deleteScansByImportId ci-dessous).
export async function clearScans(): Promise<void> {
  const { error } = await supabase.from('scan_results').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) console.error('clearScans:', error);
}

// Supprime uniquement les lignes d'un import précis — utilisé quand on retire
// une ligne de l'historique (scan_import_history), pour que les données brutes
// correspondantes disparaissent aussi, sans toucher aux autres imports.
export async function deleteScansByImportId(importId: string): Promise<void> {
  const { error } = await supabase.from('scan_results').delete().eq('import_id', importId);
  if (error) console.error('deleteScansByImportId:', error);
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await supabase.from('scan_results').delete().eq('id', id);
  if (error) console.error('deleteScan:', error);
}

// ─── HISTORIQUE DES IMPORTS DE SCAN (suivi semaine par semaine) ────────────────

export interface ScanImportSnapshot {
  id: string;
  importedAt: string;
  fileName?: string;
  total: number;
  resilies?: number;
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
    fileName: row.file_name ?? '',
    total: row.total ?? 0,
    resilies: row.resilies ?? 0,
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
  // vue scan_import_stats : compteurs et comparaison recalculés depuis scan_results.
  // On choisit d'abord les 20 derniers imports : la vue ne calcule alors que ceux-là.
  const derniers = await supabase.from('scan_import_history').select('id').order('imported_at', { ascending: false }).limit(20);
  if (derniers.error) {
    console.error('fetchScanImportHistory:', derniers.error);
    return [];
  }
  const ids = (derniers.data ?? []).map((r) => r.id as string);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('scan_import_stats').select('*').in('id', ids).order('imported_at', { ascending: false });
  if (error) {
    console.error('fetchScanImportHistory:', error);
    return [];
  }
  return (data ?? []).map(mapScanSnapshot);
}

/** Crée l'entrée d'historique d'un import de scan et renvoie son id. Les compteurs
 *  (total, % scanné, comparaison) ne sont plus enregistrés : la vue scan_import_stats
 *  les recalcule à partir des lignes importées, ils ne peuvent donc pas être faux. */
export async function insertScanImportSnapshot(infos: { fileName?: string; byId?: string | null } = {}): Promise<string | null> {
  const { data, error } = await supabase
    .from('scan_import_history')
    .insert({ file_name: infos.fileName ?? '', importe_par: infos.byId ?? null })
    .select('id')
    .single();
  if (error) {
    console.error('insertScanImportSnapshot:', error);
    return null;
  }
  return data?.id ?? null;
}

export async function deleteScanImportSnapshot(id: string): Promise<void> {
  // Supprime aussi les lignes de scan_results rattachées à cet import — la
  // contrainte ON DELETE CASCADE de la migration le fait déjà normalement,
  // mais on le fait explicitement ici pour rester robuste même si la
  // contrainte n'a pas encore été appliquée côté base.
  await deleteScansByImportId(id);
  const { error } = await supabase.from('scan_import_history').delete().eq('id', id);
  if (error) console.error('deleteScanImportSnapshot:', error);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function loginWithCredentials(name: string, password: string): Promise<User | null> {
  // Auth passe désormais par une Edge Function (service_role) — le mot de
  // passe n'est plus jamais lu ni comparé côté client / clé anon.
  const { data, error } = await supabase.functions.invoke('login', {
    body: { name: name.trim(), password: password.trim() },
  });
  if (error || !data?.user) return null;
  return data.user as User;
}
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('change-password', {
    body: { userId, currentPassword, newPassword },
  });
  if (error) {
    // Sur une réponse non-2xx, supabase-js renvoie l'erreur dans `error` et le
    // corps JSON (avec notre message précis) est accessible via error.context.
    let message = 'Échec du changement de mot de passe';
    try {
      const ctx = (error as any)?.context;
      if (ctx?.json) {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      // garde le message par défaut
    }
    return { success: false, error: message };
  }
  if (!data?.success) {
    return { success: false, error: data?.error ?? 'Échec du changement de mot de passe' };
  }
  return { success: true };
}