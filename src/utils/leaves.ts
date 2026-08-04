import ExcelJS from 'exceljs';
import type { Employee, LeaveRecord, Loan } from '@/types';
import { numberToFrenchWords } from './numberToWordsFr';
import { GSS_LOGO_BASE64 } from '@/assets/logoBase64';

const BANQUES_ORDER = ['BPM', 'Caisse', 'SGM'];
const SOCIETE = {
  siege: 'Siège social : Nouakchott, K.Ext SOCOGIM  873 2E A1',
  rc: ' RC N° : analytique:75781 chrono: 1522',
  nif: 'NIF : 21104523 ',
  destinataire: 'Monsieur Le Directeur Général de Banque Populaire Mauritanie',
  compte: 'Par le débit de notre compte n° 1005194, veuillez virer la somme :',
  signataire: 'MOHAMED YAHYA LIMAM',
};

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ── Palette — reprise des couleurs du logo GSS (bleu-sarcelle) ──────────
const COLOR = {
  accent: 'FF0A7F94',      // bleu-sarcelle (couleur principale du logo)
  accentDark: 'FF075A68',  // même teinte, plus soutenue (titre, total)
  headerFill: 'FF0A7F94',  // fond de l'en-tête du tableau
  headerText: 'FFFFFFFF',  // texte blanc sur l'en-tête
  bandFill: 'FFEAF5F7',    // bande alternée très pâle
  totalFill: 'FFD6EDF1',   // fond de la ligne TOTAL
  infoFill: 'FFF4FAFB',    // fond du bloc "Siège social / RC / NIF"
  border: 'FFB9DCE2',      // bordures fines du tableau
};

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COLOR.border } };
const FULL_BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const MEDIUM: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: COLOR.accentDark } };

const MONTANT_FMT = '#,##0.00';

/** Format d'affichage bancaire — remet les espaces comme sur les documents
 * imprimés/officiels : banque(5) + guichet(5) + compte(11) + clé(2), ex.
 * "00012 00001 00000072286 18". Le RIB reste stocké sans espace en base
 * (format compact) ; cette fonction ne change que l'affichage à l'export.
 * Les numéros qui ne font pas 23 chiffres (ex: simple n° de compte BPM) sont
 * laissés inchangés. */
function formatRib(rib?: string): string {
  const digits = (rib || '').replace(/\s+/g, '');
  if (digits.length !== 23) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 21)} ${digits.slice(21, 23)}`;
}

/** Incrémente le numéro d'ordre (ex: "018/DG/GSS/2026" -> "019/DG/GSS/2026") */
function nextOrdre(base: string, offset: number): string {
  if (offset === 0) return base;
  const m = base.match(/^(\d+)(.*)$/);
  if (!m) return base;
  const width = m[1].length;
  const next = (parseInt(m[1], 10) + offset).toString().padStart(width, '0');
  return next + m[2];
}

/**
 * Construit une feuille "Ordre de virement" — même contenu officiel que le
 * modèle GSS (logo, en-tête société, motif, tableau, total, signature) mais
 * avec une mise en page plus soignée : bloc d'en-tête teinté, en-tête de
 * tableau colorée, bandes alternées, ligne TOTAL mise en valeur, quadrillage
 * masqué au profit de bordures propres. Tient toujours sur une seule page A4.
 *
 * Colonnes : A = marge, B = Ordre, C = Mle, D = Nom, E = Banque,
 * F = RIB (ou N° de compte pour BPM), G = Montant, H = marge.
 */
function buildVirementSheet(
  workbook: ExcelJS.Workbook,
  logoImageId: number,
  opts: {
    sheetName: string;
    banque: string;
    employees: (Employee & { montantSheet: number })[];
    ordreNum: string;
    dateStr: string;
    motifMois: string;
  },
) {
  const { sheetName, banque, employees, ordreNum, dateStr, motifMois } = opts;
  const isBpm = banque === 'BPM';
  const total = employees.reduce((s, e) => s + (e.montantSheet || 0), 0);
  const lastCol = isBpm ? 9 : 7;

  const ws = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ showGridLines: false }] });

  // ── Colonnes ───────────────────────────────────────────────────────
  ws.columns = [
    { width: 3 },                          // A — marge gauche
    { width: 7.2 },                        // B — Ordre
    { width: 8.8 },                        // C — Mle
    { width: 30.5 },                       // D — NOM et PRENOM
    { width: 8.8 },                        // E — Banque
    { width: isBpm ? 16 : 26.5 },          // F — RIB / N° de compte
    { width: isBpm ? 10 : 30.8 },          // G — Clé RIB (BPM) / Montant
    { width: 3 },                          // H — marge droite (+ Montant pour BPM)
    ...(isBpm ? [{ width: 14 }] : []),     // I — Montant (BPM uniquement)
  ];

  // ── Logo ───────────────────────────────────────────────────────────
  ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 220, height: 87 } });
  for (let i = 0; i < 6; i++) ws.addRow([]);
  ws.getRow(6).height = 6;

  // ── Bloc en-tête société — fond teinté, filet gauche coloré ──────────
  const rSiege = ws.addRow([SOCIETE.siege]);
  const rRc = ws.addRow([SOCIETE.rc]);
  const rNif = ws.addRow([SOCIETE.nif]);
  [rSiege, rRc, rNif].forEach((r, idx) => {
    for (let c = 1; c <= lastCol; c++) {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.infoFill } };
    }
    r.getCell(1).border = { left: MEDIUM };
    r.getCell(1).font = idx === 2 ? { name: 'Calibri', size: 12, bold: true } : { name: 'Calibri', size: 12 };
  });

  const rBlank1 = ws.addRow([]);
  rBlank1.height = 6;

  const rDate = ws.addRow(['', '', '', '', '', 'Nouakchott,', `le ${dateStr}`]);
  rDate.height = 18;
  rDate.getCell(6).font = { name: 'Times New Roman', size: 13, italic: true };
  rDate.getCell(7).font = { name: 'Times New Roman', size: 13, italic: true };
  rDate.getCell(7).alignment = { horizontal: 'center' };

  const rTitre = ws.addRow(['', '', '', `ORDRE DE VIREMENT N° ${ordreNum}`]);
  rTitre.height = 28;
  rTitre.getCell(4).font = { name: 'Times New Roman', size: 18, bold: true, color: { argb: COLOR.accentDark } };
  rTitre.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(rTitre.number, 4, rTitre.number, isBpm ? 9 : 8);
  // Filet coloré sous le titre, sur toute la largeur du tableau
  for (let c = 2; c <= lastCol; c++) {
    rTitre.getCell(c).border = { bottom: { style: 'medium', color: { argb: COLOR.accent } } };
  }

  const rA = ws.addRow(['', '', '', 'A']);
  rA.getCell(4).font = { name: 'Times New Roman', size: 13, bold: true };
  rA.getCell(4).alignment = { horizontal: 'center' };

  const rDest = ws.addRow(['', '', SOCIETE.destinataire]);
  rDest.getCell(3).font = { name: 'Times New Roman', size: 13, bold: true };
  rDest.getCell(3).alignment = { horizontal: 'center' };
  ws.mergeCells(rDest.number, 3, rDest.number, isBpm ? 9 : 8);

  const rCompte = ws.addRow(['', '', SOCIETE.compte, undefined, undefined, undefined, total, 'MRU']);
  rCompte.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rCompte.getCell(7).font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: COLOR.accentDark } };
  rCompte.getCell(7).numFmt = MONTANT_FMT;
  rCompte.getCell(8).font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: COLOR.accentDark } };

  const rChiffres = ws.addRow(['', '', 'En chiffres : ', undefined, undefined, total, 'MRU']);
  rChiffres.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rChiffres.getCell(6).font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: COLOR.accentDark } };
  rChiffres.getCell(6).numFmt = MONTANT_FMT;
  rChiffres.getCell(7).font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: COLOR.accentDark } };

  const rLettres = ws.addRow(['', '', 'En lettres :', `${numberToFrenchWords(total)} MRU`]);
  rLettres.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rLettres.getCell(4).font = { name: 'Times New Roman', size: 13, bold: true };

  const rMotif = ws.addRow(['', '', `Motif : Paiement employés pour le mois de ${motifMois}`]);
  rMotif.getCell(3).font = { name: 'Times New Roman', size: 13, bold: true, underline: true };

  const rFaveur = ws.addRow(['', '', 'En faveur de nos employés conformément au tableau suivant :']);
  rFaveur.getCell(3).font = { name: 'Times New Roman', size: 13 };

  const rNombre = ws.addRow(['', '', 'Nombre:', employees.length]);
  rNombre.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rNombre.getCell(4).font = { name: 'Times New Roman', size: 13, bold: true };
  rNombre.getCell(4).alignment = { horizontal: 'center' };

  ws.addRow([]);

  // ── En-tête du tableau — fond coloré, texte blanc ────────────────────
  const headers = isBpm
    ? ['', 'Ordre', 'Mle', 'NOM et PRENOM', 'Banque', 'Numéro de compte', 'Clé RIB', '', 'Montant (MRU)']
    : ['', 'Ordre', 'Mle', 'NOM et PRENOM', 'Banque', 'RIB', 'Montant (MRU)'];
  const rHead = ws.addRow(headers);
  rHead.height = 22;
  for (let c = 2; c <= lastCol; c++) {
    const cell = rHead.getCell(c);
    cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: COLOR.headerText } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerFill } };
    cell.border = FULL_BORDER;
  }

  // ── Lignes employés — bandes alternées ───────────────────────────────
  const montantCol = isBpm ? 9 : 7; // colonne "Montant (MRU)" de la table
  const montantColLetter = isBpm ? 'I' : 'G';
  const firstDataRow = rHead.number + 1;

  employees.forEach((e, i) => {
    const row = isBpm
      ? ['', i + 1, e.mle, e.name, banque, formatRib(e.rib), '', '', e.montantSheet]
      : ['', i + 1, e.mle, e.name, banque, formatRib(e.rib), e.montantSheet];
    const r = ws.addRow(row);
    r.height = 18;
    const banded = i % 2 === 1;
    for (let c = 2; c <= lastCol; c++) {
      const cell = r.getCell(c);
      cell.border = FULL_BORDER;
      if (banded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.bandFill } };
      if (c === 6) {
        // Colonne RIB — police Arial 10, comme le modèle
        cell.font = { name: 'Arial', size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (c === 4) {
        cell.font = { name: 'Times New Roman', size: 11 };
        cell.alignment = { vertical: 'middle' };
      } else {
        cell.font = { name: 'Times New Roman', size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
      if (c === montantCol) cell.numFmt = MONTANT_FMT; // vrai nombre, calculable/modifiable dans Excel
    }
  });
  const lastDataRow = rHead.number + employees.length;

  // ── Ligne TOTAL — vraie formule SUM (se recalcule si un montant est modifié) ──
  const totalFormula = employees.length > 0 ? { formula: `SUM(${montantColLetter}${firstDataRow}:${montantColLetter}${lastDataRow})` } : 0;
  const totalRow = isBpm
    ? ['', '', '', '', '', '', 'TOTAL', '', totalFormula]
    : ['', '', '', '', '', 'TOTAL', totalFormula];
  const rTotal = ws.addRow(totalRow);
  rTotal.height = 20;
  for (let c = 2; c <= lastCol; c++) {
    rTotal.getCell(c).border = { ...FULL_BORDER, top: { style: 'medium', color: { argb: COLOR.accentDark } } };
    rTotal.getCell(c).font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: COLOR.accentDark } };
    rTotal.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.totalFill } };
    rTotal.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  rTotal.getCell(montantCol).numFmt = MONTANT_FMT;

  // "Par le débit..." et "En chiffres :" pointent maintenant vers la ligne TOTAL,
  // pour rester cohérents si un montant est modifié après export.
  rCompte.getCell(7).value = { formula: `${montantColLetter}${rTotal.number}` };
  rChiffres.getCell(6).value = { formula: `${montantColLetter}${rTotal.number}` };

  ws.addRow([]);
  const rBlank2 = ws.addRow([]);
  rBlank2.height = 24;
  const rSign = ws.addRow(['', '', '', SOCIETE.signataire]);
  rSign.getCell(4).font = { name: 'Times New Roman', size: 14, bold: true, underline: true, color: { argb: COLOR.accentDark } };

  // ── Impression sur une seule page A4, portrait, marges serrées ────
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.5, footer: 0.5 },
  };
}

/** Déclenche le téléchargement d'un Blob dans le navigateur (ExcelJS n'a pas de writeFile côté navigateur). */
function downloadWorkbook(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exporte, pour un mois donné, la liste des employés QUI NE SONT PAS EN CONGÉ,
 * au format des "Ordres de virement" GSS (logo, en-tête, tableau, total,
 * signature), avec une mise en page soignée — un onglet par banque, plus un
 * onglet récapitulatif.
 *
 * Règle congé GSS : un employé dont le congé DÉMARRE le mois suivant voit son
 * salaire de CE mois DOUBLÉ ; un employé dont le congé DÉMARRE ce mois-ci est
 * EXCLU du virement (déjà payé en double le mois précédent).
 */
export async function exportEmployesPresentsExcel(opts: {
  month: string; // "YYYY-MM"
  employees: Employee[];
  leaves: LeaveRecord[];
  loans?: Loan[]; // prêts en cours — la mensualité active est déduite automatiquement
  ordreBase?: string; // ex: "020/DG/GSS/2026" — incrémenté automatiquement par banque
  dateStr?: string; // ex: "17/07/2026" — défaut : aujourd'hui
  fileName?: string;
}) {
  const { month, employees, leaves, loans = [] } = opts;
  const [y, m] = month.split('-').map(Number);

  // On se base sur le MOIS DE DÉBUT du congé (un congé "du 3 juin au 3
  // juillet" est un congé DE JUIN, même s'il déborde de quelques jours).
  const monthOf = (dateStr?: string): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;

  const onLeaveIds = new Set(leaves.filter((l) => monthOf(l.dateDebut) === month).map((l) => l.employeeId));
  const doublingIds = new Set(leaves.filter((l) => monthOf(l.dateDebut) === nextMonth).map((l) => l.employeeId));

  // Prêts actifs (reste dû > 0) par employé — la mensualité (plafonnée au reste
  // dû) est déduite du salaire exporté ce mois-ci, automatiquement.
  const activeLoanByEmployee = new Map<string, Loan>();
  loans.forEach((l) => {
    if (l.statut === 'actif' && l.reste > 0) activeLoanByEmployee.set(l.employeeId, l);
  });

  const present = employees
    .filter((e) => e.actif !== false && !onLeaveIds.has(e.id))
    .map((e) => {
      const conge_double = doublingIds.has(e.id);
      const baseMontant = conge_double ? (e.montant ?? 0) * 2 : (e.montant ?? 0);
      const loan = activeLoanByEmployee.get(e.id);
      const pret_deduit = loan ? Math.min(loan.mensualite, loan.reste) : 0;
      return { ...e, montant: baseMontant - pret_deduit, conge_double, pret_deduit, pret_reste_apres: loan ? Math.max(0, loan.reste - pret_deduit) : undefined };
    });

  const motifMois = `${MOIS_FR[(m || 1) - 1]} ${y}`;
  const dateStr = opts.dateStr ?? new Date().toLocaleDateString('fr-FR');
  const ordreBase = opts.ordreBase ?? '001/DG/GSS/2026';

  const banquesPresentes = [...new Set(present.map((e) => e.banque || 'Caisse'))].sort(
    (a, b) => BANQUES_ORDER.indexOf(a) - BANQUES_ORDER.indexOf(b),
  );

  const workbook = new ExcelJS.Workbook();
  const logoImageId = workbook.addImage({ base64: GSS_LOGO_BASE64, extension: 'png' });

  banquesPresentes.forEach((banque, idx) => {
    const rows = present.filter((e) => (e.banque || 'Caisse') === banque).map((e) => ({ ...e, montantSheet: e.montant ?? 0 }));
    buildVirementSheet(workbook, logoImageId, {
      sheetName: banque,
      banque,
      employees: rows,
      ordreNum: nextOrdre(ordreBase, idx),
      dateStr,
      motifMois,
    });
  });

  // ── Onglet récapitulatif — même style (en-tête coloré, bandes alternées) ──
  const wsAll = workbook.addWorksheet(`Récap ${motifMois}`.slice(0, 31), { views: [{ showGridLines: false }] });
  wsAll.columns = [
    { width: 7 }, { width: 8 }, { width: 30 }, { width: 16 }, { width: 12 },
    { width: 18 }, { width: 10 }, { width: 26 }, { width: 14 }, { width: 32 },
  ];
  wsAll.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 220, height: 87 } });
  for (let i = 0; i < 6; i++) wsAll.addRow([]);

  const rHeadAll = wsAll.addRow([
    'Ordre', 'Mle', 'Nom et prénom', 'Poste', 'Ville', 'Équipe', 'Banque', 'RIB / N° compte', 'Montant (MRU)', 'Remarque',
  ]);
  rHeadAll.height = 22;
  rHeadAll.eachCell((cell) => {
    cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: COLOR.headerText } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerFill } };
    cell.border = FULL_BORDER;
  });

  present.forEach((e, i) => {
    const remarques: string[] = [];
    if (e.conge_double) remarques.push('Congé le mois prochain — salaire doublé');
    if (e.pret_deduit) remarques.push(`Prêt : -${e.pret_deduit.toLocaleString('fr-FR')} MRU (reste ${e.pret_reste_apres?.toLocaleString('fr-FR')} MRU)`);
    const r = wsAll.addRow([
      i + 1,
      e.mle,
      e.name,
      e.poste || '',
      e.ville || '',
      e.equipeNom || '',
      e.banque || 'Caisse',
      formatRib(e.rib),
      e.montant ?? undefined,
      remarques.join(' · '),
    ]);
    r.height = 18;
    const banded = i % 2 === 1;
    r.eachCell((cell, colNumber) => {
      cell.border = FULL_BORDER;
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.alignment = { horizontal: colNumber === 3 ? 'left' : 'center', vertical: 'middle' };
      if (banded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.bandFill } };
      if (colNumber === 9) cell.numFmt = MONTANT_FMT; // Montant — vrai nombre
      if (colNumber === 10 && remarques.length > 0) {
        cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: COLOR.accentDark } };
      }
    });
  });

  wsAll.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.5, footer: 0.5 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadWorkbook(buffer as ArrayBuffer, opts.fileName ?? `Ordre_virement_${month}.xlsx`);
}