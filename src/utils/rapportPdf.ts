// Rapports PDF du tableau de bord (logo GSS en haut), pour la période et les filtres choisis
// sur le tableau de bord (jour, semaine, mois, ville, équipe) — un seul bloc pour toute la
// période, sans détail jour par jour.
//
// Seulement les délais : pour chaque catégorie, combien de fiches dans le délai et hors délai.
//   Installations = CPL / TRL / CMI / CLS / RLR (réunis) · CST · ANS · DRG (chacun à part)
// Comme dans les statistiques, les NON OK n'entrent pas dans le calcul des délais.
//
//   exporterStatsDelais(o, 'villes')  : synthèse + une ligne par ville (sans nom d'équipe) + poteaux
//   exporterStatsDelais(o, 'equipes') : classement de toutes les équipes — installations (tous
//                                       types réunis) et dérangements, dans / hors délai
import type { Equipe, Situation } from '@/types';
import { logoExport, nomMarque } from '@/lib/marque';
import { isHorsDelai } from '@/utils/stats';
import { BAREME_OT, POINTS, delaiOT, doublonsCable } from '@/utils/points';
import { poteauxDe } from '@/components/dashboard/commun';

export const fr = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

/** Les quatre catégories du rapport */
export const CATEGORIES = [
  { id: 'inst', label: 'Installations (CPL/TRL/CMI/CLS/RLR)', court: 'Installations', types: ['CPL', 'TRL', 'CMI', 'CLS', 'RLR'] },
  { id: 'cst', label: 'CST', court: 'CST', types: ['CST'] },
  { id: 'ans', label: 'ANS', court: 'ANS', types: ['ANS'] },
  { id: 'drg', label: 'Dérangements (DRG)', court: 'DRG', types: ['DRG'] },
] as const;

// jsPDF n'a que les polices standard : quelques caractères à remplacer
export const t = (v: unknown) =>
  String(v ?? '')
    .replace(/\u2212/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\u202f]/g, ' ');

export async function outilsPdf() {
  const [{ jsPDF }, modTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // selon le bundler, la fonction est l'export par défaut ou « autoTable »
  const mt = modTable as unknown as { default?: unknown; autoTable?: unknown };
  const autoTable = (typeof mt.default === 'function' ? mt.default : (mt.autoTable ?? (mt.default as { default?: unknown })?.default)) as typeof import('jspdf-autotable').default;
  return { jsPDF, autoTable };
}
export type Doc = InstanceType<Awaited<ReturnType<typeof outilsPdf>>['jsPDF']>;
export const finY = (doc: Doc) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;

export const BLEU: [number, number, number] = [21, 101, 192];
export const VERT: [number, number, number] = [46, 125, 50];
export const ROUGE: [number, number, number] = [198, 40, 40];

/** En-tête : logo GSS à gauche, titre et sous-titres à droite ; renvoie la position suivante */
export function entete(doc: Doc, titre: string, lignes: string[]) {
  const w = doc.internal.pageSize.getWidth();
  try {
    // logo de l'entreprise, 19,6 mm de haut (32 mm de large pour le logo GSS 228 × 140 px)
    const l = logoExport();
    const larg = Math.min(19.6 * l.ratio, 34);
    doc.addImage(l.dataUrl, l.extension === 'png' ? 'PNG' : 'JPEG', 12, 8, larg, larg / l.ratio);
  } catch {
    /* logo illisible : le rapport reste utilisable */
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(t(titre), 50, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 115);
  lignes.forEach((l, i) => doc.text(t(l), 50, 21 + i * 4.6));
  const bas = Math.max(30, 21 + lignes.length * 4.6);
  doc.setDrawColor(...BLEU);
  doc.setLineWidth(0.6);
  doc.line(12, bas, w - 12, bas);
  doc.setTextColor(15, 23, 42);
  return bas + 7;
}

export function piedDePage(doc: Doc) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 160);
    doc.text(t(`${nomMarque()} - page ${i} / ${n}`), w - 12, h - 6, { align: 'right' });
  }
}

export function sousTitre(doc: Doc, y: number, texte: string) {
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLEU);
  doc.text(t(texte), 12, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  return y + 3;
}

export const STYLE = {
  theme: 'grid' as const,
  styles: { fontSize: 9, cellPadding: 1.8, halign: 'center' as const, valign: 'middle' as const },
  headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const },
  footStyles: { fillColor: [226, 232, 240] as [number, number, number], textColor: 20, fontStyle: 'bold' as const },
  columnStyles: { 0: { halign: 'left' as const, fontStyle: 'bold' as const } },
  margin: { left: 12, right: 12 },
  // un petit tableau n'est pas coupé entre deux pages ; le total n'apparaît qu'à la fin
  pageBreak: 'avoid' as const,
  showFoot: 'lastPage' as const,
};

const p = (n: number) => (Math.round(n * 100) / 100 || 0).toLocaleString('fr-FR');
const ps = (n: number) => (n > 0 ? `+${p(n)}` : p(n));

/**
 * Règles des points en vigueur (barème de la page Paramètres), en bas d'un rapport :
 * un tableau « Situation / Points » facile à lire ; renvoie la position suivante.
 */
export function reglesPoints(doc: Doc, autoTable: Awaited<ReturnType<typeof outilsPdf>>['autoTable'], y: number) {
  const b = BAREME_OT;
  const pen = POINTS.penalites;
  if (y > doc.internal.pageSize.getHeight() - 70) {
    doc.addPage();
    y = 16;
  }
  y = sousTitre(doc, y, 'Règles des points');
  const regles: [string, string][] = [
    ['Installation faite en 24 h', ps(b.inst24h)],
    ['Installation faite en 48 h', ps(b.inst48h)],
    ['Installation faite en 48 h avec poteau', ps(b.inst48hPoteau)],
    ['Plantation de poteau (24 h ou en retard)', ps(b.plantationPoteau)],
    ['Installation en retard (1er jour de retard)', ps(b.instRetard)],
    ['Dérangement fait dans le délai', ps(b.drg)],
    ['Chaque jour de retard en plus (installation ou dérangement)', ps(b.retardParJour)],
    ['Câble distribution réparé (une seule fiche par panne)', ps(b.cableDistribution)],
    ['Câble MPO réparé (une seule fiche par panne)', ps(b.cableMpo)],
    ['Autre panne réseau (câble transport, HUB-BOX, SUB-BOX)', `points x ${p(POINTS.coefReseau)}`],
    [
      'Modem défectueux, problème électricité',
      `au plus ${p(POINTS.sansIntervention)} (+${p(POINTS.bonusDecharge)} décharge, +${p(POINTS.bonusScan)} scanné)`,
    ],
    ["Installé par quelqu'un, confirmé par client, erreur de signalisation", p(POINTS.faitSansPoint)],
    ['Fiche « non faite »', p(POINTS.nonFait)],
    ['Pénalité : fiche ni faite ni « non faite » au contrôle de 22 h', p(pen.non_traitee)],
    ['Pénalité : fiche ouverte retardée', p(pen.retardee)],
    ['Pénalité : faux OK (la fiche perd ses points et est rouverte)', p(pen.faux_ok)],
  ];
  autoTable(doc, {
    ...STYLE,
    startY: y,
    pageBreak: 'auto',
    head: [['Situation', 'Points'].map(t)],
    body: regles.map((r) => r.map(t)),
    styles: { ...STYLE.styles, fontSize: 8.5, cellPadding: 1.4 },
    columnStyles: { 0: { halign: 'left', cellWidth: 150 }, 1: { halign: 'center', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 1) return;
      const v = String(d.cell.raw ?? '');
      d.cell.styles.textColor = v.startsWith('-') ? ROUGE : v.startsWith('+') ? VERT : [71, 85, 105];
    },
  });
  y = finY(doc) + 5;
  doc.setFontSize(8);
  doc.setTextColor(90, 100, 115);
  const notes = doc.splitTextToSize(
    t(
      'Délais comptés depuis « OT reçu le » en jours ouvrés (dimanches et jours fériés non comptés). Fiche reçue déjà hors délai et faite avant 22 h : barème « dans le délai ». Réaffecter une fiche avant son échéance ne pénalise pas.',
    ),
    doc.internal.pageSize.getWidth() - 24,
  );
  doc.text(notes, 12, y);
  doc.setTextColor(15, 23, 42);
  return y + notes.length * 3.6 + 4;
}

interface Delais {
  dans: number;
  hors: number;
}
function delais(l: Situation[], types: readonly string[]): Delais {
  const d = { dans: 0, hors: 0 };
  for (const s of l) {
    // seulement les fiches faites : une fiche en cours ou non faite n'est ni dans ni hors délai
    if (s.status !== 'ok' || !types.includes(s.type)) continue;
    if (isHorsDelai(s)) d.hors++;
    else d.dans++;
  }
  return d;
}
const pct = (n: number, d: Delais) => (d.dans + d.hors ? `${Math.round((n / (d.dans + d.hors)) * 1000) / 10} %` : '-');
/** 3 cellules par catégorie : dans, hors, % dans le délai */
const trois = (d: Delais) => [d.dans, d.hors, pct(d.dans, d)];
const toutesCats = (l: Situation[]) => CATEGORIES.flatMap((c) => trois(delais(l, c.types)));

/** En-tête sur deux lignes : la catégorie, puis Dans / Hors / % */
type CelluleTete = string | { content: string; rowSpan?: number; colSpan?: number };
function enteteGroupe(premieres: string[]): CelluleTete[][] {
  return [
    [...premieres.map((p) => ({ content: t(p), rowSpan: 2 })), ...CATEGORIES.map((c) => ({ content: t(c.court), colSpan: 3 }))],
    CATEGORIES.flatMap(() => ['Dans délai', 'Hors délai', '% dans délai'].map(t)),
  ];
}
/** Couleurs : « dans » en vert, « hors » en rouge */
function colorier(premieres: number, nbColonnes = Infinity) {
  return (data: { section: string; column: { index: number }; cell: { styles: { textColor: unknown } } }) => {
    if (data.section !== 'body') return;
    const k = data.column.index - premieres;
    if (k < 0 || k >= nbColonnes) return;
    if (k % 3 === 0) data.cell.styles.textColor = VERT;
    else if (k % 3 === 1) data.cell.styles.textColor = ROUGE;
  };
}

export interface OptionsStats {
  /** situations de la période, déjà filtrées par ville et équipe (tableau de bord) */
  situations: Situation[];
  /** « Novembre 2026 », « cette semaine », « aujourd'hui »… */
  periode: string;
  du?: string;
  au?: string;
  equipes: Equipe[];
  villeDe: (equipe?: string) => string;
  filtres: string;
  auteur: string;
  /** classement des équipes : pénalités de la période (retirées des points, comme la page Points) */
  penalites?: { equipe: string; points: number }[];
}

const nomFichier = (periode: string) =>
  periode
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'periode';
const texteDates = (o: OptionsStats) => (o.du && o.au ? (o.du === o.au ? `le ${fr(o.du)}` : `du ${fr(o.du)} au ${fr(o.au)}`) : 'toutes dates');

export async function exporterStatsDelais(o: OptionsStats, mode: 'villes' | 'equipes') {
  if (mode === 'equipes') return exporterClassementEquipes(o);
  const { jsPDF, autoTable } = await outilsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = entete(doc, `Statistiques des délais - ${o.periode}`, [
    `Période : ${texteDates(o)}${o.filtres ? ` - ${o.filtres}` : ''}`,
    'Installations = CPL/TRL/CMI/CLS/RLR réunis ; CST, ANS et DRG à part. Poteaux : fiches OK. Les NON OK ne comptent pas dans les délais.',
    `Édité le ${new Date().toLocaleString('fr-FR')} par ${o.auteur}`,
  ]);

  // 1. Synthèse : une ligne par catégorie
  y = sousTitre(doc, y, 'Synthèse');
  const tot: Delais = { dans: 0, hors: 0 };
  const body = CATEGORIES.map((c) => {
    const d = delais(o.situations, c.types);
    tot.dans += d.dans;
    tot.hors += d.hors;
    return [c.label, d.dans + d.hors, d.dans, d.hors, pct(d.dans, d), pct(d.hors, d)].map(t);
  });
  autoTable(doc, {
    ...STYLE,
    startY: y,
    head: [['Catégorie', 'Total', 'Dans délai', 'Hors délai', '% dans délai', '% hors délai'].map(t)],
    body,
    foot: [['Total', tot.dans + tot.hors, tot.dans, tot.hors, pct(tot.dans, tot), pct(tot.hors, tot)].map(t)],
    styles: { ...STYLE.styles, fontSize: 10, cellPadding: 2.4 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 90 }, 2: { textColor: VERT, fontStyle: 'bold' }, 3: { textColor: ROUGE, fontStyle: 'bold' } },
  });
  y = finY(doc) + 10;

  // 2. Par ville (sans nom d'équipe) : délais des 4 catégories + poteaux posés
  const parVille = new Map<string, Situation[]>();
  o.situations.forEach((s) => {
    const v = o.villeDe(s.equipe);
    const l = parVille.get(v);
    if (l) l.push(s);
    else parVille.set(v, [s]);
  });
  const noms = [...parVille.keys()].sort();
  const poteaux = (l: Situation[]) => l.reduce((n, s) => n + poteauxDe(s), 0);
  const head = enteteGroupe(['Ville']);
  head[0].push({ content: 'Poteaux', rowSpan: 2 });
  y = sousTitre(doc, y, 'Par ville');
  autoTable(doc, {
    ...STYLE,
    startY: y,
    head,
    body: noms.map((v) => [v, ...toutesCats(parVille.get(v) ?? []), poteaux(parVille.get(v) ?? [])].map(t)),
    foot: noms.length > 1 ? [['Total', ...toutesCats(o.situations), poteaux(o.situations)].map(t)] : undefined,
    columnStyles: { ...STYLE.columnStyles, [1 + CATEGORIES.length * 3]: { fontStyle: 'bold', textColor: [109, 76, 65] } },
    didParseCell: colorier(1, CATEGORIES.length * 3),
  });

  piedDePage(doc);
  doc.save(`stats_delais_villes_${nomFichier(o.periode)}.pdf`);
}

// ─── Classement des équipes ──────────────────────────────────────────────────
//
// Pour chaque équipe, les installations (tous types) et les dérangements à part :
//   • Faites / Non faites / En cours / En retard (fiches encore ouvertes) ;
//   • Hors délai chef : faite, mais après l'échéance de l'équipe (22 h) — dérangement non fait
//     le jour où il a été donné, installation faite après 22 h le lendemain du jour où elle a été
//     donnée (ou le jour même si elle était déjà en retard en arrivant). Compte seulement pour
//     le chef : la fiche reste « faite » ;
//   • Hors délai officiel : délai de l'application depuis la date du message — dérangement 24 h
//     (48 h si câble distribution / transport coupé), installation 48 h (jours ouvrés).

type EtatChef = 'dans' | 'hors' | 'retard' | 'en_cours' | 'non_fait' | null;

const statutDe = (s: Situation) => (s.status === 'ok' ? 'fait' : s.status === 'non_ok' ? 'non_fait' : 'a_faire');

/** Délai et points d'une fiche (barème des points des équipes) */
function delaiSituation(s: Situation, doublonCable = false) {
  const statut = statutDe(s);
  const ref = s.dateProgramme || s.dateRecu || s.dateMessage || s.dateDepo || new Date().toISOString().slice(0, 10);
  return delaiOT({
    nature: s.type === 'DRG' ? 'derangement' : 'installation',
    statut,
    dateRecu: s.dateRecu ?? null,
    dateProgramme: ref,
    traiteLe: s.traiteLe ?? s.updatedAt ?? null,
    assigneLe: s.assigneLe ?? null,
    motif: s.motifCloture,
    echeanceEquipe: s.echeanceEquipe ?? null,
    prioritaire: s.prioritaire,
    poteaux: s.poteau ?? 0,
    doublonCable,
  });
}

/** État de la fiche pour le chef (échéance 22 h de l'équipe) ; null si la fiche n'a pas été distribuée */
function etatChef(s: Situation): EtatChef {
  if (!s.numeroOt) return null;
  return delaiSituation(s).etat;
}

interface Compte {
  total: number;
  faites: number;
  nonFaites: number;
  enCours: number;
  enRetard: number;
  horsChef: number;
  horsOfficiel: number;
  points: number;
}
const compteVide = (): Compte => ({ total: 0, faites: 0, nonFaites: 0, enCours: 0, enRetard: 0, horsChef: 0, horsOfficiel: 0, points: 0 });
function ajouter(c: Compte, s: Situation, points = 0) {
  c.total++;
  c.points += points;
  const chef = etatChef(s);
  if (s.status === 'ok') {
    c.faites++;
    if (chef === 'hors') c.horsChef++;
    if (isHorsDelai(s)) c.horsOfficiel++;
  } else if (s.status === 'non_ok') c.nonFaites++;
  // encore ouverte : en retard si l'échéance de l'équipe est passée (sans programme : le délai officiel)
  else if (chef ? chef === 'retard' : isHorsDelai(s)) c.enRetard++;
  else c.enCours++;
}
const sept = (c: Compte) => [c.total, c.faites, c.nonFaites, c.enCours, c.enRetard, c.horsChef, c.horsOfficiel];
const COLONNES = ['Total', 'Faites', 'Non faites', 'En cours', 'En retard', 'Hors délai chef', 'Hors délai officiel'];

async function exporterClassementEquipes(o: OptionsStats) {
  const { jsPDF, autoTable } = await outilsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = entete(doc, `Classement des équipes - ${o.periode}`, [
    `Période : ${texteDates(o)}${o.filtres ? ` - ${o.filtres}` : ''} - installations = tous les types (CPL, TRL, CMI, CLS, RLR, CST, ANS), dérangements = DRG`,
    "Hors délai chef : faite après l'échéance de l'équipe (22 h ; dérangement le jour donné, installation le lendemain, le jour même si déjà en retard).",
    'Hors délai officiel : dérangement 24 h (48 h si câble distribution / transport coupé), installation 48 h après la date du message.',
    'Classement par points : installation 24 h = 2, 48 h = 1 (1,5 avec poteau), plantation poteau +1, retard -1 puis -0,5/jour ; dérangement 0,5 (-0,5/jour de retard) ; câble distribution 2, MPO 5 (une fiche par panne) ; non fait 0. Fiche reçue déjà hors délai et faite à temps par l\'équipe : barème dans le délai.',
    'Points = points des fiches + pénalités (non traitée à 22 h, retardée, réaffectée, faux OK). Égalité : le plus de fiches faites, puis le moins de hors délai.',
    `Édité le ${new Date().toLocaleString('fr-FR')} par ${o.auteur}`,
  ]);

  const estDrg = (s: Situation) => s.type === 'DRG';
  const totIns = compteVide();
  const totDrg = compteVide();
  const parEquipe = new Map<string, { ins: Compte; drg: Compte }>();
  // points des fiches du programme (barème des équipes) : une seule fiche payée par panne de câble
  const doublons = doublonsCable(
    o.situations.filter((s) => s.numeroOt).map((s) => ({ id: s.id, equipe: s.equipe, zone: s.zone, motif: s.motifCloture, statut: statutDe(s), traiteLe: s.traiteLe ?? s.updatedAt ?? null })),
  );
  for (const s of o.situations) {
    const k = (s.equipe || '').toLowerCase();
    let e = parEquipe.get(k);
    if (!e) parEquipe.set(k, (e = { ins: compteVide(), drg: compteVide() }));
    const pts = s.numeroOt ? delaiSituation(s, doublons.has(s.id)).points : 0;
    ajouter(estDrg(s) ? e.drg : e.ins, s, pts);
    ajouter(estDrg(s) ? totDrg : totIns, s, pts);
  }

  // 1. Synthèse
  y = sousTitre(doc, y, 'Synthèse');
  const somme = (a: Compte, b: Compte): Compte => ({
    total: a.total + b.total,
    faites: a.faites + b.faites,
    nonFaites: a.nonFaites + b.nonFaites,
    enCours: a.enCours + b.enCours,
    enRetard: a.enRetard + b.enRetard,
    horsChef: a.horsChef + b.horsChef,
    horsOfficiel: a.horsOfficiel + b.horsOfficiel,
    points: a.points + b.points,
  });
  const couleurs = (debut: number) => (data: { section: string; column: { index: number }; cell: { styles: { textColor: unknown; fontStyle?: unknown } } }) => {
    if (data.section !== 'body' || data.column.index < debut) return;
    const k = (data.column.index - debut) % 7;
    if (k > 0 && (data.cell as { raw?: unknown }).raw === '0') {
      data.cell.styles.textColor = [170, 178, 189]; // zéro : en gris
      return;
    }
    if (k === 1) data.cell.styles.textColor = VERT;
    else if (k === 2 || k >= 4) data.cell.styles.textColor = ROUGE;
    if (k === 0) data.cell.styles.fontStyle = 'bold';
  };
  autoTable(doc, {
    ...STYLE,
    startY: y,
    head: [['Catégorie', ...COLONNES].map(t)],
    body: [
      ['Installations', ...sept(totIns)].map(t),
      ['Dérangements', ...sept(totDrg)].map(t),
    ],
    foot: [['Total', ...sept(somme(totIns, totDrg))].map(t)],
    styles: { ...STYLE.styles, fontSize: 10, cellPadding: 2.2 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 60 } },
    didParseCell: couleurs(1),
  });
  y = finY(doc) + 9;

  // pénalités par équipe (non traitée à 22 h, retardée, réaffectée, faux OK) : nombre et total
  const pens = new Map<string, { n: number; pts: number }>();
  for (const p of o.penalites ?? []) {
    const k = (p.equipe || '').toLowerCase();
    const x = pens.get(k) ?? { n: 0, pts: 0 };
    pens.set(k, { n: x.n + 1, pts: x.pts + p.points });
  }
  const totPen = [...pens.entries()].filter(([k]) => o.equipes.some((e) => e.name.toLowerCase() === k)).reduce((s, [, x]) => s + x.pts, 0);

  // 2. Classement : le plus de points (barème des fiches − pénalités, comme la page Points),
  //    puis le plus de fiches faites, puis le moins de hors délai
  const lignes = o.equipes.map((e) => {
    const c = parEquipe.get(e.name.toLowerCase()) ?? { ins: compteVide(), drg: compteVide() };
    const tout = somme(c.ins, c.drg);
    const pen = pens.get(e.name.toLowerCase()) ?? { n: 0, pts: 0 };
    return { e, ...c, tout, pen, net: tout.points + pen.pts };
  });
  lignes.sort(
    (a, b) =>
      b.net - a.net ||
      b.tout.faites - a.tout.faites ||
      a.tout.horsChef + a.tout.horsOfficiel - (b.tout.horsChef + b.tout.horsOfficiel) ||
      b.tout.total - a.tout.total ||
      a.e.name.localeCompare(b.e.name),
  );
  const sansEquipe = parEquipe.get('');
  const pts = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  y = sousTitre(doc, y, 'Classement des équipes');
  const court = ['Total', 'Faites', 'Non faites', 'En cours', 'En retard', 'H.D. chef', 'H.D. officiel'];
  autoTable(doc, {
    ...STYLE,
    startY: y,
    pageBreak: 'auto',
    styles: { ...STYLE.styles, fontSize: 7.5, cellPadding: 1.3 },
    headStyles: { ...STYLE.headStyles, fontSize: 7.5 },
    head: [
      [
        ...['Rang', 'Équipe', "Chef d'équipe", 'Points', 'Fiches', 'Pénalités'].map((p) => ({ content: t(p), rowSpan: 2 })),
        { content: 'Installations', colSpan: 7 },
        { content: t('Dérangements'), colSpan: 7 },
      ],
      [...court, ...court].map(t),
    ],
    body: [
      ...lignes.map((x, i) =>
        [
          x.tout.total || x.pen.n ? i + 1 : '-',
          x.e.name,
          x.e.leader || '-',
          pts(x.net),
          pts(x.tout.points),
          x.pen.n ? `${pts(x.pen.pts)} (${x.pen.n})` : '0',
          ...sept(x.ins),
          ...sept(x.drg),
        ].map(t),
      ),
      ...(sansEquipe && sansEquipe.ins.total + sansEquipe.drg.total > 0
        ? [['-', 'Non affectées', '-', pts(somme(sansEquipe.ins, sansEquipe.drg).points), pts(somme(sansEquipe.ins, sansEquipe.drg).points), '-', ...sept(sansEquipe.ins), ...sept(sansEquipe.drg)].map(t)]
        : []),
    ],
    foot: [['', 'Total', '', pts(totIns.points + totDrg.points + totPen), pts(totIns.points + totDrg.points), pts(totPen), ...sept(totIns), ...sept(totDrg)].map(t)],
    columnStyles: { 0: { halign: 'center', fontStyle: 'bold', cellWidth: 10 }, 1: { halign: 'left', fontStyle: 'bold' }, 2: { halign: 'left' }, 3: { fontStyle: 'bold' } },
    didParseCell: couleurs(6),
  });

  piedDePage(doc);
  doc.save(`classement_equipes_${nomFichier(o.periode)}.pdf`);
}
