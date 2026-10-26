import { supabase } from './supabase';

// Références partagées : la base stocke des identifiants (team_id, ligne_id, ont_id),
// l'application manipule des noms d'équipe et des numéros FGP / ONT. Ce module fait
// la correspondance, avec les mêmes règles que les fonctions SQL equipe_id() et norm_ont().

/** Nom comparable : minuscules, sans accents, espaces simplifiés (« Déploiement » = « DEPLOIEMENT ») */
export function normNom(t?: string | null): string {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Numéro de série ONT normalisé : HWTCB2FCC9AE → 48575443B2FCC9AE */
export function normOnt(sn?: string | null): string {
  const s = (sn ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/^[A-Z]{4}[0-9A-F]{8}$/.test(s)) {
    const hex = [...s.slice(0, 4)].map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join('');
    return hex + s.slice(4);
  }
  return s;
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ─── Équipes ─────────────────────────────────────────────────────────────────

interface TeamsCache {
  teams: { id: string; name: string; norm: string }[];
  alias: Map<string, string>;
}
let cache: Promise<TeamsCache> | null = null;

async function chargerEquipes(): Promise<TeamsCache> {
  const [t, a] = await Promise.all([
    supabase.from('teams').select('id, name').order('created_at'),
    supabase.from('equipe_alias').select('alias, team_id'),
  ]);
  if (t.error) throw new Error(t.error.message);
  return {
    teams: (t.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, norm: normNom(r.name as string) })),
    alias: new Map((a.data ?? []).map((r) => [r.alias as string, r.team_id as string])),
  };
}

/** À appeler après création, renommage ou suppression d'une équipe */
export function invalidateTeams(): void {
  cache = null;
}

function resoudre(c: TeamsCache, nom?: string | null): string | null {
  const n = normNom(nom);
  if (!n) return null;
  const exact = c.teams.find((t) => t.norm === n);
  if (exact) return exact.id;
  const alias = c.alias.get(n);
  if (alias) return alias;
  if (n.length < 5) return null;
  // faute de frappe : l'équipe la plus proche (≤ 2 lettres), si elle est seule à cette distance
  const d = c.teams.map((t) => ({ id: t.id, d: distance(t.norm, n) }));
  const min = Math.min(...d.map((x) => x.d));
  const proches = d.filter((x) => x.d === min);
  return min <= 2 && proches.length === 1 ? proches[0].id : null;
}

/** team_id d'un nom d'équipe écrit à la main (null si aucune équipe ne correspond) */
export async function teamIdFor(nom?: string | null): Promise<string | null> {
  if (!normNom(nom)) return null;
  if (!cache) cache = chargerEquipes().catch((e) => ((cache = null), Promise.reject(e)));
  return resoudre(await cache, nom);
}

/** Correspondance nom → team_id pour une liste de noms (imports) */
export async function teamIdsFor(noms: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  if (!cache) cache = chargerEquipes().catch((e) => ((cache = null), Promise.reject(e)));
  const c = await cache;
  const out = new Map<string, string | null>();
  noms.forEach((n) => out.set(n ?? '', resoudre(c, n)));
  return out;
}

// ─── Lignes (FGP / TPH) ──────────────────────────────────────────────────────

export interface LigneInfos {
  fgp: string;
  zone?: string;
  typeLigne?: 'FGP' | 'TPH';
  dis?: string;
  clientCode?: string;
  clientNom?: string;
  clientInfo?: string;
  telephones?: string[];
  adresse?: string;
  abonnement?: string;
  miseEnService?: string;
}

/** Crée ou met à jour les lignes et renvoie fgp → ligne_id.
 *  Seuls les champs renseignés sont écrits : une information déjà connue n'est
 *  jamais effacée par un fichier qui ne la contient pas. */
export async function upsertLignes(lignes: LigneInfos[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const parFgp = new Map<string, LigneInfos>();
  lignes.forEach((l) => {
    const fgp = (l.fgp ?? '').trim();
    if (fgp) parFgp.set(fgp, { ...parFgp.get(fgp), ...Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined && v !== '')), fgp });
  });
  // regroupées par ensemble de colonnes, pour qu'un upsert n'écrase rien avec du vide
  const groupes = new Map<string, Record<string, unknown>[]>();
  parFgp.forEach((l) => {
    const row: Record<string, unknown> = { fgp: l.fgp };
    if (l.zone) row.zone = l.zone;
    if (l.typeLigne) row.type_ligne = l.typeLigne;
    if (l.dis) row.dis = l.dis;
    if (l.clientCode) row.client_code = l.clientCode;
    if (l.clientNom) row.client_nom = l.clientNom;
    if (l.clientInfo) row.client_info = l.clientInfo;
    if (l.telephones?.length) row.telephones = l.telephones;
    if (l.adresse) row.adresse = l.adresse;
    if (l.abonnement) row.abonnement = l.abonnement;
    if (l.miseEnService) row.mise_en_service = l.miseEnService;
    const k = Object.keys(row).sort().join(',');
    groupes.set(k, [...(groupes.get(k) ?? []), row]);
  });
  for (const [cols, rows] of groupes) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data, error } =
        cols === 'fgp'
          ? await supabase.from('lignes').upsert(chunk, { onConflict: 'fgp', ignoreDuplicates: true }).select('id, fgp')
          : await supabase.from('lignes').upsert(chunk, { onConflict: 'fgp' }).select('id, fgp');
      if (error) throw new Error(error.message);
      (data ?? []).forEach((r) => out.set(r.fgp as string, r.id as string));
    }
  }
  // lignes déjà existantes ignorées par ignoreDuplicates : on lit leur id
  const manquantes = [...parFgp.keys()].filter((f) => !out.has(f));
  for (let i = 0; i < manquantes.length; i += 200) {
    const { data, error } = await supabase.from('lignes').select('id, fgp').in('fgp', manquantes.slice(i, i + 200));
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => out.set(r.fgp as string, r.id as string));
  }
  return out;
}

// ─── ONT ─────────────────────────────────────────────────────────────────────

/** Crée les ONT manquants (rattachés à leur ligne si connue) et renvoie sn normalisé → ont_id */
export async function upsertOnts(onts: { sn: string; ligneId?: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const parSn = new Map<string, string | null>();
  onts.forEach((o) => {
    const sn = normOnt(o.sn);
    if (sn) parSn.set(sn, o.ligneId ?? parSn.get(sn) ?? null);
  });
  const liste = [...parSn.keys()];
  for (let i = 0; i < liste.length; i += 200) {
    const part = liste.slice(i, i + 200);
    const { data, error } = await supabase.from('onts').select('id, sn, ligne_id').in('sn', part);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => out.set(r.sn as string, r.id as string));
    // un ONT déjà connu sans ligne est rattaché à celle de l'OT
    const aRattacher = (data ?? []).filter((r) => !r.ligne_id && parSn.get(r.sn as string));
    for (const r of aRattacher) {
      await supabase.from('onts').update({ ligne_id: parSn.get(r.sn as string) }).eq('id', r.id);
    }
    const nouveaux = part.filter((sn) => !out.has(sn)).map((sn) => ({ sn, ligne_id: parSn.get(sn) }));
    if (nouveaux.length) {
      const ins = await supabase.from('onts').upsert(nouveaux, { onConflict: 'sn' }).select('id, sn');
      if (ins.error) throw new Error(ins.error.message);
      (ins.data ?? []).forEach((r) => out.set(r.sn as string, r.id as string));
    }
  }
  return out;
}
