import { Caisse, CaisseCategorie, CaisseOperation } from "@/types";

export const CATEGORIES: { id: Exclude<CaisseCategorie, 'alimentation'>; label: string; color: string }[] = [
  { id: 'carburant', label: 'Carburant', color: '#C77700' },
  { id: 'main_oeuvre', label: "Main-d'œuvre", color: '#1565C0' },
  { id: 'materiel', label: 'Matériel', color: '#6A1B9A' },
  { id: 'transport', label: 'Transport', color: '#00838F' },
  { id: 'vehicule', label: 'Véhicule / pneus', color: '#A1442A' },
  { id: 'location', label: 'Location', color: '#5D7A1F' },
  { id: 'communication', label: 'Téléphone / crédit', color: '#AD1457' },
  { id: 'projet', label: 'Projet', color: '#37474F' },
  { id: 'autre', label: 'Autre', color: '#78909C' },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<string, (typeof CATEGORIES)[number]>;
export const catOf = (id: string) => CAT[id] ?? CAT.autre;

export const STATUT_LABEL: Record<CaisseOperation['statut'], string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Refusée',
  annulee: 'Annulée',
};
export const STATUT_CLASS: Record<CaisseOperation['statut'], string> = {
  en_attente: 'bg-amber-50 text-amber-800 border-amber-200',
  validee: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejetee: 'bg-red-50 text-red-700 border-red-200',
  annulee: 'bg-slate-100 text-slate-500 border-slate-200',
};

/** 20000 → "20 000" */
export const mru = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const dayLabel = (s: string) => parseISO(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDate = (s: string) => parseISO(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
export const monthLabel = (m: string) => parseISO(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `Il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `Il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Catégorie devinée depuis le libellé ("Carburant Rosso" → carburant) */
export function guessCategorie(label: string): Exclude<CaisseCategorie, 'alimentation'> {
  const s = norm(label);
  if (/transport/.test(s)) return 'transport';
  if (/carbur|essence|gasoil|gazoil|diesel/.test(s)) return 'carburant';
  if (/pneu|batter|vidange|voiture|reparation|garage|huile|vehicule/.test(s)) return 'vehicule';
  if (/location|loyer|depot/.test(s)) return 'location';
  if (/telephone|credit|recharge|internet/.test(s)) return 'communication';
  if (/journe|heure|apres.?midi|ouvrier|main.?d|salaire|prime/.test(s)) return 'main_oeuvre';
  if (/poteau|laser|pince|metre|cable|materiel|outil|cliveuse|soudeuse|connecteur|box/.test(s)) return 'materiel';
  if (/projet|extension/.test(s)) return 'projet';
  return 'autre';
}

const VILLES = ['rosso', 'kaedi', 'keadi', 'ndb', 'nouadhibou', 'nktt', 'nouakchott', 'sidi bylil', 'haroun'];
/** Lieu/chantier reconnu dans le libellé (Rosso, Kaédi, NDB, code zone CI1Z01…) */
export function guessChantier(label: string): string {
  const zone = label.match(/\b[A-Z]{2}\d[A-Z]\d{2}\b/);
  if (zone) return zone[0];
  const s = norm(label);
  const v = VILLES.find((x) => s.includes(x));
  if (!v) return '';
  if (v === 'keadi' || v === 'kaedi') return 'Kaédi';
  if (v === 'ndb' || v === 'nouadhibou') return 'Nouadhibou';
  if (v === 'nktt' || v === 'nouakchott') return 'Nouakchott';
  return v.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ParsedLine {
  libelle: string;
  montant: number;
  date: string;
  categorie: Exclude<CaisseCategorie, 'alimentation'>;
  chantier: string;
  /** auteur du message WhatsApp (« ElAdel ») ; '' si l'en-tête n'a pas été collé */
  emetteur: string;
  /** numéro du message dans le collage (0, 1, 2…) : les lignes d'un même message sont groupées */
  message: number;
}

// Marques de sens d'écriture (RTL/LTR) que WhatsApp met dans les dates en arabe
const MARQUES = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g;
const CHIFFRES_ARABES = /[\u0660-\u0669\u06f0-\u06f9]/g;
const latin = (s: string) =>
  s.replace(MARQUES, '').replace(CHIFFRES_ARABES, (c) => String((c.charCodeAt(0) & 0xf) % 10)).replace(/\u060c/g, ',');

/** Date ISO depuis jour / mois / année (année absente : celle de la date par défaut, ou la précédente
 *  si la date tomberait dans le futur — un collage de décembre fait en janvier) */
function isoDepuis(j: string, m: string, a: string | undefined, baseDate: string): string | null {
  const jour = Number(j);
  const mois = Number(m);
  if (!jour || !mois || jour > 31 || mois > 12) return null;
  let an = a ? Number(a.length === 2 ? '20' + a : a) : Number(baseDate.slice(0, 4));
  const iso = (y: number) => `${y}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
  if (!a && iso(an) > baseDate && iso(an).slice(0, 7) > baseDate.slice(0, 7)) an -= 1;
  return iso(an);
}

/** En-tête d'un message WhatsApp copié, ex. :
 *   « [3/9، 11:35 ص] ElAdel: Slm »              (WhatsApp en arabe, jour/mois)
 *   « [03/09/2026 11:35:12] ElAdel: Slm »        (iPhone)
 *   « 03/09/2026, 11:35 - ElAdel: Slm »          (Android, export de discussion) */
function enteteMessage(line: string, baseDate: string): { date: string | null; emetteur: string; reste: string } | null {
  const crochets = /^\s*\[\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?[^\]]*\]\s*([^:]{1,40}?)\s*:\s?(.*)$/.exec(line);
  const tiret = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+\d{1,2}:\d{2}[^-]*-\s*([^:]{1,40}?)\s*:\s?(.*)$/.exec(line);
  const m = crochets ?? tiret;
  if (!m) return null;
  return { date: isoDepuis(m[1], m[2], m[3], baseDate), emetteur: m[4].trim(), reste: m[5] ?? '' };
}

/** Transforme un ou plusieurs messages WhatsApp collés en lignes (dépenses ou alimentations).
 *  • chaque en-tête « [14/9, 8:04] ElAdel: » donne la date et l'émetteur des lignes qui suivent,
 *    jusqu'au message suivant (sans en-tête : la date par défaut) ;
 *  • « 3 poteau 600 » → 600 (le plus grand nombre est le montant) ;
 *  • « Le 11/09/2026 Poteau rosso 300 » → date 11/09 pour cette ligne ;
 *  • « Bonjour », « Slm »… et les lignes sans montant sont ignorés. */
export function parseWhatsApp(text: string, baseDate: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let dateMsg = baseDate;
  let emetteur = '';
  let message = -1;
  latin(text).split(/\r?\n/).forEach((raw) => {
    let line = raw;
    const ent = enteteMessage(raw, baseDate);
    if (ent) {
      message++;
      dateMsg = ent.date ?? baseDate;
      emetteur = ent.emetteur;
      line = ent.reste;
    } else if (message < 0) message = 0;
    line = line.trim();
    if (!line) return;
    let date = dateMsg;
    const dm = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (dm) {
      date = isoDepuis(dm[1], dm[2], dm[3], baseDate) ?? dateMsg;
      line = line.replace(dm[0], ' ');
    }
    // nombres isolés uniquement : « CI1Z01 » (code zone) n'est pas un montant
    const nums = [...line.matchAll(/(?<![\p{L}\d])(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?![\p{L}\d])/gu)].map((m) => ({ s: m[0], v: parseInt(m[0].replace(/\D/g, ''), 10) }));
    if (!nums.length) return;
    const best = nums.reduce((a, b) => (b.v > a.v ? b : a));
    if (best.v < 50) return;
    let libelle = line
      .replace(best.s, ' ')
      .replace(/\b(mru|um|ouguiya)\b/gi, ' ')
      .replace(/^\s*(le|bonjour|slm|salam)\b/i, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s:,\-–]+|[\s:,\-–]+$/g, '')
      .trim();
    if (!libelle) libelle = 'Dépense';
    libelle = libelle.charAt(0).toUpperCase() + libelle.slice(1);
    out.push({ libelle, montant: best.v, date, categorie: guessCategorie(libelle), chantier: guessChantier(libelle), emetteur, message: Math.max(0, message) });
  });
  return out;
}

export interface CaisseSolde {
  recu: number;
  depense: number;
  solde: number;
  enAttenteDepense: number; // dépenses demandées, pas encore validées
  enAttenteAlim: number; // alimentations demandées, pas encore faites
  nbEnAttente: number;
}

/** Seules les opérations VALIDÉES comptent dans le solde ; les demandes en attente
 *  sont montrées à part (solde prévisionnel). */
export function soldes(caisses: Caisse[], ops: CaisseOperation[], filter?: (o: CaisseOperation) => boolean): Record<string, CaisseSolde> {
  const r: Record<string, CaisseSolde> = {};
  caisses.forEach((c) => (r[c.id] = { recu: 0, depense: 0, solde: 0, enAttenteDepense: 0, enAttenteAlim: 0, nbEnAttente: 0 }));
  ops.forEach((o) => {
    if (filter && !filter(o)) return;
    const s = (r[o.caisseId] ??= { recu: 0, depense: 0, solde: 0, enAttenteDepense: 0, enAttenteAlim: 0, nbEnAttente: 0 });
    if (o.statut === 'validee') {
      if (o.type === 'alimentation') s.recu += o.montant;
      else s.depense += o.montant;
    } else if (o.statut === 'en_attente') {
      s.nbEnAttente++;
      if (o.type === 'depense') s.enAttenteDepense += o.montant;
      else s.enAttenteAlim += o.montant;
    }
  });
  Object.values(r).forEach((s) => (s.solde = s.recu - s.depense));
  return r;
}
