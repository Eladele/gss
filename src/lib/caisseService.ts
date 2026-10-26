import { AppNotification, Caisse, CaisseChargeFixe, CaisseOperation, CaisseOpStatut } from '@/types';
import { supabase } from './supabase';

// ─── Mapping base ↔ appli ────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCaisse(r: any): Caisse {
  return {
    id: r.id,
    nom: r.nom,
    titulaireId: r.titulaire_id ?? null,
    telephone: r.telephone ?? '',
    seuilAlerte: r.seuil_alerte ?? 5000,
    actif: r.actif !== false,
  };
}

// Les noms viennent de profiles (une seule source) : aucune copie dans caisse_operations
const OP_SELECT = '*, demandeur:profiles!demande_par(name), traiteur:profiles!traite_par(name)';

function mapOperation(r: any): CaisseOperation {
  const source = r.source ?? 'app';
  return {
    id: r.id,
    caisseId: r.caisse_id,
    type: r.type,
    montant: Number(r.montant) || 0,
    date: r.date_op,
    libelle: r.libelle ?? '',
    categorie: r.categorie ?? 'autre',
    chantier: r.chantier ?? '',
    trsId: r.trs_id ?? null,
    statut: r.statut,
    demandeParId: r.demande_par ?? null,
    demandeParNom: r.demandeur?.name ?? (source === 'charge_fixe' ? 'Charge fixe' : null),
    // opérations reprises de WhatsApp / Bankily : validées sans compte de l'application
    traiteParNom:
      r.traiteur?.name ?? (r.statut === 'validee' && source !== 'app' && source !== 'charge_fixe' ? 'Reprise historique' : null),
    traiteLe: r.traite_le ?? null,
    motifRejet: r.motif_rejet ?? null,
    note: r.note ?? '',
    source: r.source ?? 'app',
    createdAt: r.created_at,
  };
}

function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    titre: r.titre,
    message: r.message ?? '',
    type: r.type ?? 'info',
    module: r.module ?? 'caisse',
    refId: r.ref_id ?? null,
    lu: !!r.lu,
    createdAt: r.created_at,
  };
}

function mapChargeFixe(r: any): CaisseChargeFixe {
  return {
    id: r.id,
    caisseId: r.caisse_id,
    libelle: r.libelle ?? '',
    montant: Number(r.montant) || 0,
    categorie: r.categorie ?? 'carburant',
    chantier: r.chantier ?? '',
    frequence: r.frequence ?? 'hebdo',
    jourSemaine: r.jour_semaine != null ? Number(r.jour_semaine) : null,
    jourMois: r.jour_mois != null ? Number(r.jour_mois) : null,
    actif: r.actif !== false,
    dernierDeclenchement: r.dernier_declenchement ?? null,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Message lisible pour les erreurs Supabase les plus courantes
function dbError(error: { code?: string; message?: string } | null, fallback: string): Error {
  if (error?.code === '23505') return new Error('Ce Trs ID est déjà enregistré : ce transfert existe déjà.');
  if (error?.code === '42P01') return new Error('Le module Caisses n’est pas encore installé (exécuter supabase_caisses_schema.sql).');
  return new Error(error?.message || fallback);
}

// ─── CAISSES ─────────────────────────────────────────────────────────────────

export async function fetchCaisses(): Promise<Caisse[]> {
  const { data, error } = await supabase.from('caisses').select('*').order('created_at');
  if (error) throw dbError(error, 'Chargement des caisses impossible');
  return (data ?? []).map(mapCaisse);
}

export async function upsertCaisse(c: Partial<Caisse> & { nom: string }): Promise<Caisse> {
  const payload = {
    nom: c.nom,
    titulaire_id: c.titulaireId ?? null,
    telephone: c.telephone ?? '',
    seuil_alerte: c.seuilAlerte ?? 5000,
    actif: c.actif ?? true,
  };
  const q = c.id
    ? supabase.from('caisses').update(payload).eq('id', c.id).select().single()
    : supabase.from('caisses').insert(payload).select().single();
  const { data, error } = await q;
  if (error) throw dbError(error, 'Enregistrement de la caisse impossible');
  return mapCaisse(data);
}

// ─── OPÉRATIONS ──────────────────────────────────────────────────────────────

export async function fetchOperations(): Promise<CaisseOperation[]> {
  const all: CaisseOperation[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('caisse_operations')
      .select(OP_SELECT)
      .order('date_op', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw dbError(error, 'Chargement des opérations impossible');
    if (!data?.length) break;
    all.push(...data.map(mapOperation));
    if (data.length < PAGE) break;
  }
  return all;
}

export interface NewOperation {
  caisseId: string;
  type: CaisseOperation['type'];
  montant: number;
  date: string;
  libelle: string;
  categorie: CaisseOperation['categorie'];
  chantier?: string;
  trsId?: string | null;
  note?: string;
  statut: CaisseOpStatut;
  source?: string;
}

/** Insère une ou plusieurs opérations en UNE requête : la base envoie alors
 *  une seule notification groupée (ex. un collage WhatsApp de 8 lignes). */
export async function insertOperations(
  ops: NewOperation[],
  by: { id: string; name: string },
): Promise<CaisseOperation[]> {
  const now = new Date().toISOString();
  const rows = ops.map((o) => ({
    caisse_id: o.caisseId,
    type: o.type,
    montant: Math.round(o.montant),
    date_op: o.date,
    libelle: o.libelle,
    categorie: o.categorie,
    chantier: o.chantier ?? '',
    trs_id: o.trsId || null,
    note: o.note ?? '',
    statut: o.statut,
    source: o.source ?? 'app',
    // (« auto » pour une charge fixe sans titulaire : pas de demandeur)
    demande_par: /^[0-9a-f-]{36}$/i.test(by.id) ? by.id : null,
    // Une opération créée déjà validée (alimentation par la comptable) est traitée par son auteur
    ...(o.statut === 'validee' ? { traite_par: by.id, traite_le: now } : {}),
  }));
  const { data, error } = await supabase.from('caisse_operations').insert(rows).select(OP_SELECT);
  if (error) throw dbError(error, 'Enregistrement impossible');
  return (data ?? []).map(mapOperation);
}

export async function updateOperation(
  id: string,
  patch: Partial<Pick<CaisseOperation, 'montant' | 'date' | 'libelle' | 'categorie' | 'chantier' | 'trsId' | 'note' | 'caisseId'>>,
): Promise<void> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const row: Record<string, any> = {};
  if (patch.montant !== undefined) row.montant = Math.round(patch.montant);
  if (patch.date !== undefined) row.date_op = patch.date;
  if (patch.libelle !== undefined) row.libelle = patch.libelle;
  if (patch.categorie !== undefined) row.categorie = patch.categorie;
  if (patch.chantier !== undefined) row.chantier = patch.chantier;
  if (patch.trsId !== undefined) row.trs_id = patch.trsId || null;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.caisseId !== undefined) row.caisse_id = patch.caisseId;
  const { error } = await supabase.from('caisse_operations').update(row).eq('id', id);
  if (error) throw dbError(error, 'Modification impossible');
}

/** Valide ou refuse une ou plusieurs demandes en UNE requête (notification groupée).
 *  Ne touche que les lignes encore « en attente » : deux validations simultanées
 *  ne peuvent pas se marcher dessus. */
export async function decideOperations(
  ids: string[],
  decision: 'validee' | 'rejetee',
  by: { id: string; name: string },
  extra: { motif?: string; trsId?: string } = {},
): Promise<number> {
  const { data, error } = await supabase
    .from('caisse_operations')
    .update({
      statut: decision,
      traite_par: by.id,
      traite_le: new Date().toISOString(),
      motif_rejet: decision === 'rejetee' ? extra.motif || null : null,
      ...(extra.trsId ? { trs_id: extra.trsId } : {}),
    })
    .in('id', ids)
    .eq('statut', 'en_attente')
    .select('id');
  if (error) throw dbError(error, 'Décision non enregistrée');
  return data?.length ?? 0;
}

export async function cancelOperation(id: string): Promise<void> {
  const { error } = await supabase.from('caisse_operations').update({ statut: 'annulee' }).eq('id', id).eq('statut', 'en_attente');
  if (error) throw dbError(error, 'Annulation impossible');
}

export async function deleteOperation(id: string): Promise<void> {
  const { error } = await supabase.from('caisse_operations').delete().eq('id', id);
  if (error) throw dbError(error, 'Suppression impossible');
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('app_notifications')
    .select('*')
    .eq('destinataire_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return []; // module pas encore installé : pas de notifications, pas de blocage
  return (data ?? []).map(mapNotification);
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabase.from('app_notifications').update({ lu: true }).in('id', ids);
}

/** Abonnement temps réel : nouvelles notifications du destinataire + tout changement
 *  d'opération/caisse (pour garder soldes et listes à jour sans recharger). */
export function subscribeCaisses(
  userId: string,
  handlers: {
    onNotification: (n: AppNotification) => void;
    onOperationsChanged: () => void;
  },
): () => void {
  const channel = supabase
    .channel(`caisses-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `destinataire_id=eq.${userId}` },
      (payload) => handlers.onNotification(mapNotification(payload.new)),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'caisse_operations' }, () => handlers.onOperationsChanged())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'caisses' }, () => handlers.onOperationsChanged())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Comptes pouvant être titulaires d'une caisse (pour l'écran « Caisses ») */
export async function fetchTitulaires(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, role').in('role', ['admin', 'superviseur', 'rh']).order('name');
  if (error) return [];
  return (data ?? []).map((p) => ({ id: p.id as string, name: p.name as string }));
}

// ─── CHARGES FIXES AUTOMATIQUES ──────────────────────────────────────────────

export const DEFAULT_CHARGES_FIXES = [
  { libelle: 'Carburant lundi', montant: 6500, categorie: 'carburant' as const, chantier: '', frequence: 'hebdo' as const, jourSemaine: 1, jourMois: null },
  { libelle: 'Carburant jeudi', montant: 3200, categorie: 'carburant' as const, chantier: '', frequence: 'hebdo' as const, jourSemaine: 4, jourMois: null },
  { libelle: 'Carburant Rosso', montant: 3000, categorie: 'carburant' as const, chantier: 'Rosso', frequence: 'mensuel' as const, jourSemaine: null, jourMois: 1 },
  { libelle: 'Carburant Kaédi', montant: 3000, categorie: 'carburant' as const, chantier: 'Kaédi', frequence: 'mensuel' as const, jourSemaine: null, jourMois: 1 },
  { libelle: 'Crédit', montant: 3500, categorie: 'communication' as const, chantier: '', frequence: 'mensuel' as const, jourSemaine: null, jourMois: 1 },
];

export async function fetchChargesFixes(): Promise<CaisseChargeFixe[]> {
  const { data, error } = await supabase.from('caisse_charges_fixes').select('*').order('created_at');
  if (error) {
    // Si la table n'a pas encore été créée dans Supabase, on n'interrompt pas l'appli
    return [];
  }
  return (data ?? []).map(mapChargeFixe);
}

export async function upsertChargeFixe(
  cf: Partial<CaisseChargeFixe> & { libelle: string; montant: number; caisseId: string },
): Promise<CaisseChargeFixe> {
  const payload = {
    caisse_id: cf.caisseId,
    libelle: cf.libelle,
    montant: Math.round(cf.montant),
    categorie: cf.categorie ?? 'carburant',
    chantier: cf.chantier ?? '',
    frequence: cf.frequence ?? 'hebdo',
    jour_semaine: cf.jourSemaine ?? null,
    jour_mois: cf.jourMois ?? null,
    actif: cf.actif ?? true,
    ...(cf.dernierDeclenchement ? { dernier_declenchement: cf.dernierDeclenchement } : {}),
  };
  const q = cf.id
    ? supabase.from('caisse_charges_fixes').update(payload).eq('id', cf.id).select().single()
    : supabase.from('caisse_charges_fixes').insert(payload).select().single();
  const { data, error } = await q;
  if (error) throw dbError(error, 'Enregistrement de la charge fixe impossible');
  return mapChargeFixe(data);
}

export async function deleteChargeFixe(id: string): Promise<void> {
  const { error } = await supabase.from('caisse_charges_fixes').delete().eq('id', id);
  if (error) throw dbError(error, 'Suppression de la charge fixe impossible');
}

/** Déclenchement manuel immédiat d'une charge fixe */
export async function declencherUneChargeFixe(
  cf: CaisseChargeFixe,
  by: { id: string; name: string },
): Promise<CaisseOperation> {
  const dStr = new Date().toISOString().split('T')[0];
  const ops = await insertOperations(
    [
      {
        caisseId: cf.caisseId,
        type: 'depense',
        montant: cf.montant,
        date: dStr,
        libelle: cf.libelle,
        categorie: cf.categorie,
        chantier: cf.chantier || '',
        statut: 'en_attente',
        source: 'charge_fixe',
        note: `Demande de charge fixe (${cf.frequence === 'hebdo' ? 'Hebdomadaire' : 'Mensuelle'})`,
      },
    ],
    by,
  );
  if (cf.id) {
    try {
      await supabase.from('caisse_charges_fixes').update({ dernier_declenchement: dStr }).eq('id', cf.id);
    } catch {
      // ignore
    }
  }
  return ops[0];
}

/** Vérification et déclenchement automatique pour aujourd'hui (idempotent, ne crée jamais de doublon) */
export async function verifierEtDeclencherChargesFixes(todayDate?: string): Promise<number> {
  const dStr = todayDate || new Date().toISOString().split('T')[0];
  // 1. Essayer la fonction côté PostgreSQL si disponible
  try {
    const { data, error } = await supabase.rpc('declencher_charges_fixes', { p_date: dStr });
    if (!error && typeof data === 'number') {
      return data;
    }
  } catch {
    // Si la fonction n'est pas encore créée en SQL, fallback sur la logique TS
  }

  // 2. Fallback applicatif : vérifie et insère si besoin
  const now = todayDate ? new Date(todayDate) : new Date();
  const dow = now.getDay() === 0 ? 7 : now.getDay(); // 1 = Lundi, 4 = Jeudi, 7 = Dimanche
  const dom = now.getDate(); // 1 = 1er du mois
  const currentMonth = dStr.slice(0, 7);

  const caisses = await fetchCaisses();
  let caisseBetoul = caisses.find((c) => c.nom.toLowerCase().includes('betoul'));
  if (!caisseBetoul) {
    caisseBetoul = caisses[0];
  }
  if (!caisseBetoul) return 0;

  const charges = await fetchChargesFixes();
  if (!charges.length) return 0;

  let count = 0;
  for (const cf of charges) {
    if (!cf.actif) continue;

    let isDue = false;
    if (cf.frequence === 'hebdo' && cf.jourSemaine === dow) {
      if (!cf.dernierDeclenchement || cf.dernierDeclenchement < dStr) {
        isDue = true;
      }
    } else if (cf.frequence === 'mensuel' && cf.jourMois === dom) {
      if (!cf.dernierDeclenchement || cf.dernierDeclenchement.slice(0, 7) < currentMonth) {
        isDue = true;
      }
    }

    if (isDue) {
      // Éviter tout doublon : chercher si une dépense identique existe déjà pour aujourd'hui
      const { data: existing } = await supabase
        .from('caisse_operations')
        .select('id')
        .eq('caisse_id', cf.caisseId || caisseBetoul.id)
        .eq('date_op', dStr)
        .eq('libelle', cf.libelle)
        .eq('montant', cf.montant)
        .limit(1);

      if (!existing || existing.length === 0) {
        await insertOperations(
          [
            {
              caisseId: cf.caisseId || caisseBetoul.id,
              type: 'depense',
              montant: cf.montant,
              date: dStr,
              libelle: cf.libelle,
              categorie: cf.categorie,
              chantier: cf.chantier || '',
              statut: 'en_attente',
              source: 'charge_fixe',
              note: 'Demande automatique (charge fixe)',
            },
          ],
          { id: caisseBetoul.titulaireId || 'auto', name: 'Charge Fixe' },
        );
        count++;
      }

      // Marquer le déclenchement
      if (cf.id) {
        try {
          await supabase.from('caisse_charges_fixes').update({ dernier_declenchement: dStr }).eq('id', cf.id);
        } catch {
          // ignore
        }
      }
    }
  }

  return count;
}

