import ExcelJS from 'exceljs';
import type { Employee, LeaveRecord } from '@/types';
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

const THIN: Partial<ExcelJS.Border> = { style: 'thin' };
const FULL_BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function fmtMontant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
 * Construit une feuille "Ordre de virement" identique au modèle Excel GSS
 * officiel : mêmes polices (Times New Roman / Calibri / Arial selon les
 * zones), gras, soulignés, bordures du tableau, largeurs de colonnes, et
 * réglage d'impression tenant sur une seule page A4.
 *
 * Colonnes (comme l'original) : A = marge, B = Ordre, C = Mle, D = Nom,
 * E = Banque, F = RIB (ou Numéro de compte pour BPM), G = Montant, H = marge.
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

  const ws = workbook.addWorksheet(sheetName.slice(0, 31));

  // ── Colonnes (largeurs identiques au modèle GSS) ──────────────────────
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

  // ── Logo (même position que le modèle : haut-gauche, lignes 1-6) ──────
  ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 220, height: 87 } });
  for (let i = 0; i < 6; i++) ws.addRow([]);
  ws.getRow(6).height = 6;

  // ── En-tête société ────────────────────────────────────────────────
  const rSiege = ws.addRow([SOCIETE.siege]);
  rSiege.getCell(1).font = { name: 'Calibri', size: 12 };
  const rRc = ws.addRow([SOCIETE.rc]);
  rRc.getCell(1).font = { name: 'Calibri', size: 12 };
  const rNif = ws.addRow([SOCIETE.nif]);
  rNif.getCell(1).font = { name: 'Calibri', size: 12, bold: true };

  const rBlank1 = ws.addRow([]);
  rBlank1.height = 6;

  const rDate = ws.addRow(['', '', '', '', '', 'Nouakchott,', `le ${dateStr}`]);
  rDate.height = 18;
  rDate.getCell(6).font = { name: 'Times New Roman', size: 13 };
  rDate.getCell(7).font = { name: 'Times New Roman', size: 13 };
  rDate.getCell(7).alignment = { horizontal: 'center' };

  const rTitre = ws.addRow(['', '', '', `ORDRE DE VIREMENT N° ${ordreNum}`]);
  rTitre.height = 25.5;
  rTitre.getCell(4).font = { name: 'Times New Roman', size: 18, bold: true };
  rTitre.getCell(4).alignment = { horizontal: 'center' };
  ws.mergeCells(rTitre.number, 4, rTitre.number, isBpm ? 9 : 8);

  const rA = ws.addRow(['', '', '', 'A']);
  rA.getCell(4).font = { name: 'Times New Roman', size: 13, bold: true };
  rA.getCell(4).alignment = { horizontal: 'center' };

  const rDest = ws.addRow(['', '', SOCIETE.destinataire]);
  rDest.getCell(3).font = { name: 'Times New Roman', size: 13, bold: true };
  rDest.getCell(3).alignment = { horizontal: 'center' };
  ws.mergeCells(rDest.number, 3, rDest.number, isBpm ? 9 : 8);

  const rCompte = ws.addRow(['', '', SOCIETE.compte, '', '', fmtMontant(total), 'MRU']);
  rCompte.getCell(3).font = { name: 'Times New Roman', size: 13 };

  const rChiffres = ws.addRow(['', '', 'En chiffres : ', '', '', fmtMontant(total), 'MRU']);
  rChiffres.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rChiffres.getCell(6).font = { name: 'Times New Roman', size: 13, bold: true };
  rChiffres.getCell(7).font = { name: 'Times New Roman', size: 13, bold: true };

  const rLettres = ws.addRow(['', '', 'En lettres :', `${numberToFrenchWords(total)} MRU`]);
  rLettres.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rLettres.getCell(4).font = { name: 'Times New Roman', size: 13, bold: true };

  const rMotif = ws.addRow(['', '', `Motif : Paiement employés pour le mois de ${motifMois}`]);
  rMotif.getCell(3).font = { name: 'Times New Roman', size: 13, bold: true, underline: true };

  const rFaveur = ws.addRow(['', '', 'En faveur de nos employés conformément au tableau suivant :']);
  rFaveur.getCell(3).font = { name: 'Times New Roman', size: 13 };

  const rNombre = ws.addRow(['', '', 'Nombre:', employees.length]);
  rNombre.getCell(3).font = { name: 'Times New Roman', size: 13 };
  rNombre.getCell(4).font = { name: 'Times New Roman', size: 13 };
  rNombre.getCell(4).alignment = { horizontal: 'center' };

  // ── Tableau des employés ──────────────────────────────────────────
  const headers = isBpm
    ? ['', 'Ordre', 'Mle', 'NOM et PRENOM', 'Banque', 'Numéro de compte', 'Clé RIB', '', 'Montant (MRU)']
    : ['', 'Ordre', 'Mle', 'NOM et PRENOM', 'Banque', 'RIB', 'Montant (MRU)'];
  const rHead = ws.addRow(headers);
  rHead.height = 19.5;
  const lastCol = isBpm ? 9 : 7;
  for (let c = 2; c <= lastCol; c++) {
    const cell = rHead.getCell(c);
    cell.font = { name: 'Times New Roman', size: 12, bold: true };
    cell.alignment = { horizontal: 'center' };
    cell.border = FULL_BORDER;
  }

  employees.forEach((e, i) => {
    const row = isBpm
      ? ['', i + 1, e.mle, e.name, banque, e.rib || '', '', '', fmtMontant(e.montantSheet)]
      : ['', i + 1, e.mle, e.name, banque, e.rib || '', fmtMontant(e.montantSheet)];
    const r = ws.addRow(row);
    r.height = 18;
    for (let c = 2; c <= lastCol; c++) {
      const cell = r.getCell(c);
      cell.border = FULL_BORDER;
      if (c === 6) {
        // Colonne RIB — police Arial 10, comme le modèle
        cell.font = { name: 'Arial', size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (c === 4) {
        cell.font = { name: 'Times New Roman', size: 11 };
      } else {
        cell.font = { name: 'Times New Roman', size: 11 };
        cell.alignment = { horizontal: 'center' };
      }
    }
  });

  const totalRow = isBpm
    ? ['', '', '', '', '', '', 'TOTAL', '', fmtMontant(total)]
    : ['', '', '', '', '', 'TOTAL', fmtMontant(total)];
  const rTotal = ws.addRow(totalRow);
  rTotal.height = 19.5;
  for (let c = 2; c <= lastCol; c++) {
    rTotal.getCell(c).border = FULL_BORDER;
    rTotal.getCell(c).font = { name: 'Times New Roman', size: 12, bold: true };
  }

  ws.addRow([]);
  const rBlank2 = ws.addRow([]);
  rBlank2.height = 24;
  const rSign = ws.addRow(['', '', '', SOCIETE.signataire]);
  rSign.getCell(4).font = { name: 'Times New Roman', size: 14, bold: true, underline: true };

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
 * au format EXACT des "Ordres de virement" GSS (logo, polices, gras,
 * bordures, largeurs de colonnes, impression sur une seule page) — un onglet
 * par banque, plus un onglet récapitulatif.
 *
 * Règle congé GSS : un employé dont le congé démarre le MOIS SUIVANT voit son
 * salaire de CE mois DOUBLÉ ; un employé en congé CE mois-ci est EXCLU du
 * virement (déjà payé en double le mois précédent).
 */
export async function exportEmployesPresentsExcel(opts: {
  month: string; // "YYYY-MM"
  employees: Employee[];
  leaves: LeaveRecord[];
  ordreBase?: string; // ex: "020/DG/GSS/2026" — incrémenté automatiquement par banque
  dateStr?: string; // ex: "17/07/2026" — défaut : aujourd'hui
  fileName?: string;
}) {
  const { month, employees, leaves } = opts;
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, 1);
  const end = new Date(y, m || 1, 0, 23, 59, 59);

  // Mois suivant (M+1) — sert à détecter qui PART EN CONGÉ le mois prochain,
  // pour doubler son salaire CE mois-ci.
  const nextStart = new Date(y, m || 1, 1);
  const nextEnd = new Date(y, (m || 1) + 1, 0, 23, 59, 59);

  const overlaps = (l: LeaveRecord, rangeStart: Date, rangeEnd: Date) => {
    if (!l.dateDebut || !l.dateFin) return false;
    const d1 = new Date(l.dateDebut);
    const d2 = new Date(l.dateFin);
    return d1 <= rangeEnd && d2 >= rangeStart;
  };

  const onLeaveIds = new Set(leaves.filter((l) => overlaps(l, start, end)).map((l) => l.employeeId));
  const doublingIds = new Set(leaves.filter((l) => overlaps(l, nextStart, nextEnd)).map((l) => l.employeeId));

  const present = employees
    .filter((e) => e.actif !== false && !onLeaveIds.has(e.id))
    .map((e) => {
      const conge_double = doublingIds.has(e.id);
      return { ...e, montant: conge_double ? (e.montant ?? 0) * 2 : e.montant, conge_double };
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

  // Onglet récapitulatif complet (avec logo aussi, + colonne Remarque congé)
  const wsAll = workbook.addWorksheet(`Récap ${motifMois}`.slice(0, 31));
  wsAll.columns = [
    { width: 7 }, { width: 8 }, { width: 30 }, { width: 16 }, { width: 12 },
    { width: 18 }, { width: 10 }, { width: 26 }, { width: 14 }, { width: 32 },
  ];
  wsAll.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 220, height: 87 } });
  for (let i = 0; i < 6; i++) wsAll.addRow([]);
  const rHeadAll = wsAll.addRow([
    'Ordre', 'Mle', 'Nom et prénom', 'Poste', 'Ville', 'Équipe', 'Banque', 'RIB / N° compte', 'Montant (MRU)', 'Remarque',
  ]);
  rHeadAll.eachCell((cell) => {
    cell.font = { name: 'Times New Roman', size: 12, bold: true };
    cell.alignment = { horizontal: 'center' };
    cell.border = FULL_BORDER;
  });
  present.forEach((e, i) => {
    const r = wsAll.addRow([
      i + 1,
      e.mle,
      e.name,
      e.poste || '',
      e.ville || '',
      e.equipeNom || '',
      e.banque || 'Caisse',
      e.rib || '',
      e.montant ?? '',
      e.conge_double ? 'Congé le mois prochain — salaire doublé' : '',
    ]);
    r.eachCell((cell) => (cell.border = FULL_BORDER));
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