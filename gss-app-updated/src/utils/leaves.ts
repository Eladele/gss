import * as XLSX from 'xlsx';
import type { Employee, LeaveRecord } from '@/types';
import { numberToFrenchWords } from './numberToWordsFr';

const BANQUES_ORDER = ['BPM', 'Caisse', 'SGM'];
const SOCIETE = {
  siege: 'Siège social : Nouakchott, K.Ext SOCOGIM  873 2E A1',
  rc: 'RC N° : analytique:75781 chrono: 1522',
  nif: 'NIF : 21104523',
  destinataire: 'Monsieur Le Directeur Général de Banque Populaire Mauritanie',
  compte: 'Par le débit de notre compte n° 1005194, veuillez virer la somme :',
  signataire: 'MOHAMED YAHYA LIMAM',
};

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

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
 * Construit une feuille "Ordre de virement" (même en-tête et mise en page que
 * les documents GSS) pour une banque donnée, avec les employés présents (non
 * en congé) de ce mois.
 */
function buildVirementSheet(opts: {
  banque: string;
  employees: (Employee & { montantSheet: number })[];
  ordreNum: string;
  dateStr: string;
  motifMois: string;
}) {
  const { banque, employees, ordreNum, dateStr, motifMois } = opts;
  const isBpm = banque === 'BPM';
  const total = employees.reduce((s, e) => s + (e.montantSheet || 0), 0);

  const rows: (string | number)[][] = [];
  rows.push(['GSS']);
  rows.push([SOCIETE.siege]);
  rows.push([SOCIETE.rc]);
  rows.push([SOCIETE.nif]);
  rows.push([]);
  rows.push(['', '', '', '', 'Nouakchott,', `le ${dateStr}`]);
  rows.push([]);
  rows.push(['', `ORDRE DE VIREMENT N° ${ordreNum}`]);
  rows.push([]);
  rows.push(['A']);
  rows.push([SOCIETE.destinataire]);
  rows.push([SOCIETE.compte, '', '', '', fmtMontant(total), 'MRU']);
  rows.push(['En chiffres :', '', '', '', fmtMontant(total), 'MRU']);
  rows.push(['En lettres :', `${numberToFrenchWords(total)} MRU`]);
  rows.push([`Motif : Paiement employés pour le mois de ${motifMois}`]);
  rows.push(['En faveur de nos employés conformément au tableau suivant :']);
  rows.push(['Nombre', employees.length]);
  rows.push([]);

  const headerRowIdx = rows.length; // 0-based index of header row (pour merges/largeurs)
  if (isBpm) {
    rows.push(['Ordre', 'Mle', 'NOM et PRENOM', 'Banque', 'Numéro de compte', 'Clé RIB', 'Montant (MRU)']);
    employees.forEach((e, i) => rows.push([i + 1, e.mle, e.name, banque, e.rib || '', '', fmtMontant(e.montantSheet)]));
    rows.push(['', '', '', '', '', 'TOTAL', fmtMontant(total)]);
  } else {
    rows.push(['Ordre', 'Mle', 'NOM et PRENOM', 'Banque', 'RIB', 'Montant (MRU)']);
    employees.forEach((e, i) => rows.push([i + 1, e.mle, e.name, banque, e.rib || '', fmtMontant(e.montantSheet)]));
    rows.push(['', '', '', '', 'TOTAL', fmtMontant(total)]);
  }
  rows.push([]);
  rows.push([]);
  rows.push([SOCIETE.signataire]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = isBpm
    ? [{ wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }]
    : [{ wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 10 }, { wch: 26 }, { wch: 14 }];
  ws['!merges'] = [
    { s: { r: 7, c: 1 }, e: { r: 7, c: isBpm ? 5 : 4 } }, // titre "ORDRE DE VIREMENT..."
    { s: { r: headerRowIdx - 6, c: 0 }, e: { r: headerRowIdx - 6, c: isBpm ? 6 : 5 } }, // "En faveur de nos employés..."
  ];
  return ws;
}

/**
 * Exporte, pour un mois donné, la liste des employés QUI NE SONT PAS EN CONGÉ,
 * au même format que les "Ordres de virement" GSS (en-tête société, motif,
 * tableau Ordre/Mle/Nom/Banque/RIB/Montant, total, signature) — un onglet par banque.
 */
export function exportEmployesPresentsExcel(opts: {
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

  const onLeaveIds = new Set(
    leaves
      .filter((l) => {
        if (!l.dateDebut || !l.dateFin) return false;
        const d1 = new Date(l.dateDebut);
        const d2 = new Date(l.dateFin);
        return d1 <= end && d2 >= start;
      })
      .map((l) => l.employeeId),
  );

  const present = employees.filter((e) => e.actif !== false && !onLeaveIds.has(e.id));
  const motifMois = `${MOIS_FR[(m || 1) - 1]} ${y}`;
  const dateStr = opts.dateStr ?? new Date().toLocaleDateString('fr-FR');
  const ordreBase = opts.ordreBase ?? '001/DG/GSS/2026';

  const banquesPresentes = [...new Set(present.map((e) => e.banque || 'Caisse'))].sort(
    (a, b) => BANQUES_ORDER.indexOf(a) - BANQUES_ORDER.indexOf(b),
  );

  const wb = XLSX.utils.book_new();
  banquesPresentes.forEach((banque, idx) => {
    const rows = present.filter((e) => (e.banque || 'Caisse') === banque).map((e) => ({ ...e, montantSheet: e.montant ?? 0 }));
    const ws = buildVirementSheet({
      banque,
      employees: rows,
      ordreNum: nextOrdre(ordreBase, idx),
      dateStr,
      motifMois,
    });
    XLSX.utils.book_append_sheet(wb, ws, banque.slice(0, 31));
  });

  // Onglet récapitulatif complet
  const wsAll = XLSX.utils.json_to_sheet(
    present.map((e, i) => ({
      Ordre: i + 1,
      Mle: e.mle,
      'Nom et prénom': e.name,
      Poste: e.poste || '',
      Ville: e.ville || '',
      Équipe: e.equipeNom || '',
      Banque: e.banque || 'Caisse',
      'RIB / N° compte': e.rib || '',
      'Montant (MRU)': e.montant ?? '',
    })),
  );
  wsAll['!cols'] = [{ wch: 7 }, { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 26 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsAll, `Récap ${motifMois}`.slice(0, 31));

  XLSX.writeFile(wb, opts.fileName ?? `Ordre_virement_${month}.xlsx`);
}
