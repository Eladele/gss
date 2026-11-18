// Export PDF (A4) des salaires : même contenu que l'export Excel, feuille par feuille
//   • BPM, BII… : ordre de virement (logo, en-tête société, destinataire, montant en chiffres et
//     en lettres, motif, tableau, TOTAL, signataire et signature) — A4 portrait ;
//   • Caisse    : état « Salaires personnel réseau par caisse » (téléphone, date, émargement) — A4 portrait ;
//   • Récap     : tous les employés payés (poste, ville, équipe, banque, RIB, montant, remarque) — A4 paysage.
// Les données sont celles de l'aperçu (buildExportPreview) : ce que l'on voit est ce qui est exporté.
import { SOCIETE, enteteBanque, type ExportPreview, type PreviewCaisseSheet, type PreviewRecapSheet, type PreviewVirementSheet } from '@/utils/leaves';
import { imageExtension } from '@/utils/signature';

type RGB = [number, number, number];
const ACCENT: RGB = [10, 127, 148]; // bleu-sarcelle du logo
const FONCE: RGB = [7, 90, 104];
const BANDE: RGB = [234, 245, 247];
const TOTAL: RGB = [214, 237, 241];
const INFO: RGB = [244, 250, 251];
const BORD: RGB = [185, 220, 226];
const NOIR: RGB = [0, 0, 0];

/** 6955 → « 6 955,00 » (espaces simples : les polices standard du PDF n'ont pas l'espace fine) */
const montant = (n?: number) => {
  if (n == null) return '';
  const [ent, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`;
};
// caractères absents des polices standard du PDF
const t = (v: unknown) =>
  String(v ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\u202f]/g, ' ');

async function outils() {
  const [{ jsPDF }, modTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const mt = modTable as unknown as { default?: unknown; autoTable?: unknown };
  const autoTable = (typeof mt.default === 'function' ? mt.default : (mt.autoTable ?? (mt.default as { default?: unknown })?.default)) as typeof import('jspdf-autotable').default;
  return { jsPDF, autoTable };
}
type Outils = Awaited<ReturnType<typeof outils>>;
type Doc = InstanceType<Outils['jsPDF']>;
const finY = (doc: Doc) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;

function logo(doc: Doc, src: string, x: number, y: number, largeur = 46) {
  try {
    doc.addImage(src, 'PNG', x, y, largeur, (largeur * 140) / 228);
  } catch {
    /* logo illisible : le document reste utilisable */
  }
}

/** Siège / RC / NIF ; renvoie la position suivante */
function blocSociete(doc: Doc, y: number, encadre: boolean) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('times', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(...NOIR);
  if (encadre) {
    doc.setFillColor(...INFO);
    doc.rect(14, y - 4.5, w - 28, 17, 'F');
    doc.setFillColor(...FONCE);
    doc.rect(14, y - 4.5, 1, 17, 'F');
  }
  const x = encadre ? 18 : 14;
  // lignes supprimées dans Paramètres (vides) : non imprimées, les suivantes remontent
  const lignes = [
    { txt: SOCIETE.siege.trim(), gras: false },
    { txt: SOCIETE.rc.trim(), gras: false },
    { txt: SOCIETE.nif.trim(), gras: encadre },
  ].filter((l) => l.txt);
  lignes.forEach((l, i) => {
    doc.setFont('times', l.gras ? 'bold' : 'normal');
    doc.text(t(l.txt), x, y + i * 5.2);
  });
  doc.setFont('times', 'normal');
  return y + 18;
}

// ─── Ordre de virement (BPM, BII…) ───────────────────────────────────────────
function pageVirement(doc: Doc, autoTable: Outils['autoTable'], s: PreviewVirementSheet, logoSrc: string, signature: string) {
  const w = doc.internal.pageSize.getWidth();
  const cx = w / 2;
  logo(doc, logoSrc, 14, 8);
  let y = blocSociete(doc, 42, true);

  doc.setFont('times', 'italic');
  doc.setFontSize(12.5);
  doc.text(t(`${SOCIETE.ville}, le ${s.dateStr}`), w - 14, y, { align: 'right' });
  y += 10;

  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...FONCE);
  doc.text(t(`ORDRE DE VIREMENT N° ${s.ordreNum}`), cx, y, { align: 'center' });
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(14, y + 2.5, w - 14, y + 2.5);
  doc.setTextColor(...NOIR);
  y += 10;

  const { destinataire, compte } = enteteBanque(s.banque);
  doc.setFontSize(12.5);
  doc.text('A', cx, y, { align: 'center' });
  y += 6;
  const dest = doc.splitTextToSize(t(destinataire), w - 40);
  doc.text(dest, cx, y, { align: 'center' });
  y += 6 * dest.length + 2;

  const ligne = (gauche: string, droite: string, gras = true, couleur: RGB = FONCE) => {
    doc.setFont('times', 'normal');
    doc.setTextColor(...NOIR);
    const g = t(gauche);
    doc.text(g, 18, y);
    const lg = doc.getTextWidth(g + ' ');
    doc.setFont('times', gras ? 'bold' : 'normal');
    doc.setTextColor(...couleur);
    const reste = doc.splitTextToSize(t(droite), w - 36 - lg);
    doc.text(reste, 18 + lg, y);
    doc.setTextColor(...NOIR);
    y += 6 * reste.length;
  };
  ligne(compte, `${montant(s.total)} MRU`);
  ligne('En chiffres :', `${montant(s.total)} MRU`);
  ligne('En lettres :', s.totalLettres, true, NOIR);
  doc.setFont('times', 'bold');
  const motif = t(`Motif : ${SOCIETE.motif} ${s.motifMois}`);
  doc.text(motif, 18, y);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...NOIR);
  doc.line(18, y + 0.8, 18 + doc.getTextWidth(motif), y + 0.8);
  y += 6;
  doc.setFont('times', 'normal');
  doc.text(t(SOCIETE.faveur), 18, y);
  y += 6;
  ligne('Nombre :', String(s.rows.length), true, NOIR);

  const bpm = s.banque === 'BPM';
  autoTable(doc, {
    startY: y + 1,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { font: 'times', fontSize: 10.5, cellPadding: 1.6, lineColor: BORD, lineWidth: 0.2, textColor: 20, valign: 'middle' },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: BANDE },
    footStyles: { fillColor: TOTAL, textColor: FONCE, fontStyle: 'bold' },
    head: [['Ordre', 'Mle', 'NOM et PRENOM', 'Banque', bpm ? 'Numéro de compte' : 'RIB', 'Montant (MRU)'].map(t)],
    body: s.rows.map((r) => [r.ordre, r.mle, r.name, r.banque, r.rib, montant(r.montant)].map(t)),
    foot: [[{ content: 'TOTAL', colSpan: 5, styles: { halign: 'right' } }, { content: montant(s.total), styles: { halign: 'right' } }]],
    showFoot: 'lastPage',
    columnStyles: {
      0: { halign: 'center', cellWidth: 13 },
      1: { halign: 'center', cellWidth: 15 },
      3: { halign: 'center', cellWidth: 17 },
      4: { halign: 'center', font: 'helvetica', fontSize: 9, cellWidth: bpm ? 34 : 50 },
      5: { halign: 'right', cellWidth: 30 },
    },
  });

  // Signataire et signature
  y = finY(doc) + 12;
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage('a4', 'portrait');
    y = 25;
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...FONCE);
  const nom = t(SOCIETE.signataire);
  doc.text(nom, cx, y, { align: 'center' });
  doc.setDrawColor(...FONCE);
  doc.line(cx - doc.getTextWidth(nom) / 2, y + 1, cx + doc.getTextWidth(nom) / 2, y + 1);
  doc.setTextColor(...NOIR);
  try {
    doc.addImage(signature, imageExtension(signature) === 'png' ? 'PNG' : 'JPEG', cx - 20, y + 3, 40, 15);
  } catch {
    /* signature illisible */
  }
}

// ─── État de paie en espèces (Caisse) ────────────────────────────────────────
function pageCaisse(doc: Doc, autoTable: Outils['autoTable'], s: PreviewCaisseSheet, logoSrc: string) {
  const w = doc.internal.pageSize.getWidth();
  logo(doc, logoSrc, 40, 8);
  let y = blocSociete(doc, 42, false);
  doc.setFontSize(12);
  doc.text(t(SOCIETE.ville), 118, y + 3);
  doc.text(t(`Le ${s.dateStr}`), w - 14, y + 3, { align: 'right' });
  y += 10;
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text(t(s.titre), w / 2 - 12, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11.5);

  // colonnes : Ordre 15 · Mle 14 · Nom 50 · Téléphone 26 · Montant 30 · Date 20 · Émargement reste
  const larg = [15, 14, 50, 26, 30, 20];
  const xMontant = 14 + larg.slice(0, 4).reduce((a, b) => a + b, 0);
  doc.text(t(s.mois), xMontant + larg[4] / 2, y, { align: 'center' });

  autoTable(doc, {
    startY: y + 1.5,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { font: 'times', fontSize: 11, cellPadding: { top: 2.6, bottom: 2.6, left: 1.5, right: 1.5 }, lineColor: NOIR, lineWidth: 0.25, textColor: 0, valign: 'middle' },
    headStyles: { fillColor: [217, 217, 217], textColor: 0, fontStyle: 'bold', halign: 'center', cellPadding: 1.8 },
    footStyles: { fillColor: [191, 191, 191], textColor: 0, fontStyle: 'bold', fontSize: 12 },
    head: [['Ordre', 'Mle', 'NOM et PRENOM', 'Téléphone', 'Montant (MRU)', 'Date', 'Emargement'].map(t)],
    body: s.rows.map((r) => [r.ordre, r.mle, r.name, r.telephone, montant(r.montant), '', ''].map(t)),
    foot: [[{ content: 'TOTAL', colSpan: 4, styles: { halign: 'center' } }, { content: montant(s.total), styles: { halign: 'right' } }, '', '']],
    showFoot: 'lastPage',
    columnStyles: {
      0: { halign: 'center', cellWidth: larg[0] },
      1: { halign: 'center', cellWidth: larg[1] },
      2: { cellWidth: larg[2] },
      3: { halign: 'center', cellWidth: larg[3] },
      4: { halign: 'right', cellWidth: larg[4] },
      5: { cellWidth: larg[5] },
    },
  });

  y = finY(doc) + 9;
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage('a4', 'portrait');
    y = 25;
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text(t('Arrêtez le présent état à la somme de'), 14, y);
  doc.text(doc.splitTextToSize(t(s.totalLettres), w - 28), 14, y + 6);
  y += 20;
  const nom = t(SOCIETE.signataire);
  const xn = w - 14 - doc.getTextWidth(nom);
  doc.text(nom, xn, y);
  doc.setLineWidth(0.25);
  doc.line(xn, y + 1, w - 14, y + 1);
}

// ─── Récapitulatif (A4 paysage) ──────────────────────────────────────────────
function pageRecap(doc: Doc, autoTable: Outils['autoTable'], s: PreviewRecapSheet, logoSrc: string) {
  const w = doc.internal.pageSize.getWidth();
  logo(doc, logoSrc, 14, 8, 40);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...FONCE);
  doc.text(t(`Récapitulatif des salaires${s.mois ? ` - ${s.mois}` : ''}`), w / 2, 20, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(90, 100, 110);
  const total = s.rows.reduce((a, r) => a + (r.montant ?? 0), 0);
  doc.text(t(`${s.rows.length} employé${s.rows.length > 1 ? 's' : ''} payé${s.rows.length > 1 ? 's' : ''} - total ${montant(total)} MRU`), w / 2, 27, { align: 'center' });
  doc.setTextColor(...NOIR);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    margin: { left: 10, right: 10 },
    styles: { font: 'times', fontSize: 9, cellPadding: 1.3, lineColor: BORD, lineWidth: 0.2, textColor: 20, valign: 'middle' },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: BANDE },
    footStyles: { fillColor: TOTAL, textColor: FONCE, fontStyle: 'bold' },
    head: [['Ordre', 'Mle', 'Nom et prénom', 'Poste', 'Ville', 'Équipe', 'Banque', 'RIB / N° compte', 'Montant (MRU)', 'Remarque'].map(t)],
    body: s.rows.map((r) => [r.ordre, r.mle, r.name, r.poste, r.ville, r.equipe, r.banque, r.rib, montant(r.montant), r.remarque].map(t)),
    foot: [[{ content: 'TOTAL', colSpan: 8, styles: { halign: 'right' } }, { content: montant(total), styles: { halign: 'right' } }, '']],
    showFoot: 'lastPage',
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { halign: 'center', cellWidth: 13 },
      2: { cellWidth: 46 },
      4: { halign: 'center' },
      6: { halign: 'center', cellWidth: 15 },
      7: { halign: 'center', font: 'helvetica', fontSize: 7.5, cellWidth: 44 },
      8: { halign: 'right', cellWidth: 24 },
      9: { cellWidth: 52, textColor: FONCE, fontStyle: 'bold' },
    },
  });
}

/** Pied de page « GSS - Caisse - page 1 / 2 » */
function numeroter(doc: Doc, noms: string[]) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 158, 168);
    doc.text(t(`GSS - ${noms[i - 1] ?? ''} - page ${i} / ${n}`), w - 10, h - 6, { align: 'right' });
  }
}

/** Construit le PDF des feuilles de l'aperçu (toutes, ou celles nommées) */
async function construire(preview: ExportPreview, feuilles?: string[]) {
  const outilsPdf = await outils();
  const sheets = preview.sheets.filter((s) => !feuilles || feuilles.includes(s.name));
  let doc: Doc | null = null;
  const nomsPages: string[] = [];
  for (const s of sheets) {
    const orientation = s.kind === 'recap' ? 'landscape' : 'portrait';
    if (!doc) doc = new outilsPdf.jsPDF({ orientation, unit: 'mm', format: 'a4' });
    else doc.addPage('a4', orientation);
    const avant = doc.getNumberOfPages();
    if (s.kind === 'virement') pageVirement(doc, outilsPdf.autoTable, s, preview.logo, preview.signature);
    else if (s.kind === 'caisse') pageCaisse(doc, outilsPdf.autoTable, s, preview.logo);
    else pageRecap(doc, outilsPdf.autoTable, s, preview.logo);
    for (let p = avant; p <= doc.getNumberOfPages(); p++) nomsPages[p - 1] = s.name;
  }
  if (doc) numeroter(doc, nomsPages);
  return doc;
}

/** Un seul PDF A4 : une ou plusieurs pages par feuille (BPM, Caisse, BII, Récap) */
export async function exporterSalairesPdf(preview: ExportPreview, fileName: string) {
  const doc = await construire(preview);
  if (!doc) return false;
  doc.save(fileName);
  return true;
}

/** Un PDF par feuille (à envoyer à chaque banque séparément) */
export async function exporterSalairesPdfSepares(preview: ExportPreview, prefixe: string, suffixe: string) {
  let n = 0;
  for (const s of preview.sheets) {
    const doc = await construire(preview, [s.name]);
    if (!doc) continue;
    doc.save(`${prefixe}_${s.name.replace(/[^\p{L}\d]+/gu, '_')}_${suffixe}.pdf`);
    n++;
  }
  return n;
}
