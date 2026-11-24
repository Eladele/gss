// Logique des prêts liée à la paie (même règles que supabase_prets_distribution.sql) :
//  • 1er prélèvement = le MOIS DU PRÊT (si ce mois est déjà distribué : le mois suivant) ;
//    une avance (mensualité = montant) est donc soldée en entier sur ce salaire ;
//  • chaque mois a sa propre date de distribution (salary_months) ; une fois le mois
//    distribué, ses prélèvements sont figés (loan_payments) ;
//  • durée automatique : échéances = montant ÷ mensualité ; un mois sans prélèvement
//    (congé, salaire suspendu, salaire insuffisant) repousse la fin d'un mois.
import type { Employee, LeaveRecord, Loan, LoanPayment, SalaryMonth } from '@/types';

export interface ContextePaie {
  payments: LoanPayment[];
  salaryMonths: SalaryMonth[];
}

export const CONTEXTE_VIDE: ContextePaie = { payments: [], salaryMonths: [] };

/** 'YYYY-MM' d'une date 'YYYY-MM-DD' ou 'YYYY-MM' */
export function moisDe(date?: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function moisPlus(mois: string, n: number): string {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** nombre de mois de a vers b (b − a) */
export function moisEcart(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma);
}

export function libelleMois(mois?: string | null): string {
  if (!mois) return '—';
  const [y, m] = mois.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

export function moisCalendaire(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function estDistribue(ctx: ContextePaie, mois: string): boolean {
  return ctx.salaryMonths.some((s) => s.mois === mois && s.statut === 'distribue');
}

export function dernierMoisDistribue(ctx: ContextePaie): string | null {
  let max: string | null = null;
  for (const s of ctx.salaryMonths) if (s.statut === 'distribue' && (!max || s.mois > max)) max = s.mois;
  return max;
}

/** Mois de paie en cours = le mois qui suit la dernière distribution (sinon le mois calendaire) */
export function moisPaieCourant(ctx: ContextePaie): string {
  const dernier = dernierMoisDistribue(ctx);
  return dernier ? moisPlus(dernier, 1) : moisCalendaire();
}

/** 1er prélèvement automatique : le mois du prêt, ou le suivant si ses salaires sont déjà distribués */
export function moisPremierAuto(dateDebut: string, ctx: ContextePaie): string {
  let m = moisDe(dateDebut) ?? moisCalendaire();
  for (let i = 0; i < 120 && estDistribue(ctx, m); i++) m = moisPlus(m, 1);
  return m;
}

export function premierPrelevement(loan: Loan, ctx: ContextePaie): string {
  return loan.moisPremierPrelevement || moisPremierAuto(loan.dateDebut, ctx);
}

/** nombre d'échéances (mois prélevés) d'un prêt */
export function nbEcheances(montant: number, mensualite: number): number {
  if (!(montant > 0) || !(mensualite > 0)) return 0;
  return Math.ceil(montant / mensualite);
}

/** Date de distribution proposée pour un mois : même jour que la dernière distribution, sinon fin de mois */
export function dateDistributionProposee(mois: string, ctx: ContextePaie): string {
  const [y, m] = mois.split('-').map(Number);
  const dernierJour = new Date(y, m, 0).getDate();
  const precedente = [...ctx.salaryMonths].filter((s) => s.mois < mois).sort((a, b) => b.mois.localeCompare(a.mois))[0];
  const jourPrec = precedente ? Number(precedente.dateDistribution.slice(8, 10)) : dernierJour;
  const jour = Math.min(jourPrec || dernierJour, dernierJour);
  return `${mois}-${String(jour).padStart(2, '0')}`;
}

function paiementDu(ctx: ContextePaie, loanId: string, mois: string): LoanPayment | undefined {
  return ctx.payments.find((p) => p.loanId === loanId && p.month === mois);
}

/** Mensualité attendue d'un prêt pour un mois (avant congés / plafond du salaire) */
export function echeanceDuMois(loan: Loan, mois: string, ctx: ContextePaie): number {
  const p = paiementDu(ctx, loan.id, mois);
  if (p) return p.montant; // déjà prélevé : montant réel
  if (mois < premierPrelevement(loan, ctx)) return 0; // pas encore commencé
  if (estDistribue(ctx, mois)) return 0; // mois clos sans prélèvement
  if (loan.statut !== 'actif' || loan.reste <= 0) return 0;
  return Math.min(loan.mensualite, loan.reste);
}

export interface LigneRetenue {
  loan: Loan;
  montant: number; // retenu ce mois
  prevu: number; // mensualité attendue
  dejaPreleve: boolean;
}

/**
 * Retenues de prêts d'un employé pour un mois.
 * exclu (congé / salaire suspendu) → aucune retenue, le prêt est repoussé d'un mois.
 * Les retenues ne dépassent jamais le salaire du mois (les plus anciens prêts d'abord).
 */
export function retenuesDuMois(
  empLoans: Loan[],
  mois: string,
  ctx: ContextePaie,
  opts: { exclu: boolean; brut: number },
): { total: number; lignes: LigneRetenue[] } {
  let dispo = opts.exclu ? 0 : Math.max(0, opts.brut);
  const tries = [...empLoans].sort((a, b) => (a.dateDebut || '').localeCompare(b.dateDebut || ''));
  const lignes: LigneRetenue[] = [];
  for (const loan of tries) {
    const dejaPreleve = !!paiementDu(ctx, loan.id, mois);
    const prevu = echeanceDuMois(loan, mois, ctx);
    if (prevu <= 0) continue;
    const montant = dejaPreleve ? prevu : Math.min(prevu, dispo);
    if (!dejaPreleve) dispo -= montant;
    lignes.push({ loan, montant, prevu, dejaPreleve });
  }
  return { total: lignes.reduce((s, l) => s + l.montant, 0), lignes };
}

export interface PlanPret {
  premier: string;
  echeances: number;
  nbPayes: number;
  /** mois distribués sans prélèvement (fin repoussée) */
  nonPreleves: string[];
  /** mois à venir sans prélèvement à cause d'un congé déjà enregistré */
  sautesPrevus: string[];
  prochain: string | null;
  fin: string;
  duree: number;
}

/** Calendrier d'un prêt : 1er mois, mois non prélevés, fin prévue, durée réelle */
export function planPret(
  loan: Loan,
  ctx: ContextePaie,
  opts: { leaves?: LeaveRecord[]; employee?: Employee } = {},
): PlanPret {
  const premier = premierPrelevement(loan, ctx);
  const echeances = nbEcheances(loan.montantTotal, loan.mensualite);
  const payes = ctx.payments.filter((p) => p.loanId === loan.id).map((p) => p.month).sort();
  const dernierPaye = payes[payes.length - 1] ?? null;
  const dernierDist = dernierMoisDistribue(ctx);
  const solde = loan.statut === 'solde' || loan.reste <= 0;

  const borne = solde ? dernierPaye : dernierDist;
  const payesSet = new Set(payes);
  const nonPreleves = ctx.salaryMonths
    .filter((s) => s.statut === 'distribue' && s.mois >= premier && !!borne && s.mois <= borne && !payesSet.has(s.mois))
    .map((s) => s.mois)
    .sort();

  if (solde) {
    const fin = dernierPaye ?? loan.moisFinPrevue ?? moisPlus(premier, Math.max(1, echeances) - 1);
    return { premier, echeances, nbPayes: payes.length, nonPreleves, sautesPrevus: [], prochain: null, fin, duree: Math.max(1, moisEcart(premier, fin) + 1) };
  }

  let prochain = premier;
  if (dernierDist && moisPlus(dernierDist, 1) > prochain) prochain = moisPlus(dernierDist, 1);
  if (dernierPaye && moisPlus(dernierPaye, 1) > prochain) prochain = moisPlus(dernierPaye, 1);

  // mois de congé à venir : pas de salaire donc pas de prélèvement
  const moisConge = new Set(
    (opts.leaves ?? []).filter((l) => l.employeeId === loan.employeeId).map((l) => moisDe(l.dateDebut)).filter(Boolean) as string[],
  );
  const sautesPrevus: string[] = [];
  let restants = Math.ceil(loan.reste / loan.mensualite);
  let m = prochain;
  let fin = prochain;
  for (let i = 0; i < 600 && restants > 0; i++, m = moisPlus(m, 1)) {
    if (moisConge.has(m) || (i === 0 && opts.employee?.salaireSuspendu)) {
      sautesPrevus.push(m);
      continue;
    }
    restants--;
    fin = m;
  }
  return { premier, echeances, nbPayes: payes.length, nonPreleves, sautesPrevus, prochain, fin, duree: Math.max(1, moisEcart(premier, fin) + 1) };
}
