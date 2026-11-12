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
import { GSS_LOGO_BASE64 } from '@/assets/logoBase64';
import { isHorsDelai } from '@/utils/stats';
import { poteauxDe } from '@/components/dashboard/commun';

export const fr = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

/** Les quatre catégories du rapport */
export const CATEGORIES = [
  { id: 'inst', label: 'Installations (CPL/TRL/CMI/CLS/RLR)', court: 'Installations', types: ['CPL', 'TRL', 'CMI', 'CLS', 'RLR'] },
  { id: 'cst', label: 'CST', court: 'CST', types: ['CST'] },
  { id: 'ans', label: 'ANS', court: 'ANS', types: ['ANS'] },
  { id: 'drg', label: 'Dérangements (DRG)', court: 'DRG', types: ['DRG'] },
] as const;
/** Classement des équipes : toutes les installations réunies, et les dérangements */
const DEUX_CATEGORIES = [
  { id: 'inst', label: 'Installations (tous types)', court: 'Installations', types: ['CPL', 'TRL', 'CMI', 'CLS', 'RLR', 'CST', 'ANS'] },
  { id: 'drg', label: 'Dérangements (DRG)', court: 'DRG', types: ['DRG'] },
] as const;

// jsPDF n'a que les polices standard : quelques caractères à remplacer
const t = (v: unknown) =>
  String(v ?? '')
    .replace(/\u2212/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\u202f]/g, ' ');

async function outilsPdf() {
  const [{ jsPDF }, modTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // selon le bundler, la fonction est l'export par défaut ou « autoTable »
  const mt = modTable as unknown as { default?: unknown; autoTable?: unknown };
  const autoTable = (typeof mt.default === 'function' ? mt.default : (mt.autoTable ?? (mt.default as { default?: unknown })?.default)) as typeof import('jspdf-autotable').default;
  return { jsPDF, autoTable };
}
type Doc = InstanceType<Awaited<ReturnType<typeof outilsPdf>>['jsPDF']>;
const finY = (doc: Doc) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;

const BLEU: [number, number, number] = [21, 101, 192];
const VERT: [number, number, number] = [46, 125, 50];
const ROUGE: [number, number, number] = [198, 40, 40];

/** En-tête : logo GSS à gauche, titre et sous-titres à droite ; renvoie la position suivante */
function entete(doc: Doc, titre: string, lignes: string[]) {
  const w = doc.internal.pageSize.getWidth();
  try {
    doc.addImage(GSS_LOGO_BASE64, 'PNG', 12, 8, 32, 19.6); // 228 × 140 px
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

function piedDePage(doc: Doc) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 160);
    doc.text(t(`GSS - page ${i} / ${n}`), w - 12, h - 6, { align: 'right' });
  }
}

function sousTitre(doc: Doc, y: number, texte: string) {
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

const STYLE = {
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

interface Delais {
  dans: number;
  hors: number;
}
function delais(l: Situation[], types: readonly string[]): Delais {
  const d = { dans: 0, hors: 0 };
  for (const s of l) {
    if (s.status === 'non_ok' || !types.includes(s.type)) continue;
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
}

export async function exporterStatsDelais(o: OptionsStats, mode: 'villes' | 'equipes') {
  const { jsPDF, autoTable } = await outilsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dates = o.du && o.au ? (o.du === o.au ? `le ${fr(o.du)}` : `du ${fr(o.du)} au ${fr(o.au)}`) : 'toutes dates';
  const villes = mode === 'villes';
  let y = entete(doc, `${villes ? 'Statistiques des délais' : 'Classement des équipes'} - ${o.periode}`, [
    `Période : ${dates}${o.filtres ? ` - ${o.filtres}` : ''}`,
    villes
      ? 'Installations = CPL/TRL/CMI/CLS/RLR réunis ; CST, ANS et DRG à part. Poteaux : fiches OK. Les NON OK ne comptent pas dans les délais.'
      : 'Installations = tous les types (CPL, TRL, CMI, CLS, RLR, CST, ANS) ; dérangements = DRG. Les NON OK ne comptent pas dans les délais.',
    `Édité le ${new Date().toLocaleString('fr-FR')} par ${o.auteur}`,
  ]);
  const cats = villes ? CATEGORIES : DEUX_CATEGORIES;

  // 1. Synthèse : une ligne par catégorie
  y = sousTitre(doc, y, 'Synthèse');
  const tot: Delais = { dans: 0, hors: 0 };
  const body = cats.map((c) => {
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

  if (villes) {
    // 2. Par ville (sans nom d'équipe) : délais des 4 catégories + poteaux posés
    const parVille = new Map<string, Situation[]>();
    o.situations.forEach((s) => {
      const v = o.villeDe(s.equipe);
      const l = parVille.get(v);
      if (l) l.push(s);
      else parVille.set(v, [s]);
    });
    const noms = [...parVille.keys()].sort();
    const poteaux = (l: Situation[]) => l.reduce((n, s) => n + (s.status === 'ok' ? poteauxDe(s) : 0), 0);
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
  } else {
    // 2. Classement de toutes les équipes : installations et dérangements, dans / hors délai
    const parEquipe = new Map<string, Situation[]>();
    o.situations.forEach((s) => {
      const k = (s.equipe || '').toLowerCase();
      const l = parEquipe.get(k);
      if (l) l.push(s);
      else parEquipe.set(k, [s]);
    });
    const lignes = o.equipes.map((e) => {
      const l = parEquipe.get(e.name.toLowerCase()) ?? [];
      const ins = delais(l, DEUX_CATEGORIES[0].types);
      const drg = delais(l, DEUX_CATEGORIES[1].types);
      const tout = { dans: ins.dans + drg.dans, hors: ins.hors + drg.hors };
      return { e, ins, drg, tout, n: tout.dans + tout.hors, taux: tout.dans + tout.hors ? tout.dans / (tout.dans + tout.hors) : -1 };
    });
    // le top : le plus de fiches traitées, puis le meilleur taux dans le délai
    lignes.sort((a, b) => b.n - a.n || b.taux - a.taux || a.e.name.localeCompare(b.e.name));
    const quatre = (d: Delais) => [d.dans + d.hors, d.dans, d.hors, pct(d.dans, d)];
    y = sousTitre(doc, y, 'Classement des équipes');
    autoTable(doc, {
      ...STYLE,
      startY: y,
      pageBreak: 'auto',
      head: [
        [
          ...['Rang', 'Équipe', "Chef d'équipe", 'Ville'].map((p) => ({ content: t(p), rowSpan: 2 })),
          { content: 'Installations', colSpan: 4 },
          { content: t('Dérangements'), colSpan: 4 },
          { content: 'Total', colSpan: 4 },
        ],
        ['Nombre', 'Dans délai', 'Hors délai', '% dans délai', 'Nombre', 'Dans délai', 'Hors délai', '% dans délai', 'Nombre', 'Dans délai', 'Hors délai', '% dans délai'].map(t),
      ],
      body: lignes.map((x, i) => [x.n ? i + 1 : '-', x.e.name, x.e.leader || '-', x.e.ville ?? 'Nouakchott', ...quatre(x.ins), ...quatre(x.drg), ...quatre(x.tout)].map(t)),
      foot: [['', 'Total', '', '', ...quatre(delais(o.situations, DEUX_CATEGORIES[0].types)), ...quatre(delais(o.situations, DEUX_CATEGORIES[1].types)), ...quatre(tot)].map(t)],
      columnStyles: { 0: { halign: 'center', fontStyle: 'bold' }, 1: { halign: 'left', fontStyle: 'bold' }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { fontStyle: 'bold' }, 8: { fontStyle: 'bold' }, 12: { fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index < 4) return;
        const k = (data.column.index - 4) % 4;
        if (k === 1) data.cell.styles.textColor = VERT;
        else if (k === 2) data.cell.styles.textColor = ROUGE;
      },
    });
  }

  piedDePage(doc);
  const nom = o.periode
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  doc.save(`${villes ? 'stats_delais_villes' : 'classement_equipes'}_${nom || 'periode'}.pdf`);
}
