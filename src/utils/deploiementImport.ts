import ExcelJS from 'exceljs';

// ═══════════════════════════════════════════════════════════════════════════
// Import du fichier "Avancement de déploiement" (.xlsx) — met à jour les
// valeurs "posé/fait" d'un chantier. Détecte automatiquement le mode (aérien
// si pas de colonne blocage/tranchée, souterrain sinon) et la zone (depuis le
// titre "...Zone XXXX...").
// ═══════════════════════════════════════════════════════════════════════════
export interface AvancementParsed {
  zone: string | null;
  typeDeploiement: 'aerien' | 'souterrain';
  poteaux: number;
  tranchee: number;
  blocage: number;
  ouverture: number;
  closerMpo: number;
  closerDis: number;
  xBox: number;
  hubBox: number;
  subBox: number;
  endBox: number;
  cableMpo: number;
  cableDistribution: number;
}

export async function parseAvancementExcel(file: File): Promise<AvancementParsed> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  const data: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    data.push((row.values as unknown[]).slice(1));
  });

  // Le titre (ex: "Avancement ODN Airpon/Zone CA3Z05/NOUAKCHOTT/OLT/(GSS)") peut
  // occuper 1 à plusieurs lignes fusionnées selon le fichier — on le cherche
  // dans toutes les lignes avant l'en-tête plutôt que de supposer sa position.
  let zone: string | null = null;
  for (const row of data) {
    const text = row.map((v) => String(v ?? '')).join(' ');
    const zm = text.match(/Zone\s+([A-Z0-9]+)/i);
    if (zm) {
      zone = zm[1].toUpperCase();
      break;
    }
  }

  // La ligne d'en-tête n'est pas toujours à un index fixe (dépend du nombre de
  // lignes de titre fusionnées) — on cherche la ligne dont la 1ère cellule vaut
  // exactement "date".
  const headerIdx = data.findIndex((row) => String(row[0] ?? '').trim().toLowerCase() === 'date');
  if (headerIdx === -1) {
    throw new Error('Colonne "Date" introuvable — format de fichier non reconnu');
  }
  const header = data[headerIdx].map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase(),
  );
  const col = (needle: string) => header.findIndex((h) => h.includes(needle));
  const cDate = col('date');
  const cPoteau = col('poteau');
  const cBlocage = col('blocage');
  const cOuverture = col('ouverture');
  const cTranche = col('tranch');
  const cXBox = col('x-box');
  const cCloserMpo = col('closer-mpo');
  const cHubBox = col('hub-box');
  const cCloserDis = col('closer-dis');
  const cSubBox = col('sub-box');
  const cEndBox = col('end-box');
  const cCableMpo = col('transport mpo');
  const cCableDis = col('distibition') >= 0 ? col('distibition') : col('distribution');

  const typeDeploiement: 'aerien' | 'souterrain' = cTranche >= 0 || cBlocage >= 0 ? 'souterrain' : 'aerien';

  const sums = {
    poteaux: 0,
    tranchee: 0,
    blocage: 0,
    ouverture: 0,
    closerMpo: 0,
    closerDis: 0,
    xBox: 0,
    hubBox: 0,
    subBox: 0,
    endBox: 0,
    cableMpo: 0,
    cableDistribution: 0,
  };

  // ExcelJS renvoie les cellules formule sous la forme { formula, result } au
  // lieu d'un nombre brut — le fichier réel en contient (ex: le Poteau d'une
  // ligne calculé par "564-252").
  const asNumber = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && 'result' in v && typeof (v as any).result === 'number') return (v as any).result;
    return 0;
  };
  const num = (row: unknown[], c: number) => (c >= 0 ? asNumber(row[c]) : 0);

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const dateVal = cDate >= 0 ? row[cDate] : undefined;
    if (dateVal === undefined || dateVal === null || dateVal === '') continue;
    const label = String(dateVal).toLowerCase();
    // On ignore les lignes "Totale"/"Taux d'avancement" du fichier — on recalcule
    // nous-mêmes en sommant les vraies lignes journalières, plus fiable (le
    // fichier réel laisse parfois blocage/ouverture/tranché vides sur sa ligne Totale).
    if (label.includes('total') || label.includes('taux')) continue;

    sums.poteaux += num(row, cPoteau);
    sums.tranchee += num(row, cTranche);
    sums.blocage += num(row, cBlocage);
    sums.ouverture += num(row, cOuverture);
    sums.closerMpo += num(row, cCloserMpo);
    sums.closerDis += num(row, cCloserDis);
    sums.xBox += num(row, cXBox);
    sums.hubBox += num(row, cHubBox);
    sums.subBox += num(row, cSubBox);
    sums.endBox += num(row, cEndBox);
    sums.cableMpo += num(row, cCableMpo);
    sums.cableDistribution += num(row, cCableDis);
  }

  return { zone, typeDeploiement, ...sums };
}

// ═══════════════════════════════════════════════════════════════════════════
// Import du design réseau (.kml ou .kmz) — donne les valeurs "prévu/cible"
// d'un chantier : poteaux (B1+B2+C1+C2, PAS D1/D2 — poteaux du drop cable,
// hors périmètre déploiement), boîtiers, câbles MPO/Distribution (longueur
// calculée depuis les coordonnées GPS).
// ═══════════════════════════════════════════════════════════════════════════
export interface KmlParsed {
  zone: string | null;
  poteauxPrevus: number;
  xBoxPrevus: number;
  hubBoxPrevus: number;
  subBoxPrevus: number; // Le KML ne distingue pas SUB-BOX/END-BOX — total combiné, à ajuster si besoin
  cableMpoPrevuM: number;
  cableDistributionPrevuM: number;
}

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLmb = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLmb / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function lineLengthM(coordText: string): number {
  const pts = coordText
    .trim()
    .split(/\s+/)
    .map((tok) => tok.split(',').map(Number))
    .filter((p) => p.length >= 2 && !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineM(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
  return total;
}

function directChildText(el: Element, tag: string): string | null {
  for (let i = 0; i < el.children.length; i++) {
    if (el.children[i].tagName === tag) return el.children[i].textContent;
  }
  return null;
}

function directChildren(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === tag);
}

function normalizeFolderName(name: string): string {
  return name.toLowerCase().replace(/[_\-\s]/g, '');
}

function allFolders(doc: Document): { el: Element; name: string; norm: string }[] {
  return Array.from(doc.getElementsByTagName('Folder')).map((el) => {
    const name = directChildText(el, 'name') ?? '';
    return { el, name, norm: normalizeFolderName(name) };
  });
}

function countDirectPlacemarks(folder: Element | null): number {
  return folder ? directChildren(folder, 'Placemark').length : 0;
}

function sumCableLength(folder: Element | null): number {
  if (!folder) return 0;
  let total = 0;
  for (const pm of directChildren(folder, 'Placemark')) {
    const coordEls = pm.getElementsByTagName('coordinates');
    for (let i = 0; i < coordEls.length; i++) {
      total += lineLengthM(coordEls[i].textContent ?? '');
    }
  }
  return Math.round(total);
}

// Les fichiers KML/KMZ de différents projets n'utilisent pas les mêmes noms de
// dossiers ("SUB_BOX" vs "SUBS", "Distribution Cable" vs "Distribution_cable"...)
// — on cherche donc par mot-clé plutôt que par nom exact. Les valeurs trouvées
// sont toujours présentées pour vérification/correction manuelle avant import,
// car cette détection reste une estimation.
function findFoldersContaining(doc: Document, ...keywords: string[]): Element[] {
  return allFolders(doc)
    .filter((f) => keywords.some((k) => f.norm.includes(k)))
    .map((f) => f.el);
}

// La zone n'est pas fiablement présente dans le contenu du KML (les boîtiers y
// sont souvent nommés juste "X1"/"H2", sans préfixe de zone — ce préfixe n'est
// ajouté que dans l'affichage du schéma PDF). On tente une détection depuis le
// nom du fichier à titre d'indice, mais elle reste toujours à confirmer/
// corriger manuellement dans l'aperçu d'import.
function detectZoneFromFileName(fileName: string): string | null {
  const m = fileName.match(/\b([A-Z]{2,4}\d[A-Z]\d{2})\b/i);
  return m ? m[1].toUpperCase() : null;
}

export async function parseKmlOrKmz(file: File): Promise<KmlParsed> {
  let kmlText: string;
  if (file.name.toLowerCase().endsWith('.kmz')) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.kml'));
    if (!entry) throw new Error("Aucun fichier .kml trouvé à l'intérieur de ce .kmz");
    kmlText = await entry.async('text');
  } else {
    kmlText = await file.text();
  }

  const doc = new DOMParser().parseFromString(kmlText, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Fichier KML invalide ou corrompu');
  }

  // Poteaux : tous les dossiers dont le nom contient "pole", en excluant ceux
  // liés au drop cable (branchement final client, hors périmètre déploiement).
  const poleFolders = findFoldersContaining(doc, 'pole').filter((f) => {
    const name = normalizeFolderName(directChildText(f, 'name') ?? '');
    return !name.includes('drop');
  });
  const poteauxPrevus = poleFolders.reduce((sum, f) => sum + countDirectPlacemarks(f), 0);

  const xBoxFolders = findFoldersContaining(doc, 'xbox');
  const hubBoxFolders = findFoldersContaining(doc, 'hubbox', 'hubs');
  const subBoxFolders = findFoldersContaining(doc, 'subbox', 'subs');
  const feederFolders = findFoldersContaining(doc, 'feeder');
  const distribFolders = findFoldersContaining(doc, 'distribution');

  return {
    zone: detectZoneFromFileName(file.name),
    poteauxPrevus,
    xBoxPrevus: xBoxFolders.reduce((s, f) => s + countDirectPlacemarks(f), 0),
    hubBoxPrevus: hubBoxFolders.reduce((s, f) => s + countDirectPlacemarks(f), 0),
    subBoxPrevus: subBoxFolders.reduce((s, f) => s + countDirectPlacemarks(f), 0),
    cableMpoPrevuM: feederFolders.reduce((s, f) => s + sumCableLength(f), 0),
    cableDistributionPrevuM: distribFolders.reduce((s, f) => s + sumCableLength(f), 0),
  };
}