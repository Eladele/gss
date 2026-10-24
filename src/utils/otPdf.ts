// Lecture des fiches OT Mauritel (PDF « OT Dérangement » et « OT Réseau » d'installation).
// Le PDF est lu dans le navigateur (pdf.js) : rien n'est envoyé ailleurs que dans Supabase.

export type OtNature = 'derangement' | 'installation';

export interface ParsedOT {
  numeroOt: string; // "10/26 0103029"
  nature: OtNature;
  sousType: string; // "Création première ligne", "Transfert local", "Probleme de connexion"…
  dateRecu: string | null; // YYYY-MM-DD
  fgp: string; // numéro de ligne (FGP)
  clientCode: string;
  clientNom: string;
  clientInfo: string; // lignes libres sous le nom (ex. « ARAFAT », « p/44555555 »)
  telephones: string[]; // numéros à appeler, le plus utile en premier
  adresse: string;
  zone: string; // CA1Z04 — tirée du DIS, sinon de l'adresse
  pco: string; // 2611/1
  port: string; // 4
  dis: string; // DIS complet : CA1Z042611/1-4
  ancienDis: string; // dérangement : DIS « ancienne constitution » s'il diffère
  ontSerials: string[]; // 48575443B2FCC9AE
  defaut: string; // dérangement : défaut constaté
  abonnement: string; // installation : « Abonnement FTTH 100 Mbps »
  cableFibreM: number | null; // installation : longueur du câble fibre en mètres
  miseEnService: string; // installation : « 21/10/26 à 10:40 »
  warnings: string[]; // champs introuvables, à vérifier
}

// ─── 1. PDF → lignes de texte (reconstruit la mise en page ligne par ligne) ────
export async function pdfToLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items as TextItemLike[]));
  }
  await doc.destroy();
  return lines;
}

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height?: number;
}

/** Regroupe les morceaux de texte par ligne (même ordonnée), puis de gauche à droite.
 *  Exporté pour pouvoir le tester hors navigateur. */
export function itemsToLines(items: TextItemLike[]): string[] {
  const rows: { y: number; parts: { x: number; w: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, w: it.width, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y); // haut de page d'abord
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = '';
    let end = -Infinity;
    for (const part of r.parts) {
      const gap = part.x - end;
      if (out) out += gap > 12 ? '    ' : gap > 1 ? ' ' : '';
      out += part.s;
      end = part.x + part.w;
    }
    return out.replace(/\s+$/, '');
  });
}

// ─── 2. Lignes → fiches OT ─────────────────────────────────────────────────
const RE_NO = /No\s+(\d{2}\/\d{2}\s+\d{5,9})/;
const RE_PHONE = /(?<!\d)[234]\d{7}(?!\d)/g;
const RE_ZONE = /\b([A-Z]{2}\d[A-Z]\d{2})/i;
const RE_DIS = /DIS\s+([A-Z]{2}\d[A-Z]\d{2})(\d+\/\d+)-(\d+)/gi;
const RE_ONT = /ONT\s+([0-9A-F]{12,16})\b/gi;

function toIsoDate(d: string): string | null {
  const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const uniq = <T,>(a: T[]) => [...new Set(a)];

/** Découpe le texte en fiches : chaque OT a un et un seul « No 10/26 0103029 ». */
export function parseOtLines(lines: string[]): ParsedOT[] {
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (RE_NO.test(l)) {
      // L'en-tête « OT Réseau : … » / « OT Dérangement » est juste au-dessus
      const prev = i > 0 ? lines[i - 1] : '';
      starts.push(/^\s*OT\b/.test(prev) && !RE_NO.test(prev) ? i - 1 : i);
    }
  });
  return starts.map((s, k) => parseBlock(lines.slice(s, k + 1 < starts.length ? starts[k + 1] : lines.length)));
}

function parseBlock(block: string[]): ParsedOT {
  const text = block.join('\n');
  const warnings: string[] = [];
  const find = (re: RegExp) => block.findIndex((l) => re.test(l));

  const isDer = /D[ée]rangement|D[ée]faut constat|Contact d[ée]rangement/i.test(text) && !/OT\s+R[ée]seau/i.test(text);
  const nature: OtNature = isDer ? 'derangement' : 'installation';

  const numeroOt = clean(text.match(RE_NO)?.[1] ?? '');
  const dateRecu = toIsoDate(text.match(/OT\s+re[çc]u\s+le\s+([\d/]+)/i)?.[1] ?? '');

  // FGP : « Ligne : FGP 077490 » (dérangement) ou « Ligne ....: Fibre GPON 082151 » (installation)
  const fgp = text.match(/FGP\s+(\d{3,})/i)?.[1] ?? text.match(/GPON\s+(\d{3,})/i)?.[1] ?? '';
  if (!fgp) warnings.push('FGP introuvable');

  // Client : code + nom sur la même ligne, infos libres sur les lignes suivantes
  const iClient = find(/^\s*Client\s*:/i);
  let clientCode = '';
  let clientNom = '';
  const infoLines: string[] = [];
  if (iClient >= 0) {
    const m = block[iClient].match(/Client\s*:\s*(\d+)\s+(.+)$/i);
    clientCode = m?.[1] ?? '';
    clientNom = clean(m?.[2] ?? block[iClient].replace(/^\s*Client\s*:/i, ''));
    for (let i = iClient + 1; i < block.length && !/^\s*(Contact|Type de Ligne|Utilisateur)/i.test(block[i]); i++) {
      if (block[i].trim()) infoLines.push(clean(block[i]));
    }
  } else warnings.push('Client introuvable');

  // Téléphones : « Contact dérangement » d'abord (le plus utile), puis GSM/TEL, puis notes du client
  const iUser = find(/^\s*Utilisateur\s*:/i);
  const zoneContacts = block.slice(Math.max(iClient, 0), iUser > 0 ? iUser : undefined).join('\n');
  const derLine = block.find((l) => /Contact\s+d[ée]rangement/i.test(l)) ?? '';
  const telephones = uniq([...(derLine.match(RE_PHONE) ?? []), ...(zoneContacts.match(RE_PHONE) ?? [])]).filter((t) => t !== clientCode);
  if (!telephones.length) warnings.push('Aucun numéro de téléphone');

  // Adresse : de « Adresse d'installation » jusqu'à la constitution / la ligne
  const iAdr = find(/Adresse\s+d.installation/i);
  const adr: string[] = [];
  if (iAdr >= 0) {
    const first = block[iAdr].replace(/.*Adresse\s+d.installation\s*:?/i, '');
    if (first.trim()) adr.push(clean(first));
    for (let i = iAdr + 1; i < block.length && !/CONSTITUTION|^\s*Ligne\s*\.|^\s*D[ée]faut/i.test(block[i]); i++) {
      if (block[i].trim()) adr.push(clean(block[i]));
    }
  }
  const adresse = adr.join(' · ');

  // DIS / ONT — en dérangement, colonnes « ancienne » et « nouvelle » constitution sur la même ligne
  const dis = [...text.matchAll(RE_DIS)].map((m) => ({ full: `${m[1].toUpperCase()}${m[2]}-${m[3]}`, zone: m[1].toUpperCase(), pco: m[2], port: m[3] }));
  const nouveau = dis[dis.length - 1];
  const ancien = dis[0];
  if (!nouveau) warnings.push('DIS introuvable');
  const ontSerials = uniq([...text.matchAll(RE_ONT)].map((m) => m[1].toUpperCase()));
  if (!ontSerials.length) warnings.push('Numéro de série ONT introuvable');

  const zone = nouveau?.zone ?? adresse.match(RE_ZONE)?.[1]?.toUpperCase() ?? '';
  if (!zone) warnings.push('Zone introuvable');

  const defaut = isDer ? clean(text.match(/D[ée]faut\s+constat[ée]\s*:\s*(.*?)(?:\s+depuis\b|\n|$)/i)?.[1] ?? '') : '';
  const sousType = isDer
    ? defaut || 'Dérangement'
    : clean(block[0].match(/OT\s+R[ée]seau\s*:\s*(.+)$/i)?.[1] ?? 'Installation');

  const cableMatch = text.match(/c[âa]ble(?:\s+fibre)?(?:\s+optique)?\s*[:.]?\s*(\d+)\s*(?:m\b|m[èe]tres?)?/i)
    ?? text.match(/longueur(?:\s+du)?\s+c[âa]ble\s*[:.]?\s*(\d+)/i)
    ?? text.match(/(\d+)\s*(?:m\b|m[èe]tres?)\s+(?:de\s+)?c[âa]ble/i);
  const cableFibreM = cableMatch ? parseInt(cableMatch[1], 10) : null;

  return {
    numeroOt,
    nature,
    sousType,
    dateRecu,
    fgp,
    clientCode,
    clientNom,
    clientInfo: infoLines.join(' · '),
    telephones,
    adresse,
    zone,
    pco: nouveau?.pco ?? '',
    port: nouveau?.port ?? '',
    dis: nouveau?.full ?? '',
    ancienDis: ancien && nouveau && ancien.full !== nouveau.full ? ancien.full : '',
    ontSerials,
    defaut,
    cableFibreM,
    abonnement: clean(text.match(/Nature\s+abonnement\s*:\s*(.+)/i)?.[1] ?? ''),
    miseEnService: clean(text.match(/Mise\s+en\s+service\s+le\s+(.+)/i)?.[1] ?? ''),
    warnings,
  };
}

/** Lit un fichier PDF et renvoie ses fiches OT. */
export async function parseOtPdf(file: File): Promise<ParsedOT[]> {
  const lines = await pdfToLines(await file.arrayBuffer());
  return parseOtLines(lines);
}

/** Message WhatsApp du programme d'une équipe (à coller dans le groupe de l'équipe). */
export function programmeWhatsApp(equipe: string, date: string, ots: Pick<ParsedOT, 'nature' | 'fgp' | 'clientNom' | 'telephones' | 'dis' | 'ontSerials' | 'adresse' | 'sousType'>[]): string {
  const d = date.split('-').reverse().join('/');
  const der = ots.filter((o) => o.nature === 'derangement');
  const ins = ots.filter((o) => o.nature === 'installation');
  const line = (o: (typeof ots)[number], i: number) =>
    [
      `${i + 1}. FGP ${o.fgp} — ${o.clientNom}`,
      o.telephones.length ? `   Tél : ${o.telephones.join(' / ')}` : '',
      `   ${o.dis ? 'DIS ' + o.dis : ''}${o.ontSerials[0] ? ' · ONT ' + o.ontSerials[0] : ''}`,
      o.nature === 'derangement' && o.sousType ? `   Défaut : ${o.sousType}` : '',
    ]
      .filter((x) => x.trim())
      .join('\n');
  return [
    `*Programme ${equipe} — ${d}*`,
    der.length ? `\n*Dérangements (${der.length})*\n${der.map(line).join('\n')}` : '',
    ins.length ? `\n*Installations (${ins.length})*\n${ins.map(line).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
