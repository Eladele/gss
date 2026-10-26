// Lecture des fiches OT Mauritel (PDF « OT Dérangement » et « OT Réseau » d'installation).
// Le PDF est lu dans le navigateur (pdf.js) : rien n'est envoyé ailleurs que dans Supabase.

export type OtNature = 'derangement' | 'installation';

export interface ParsedOT {
  numeroOt: string; // "10/26 0103029"
  nature: OtNature;
  sousType: string; // "Création première ligne", "Transfert local", "Probleme de connexion"…
  typeOt: string; // CPL, CLS, TRL, RLR, CST, ANS ou DRG ('' si inconnu)
  typeLigne: 'FGP' | 'TPH'; // ligne fibre (FGP) ou téléphone (TPH)
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
  cableFibreM: number | null; // installation : longueur de câble fibre prévue (m)
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

/** Regroupe les morceaux de texte par ligne (même ordonnée) et les place à leur colonne,
 *  comme sur la fiche imprimée (police à chasse fixe) : on sait ainsi ce qui est dans
 *  la colonne « NOUVELLE CONSTITUTION ». Exporté pour pouvoir le tester hors navigateur. */
export function itemsToLines(items: TextItemLike[]): string[] {
  // largeur d'un caractère : médiane sur la page (≈ 6,5 pt sur les fiches Mauritel)
  const widths = items.filter((i) => i.str && i.str.trim().length > 2).map((i) => i.width / i.str.length).sort((a, b) => a - b);
  const cw = widths.length ? widths[Math.floor(widths.length / 2)] : 6.5;
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
      const col = Math.round(part.x / cw);
      if (out.length < col) out = out.padEnd(col, ' ');
      else if (out && part.x - end > 1) out += ' ';
      out += part.s;
      end = part.x + part.w;
    }
    return out.replace(/\s+$/, '');
  });
}

// ─── 2. Lignes → fiches OT ─────────────────────────────────────────────────
const RE_NO = /No\s+(\d{2}\/\d{2}\s+\d{5,9})/;
const RE_PHONE = /(?<!\d)(?:(?:\+|00)?222[\s.-]?)?[234]\d{7}(?!\d)/g;
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

  // N° de ligne : « Ligne : FGP 077490 » (dérangement), « Ligne ....: Fibre GPON 082151 »
  // (installation) ou « Ligne ....: Téléphone 45240200 » (TPH, ex. ajout de ligne / ANS)
  const tph = text.match(/Ligne\s*[.:]*\s*:?\s*T[ée]l[ée]phone\s+(\d{6,})/i)?.[1] ?? text.match(/\bTPH\s+(\d{6,})/i)?.[1];
  const fibre = text.match(/FGP\s+(\d{3,})/i)?.[1] ?? text.match(/GPON\s+(\d{3,})/i)?.[1];
  const typeLigne: 'FGP' | 'TPH' = !fibre && tph ? 'TPH' : 'FGP';
  const fgp = fibre ?? tph ?? '';
  if (!fgp) warnings.push('N° de ligne (FGP / TPH) introuvable');

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
  // numéros écrits dans l'adresse (« CONTACT 44469999 ») : ajoutés en dernier (normalisés à 8 chiffres)
  const normTel = (t: string) => t.replace(/^(?:\+|00)?222[\s.-]?/, '').replace(/\D/g, '');
  const telephones = uniq(
    [...(derLine.match(RE_PHONE) ?? []), ...(zoneContacts.match(RE_PHONE) ?? []), ...(adresse.match(RE_PHONE) ?? [])].map(normTel),
  ).filter((t) => t !== clientCode && t !== fgp);
  if (!telephones.length) warnings.push('Aucun numéro de téléphone');

  // DIS / ONT — en dérangement, deux colonnes : « ANCIENNE » (gauche) et « NOUVELLE »
  // constitution (droite). Seule la colonne de droite compte ; la gauche ne sert qu'à
  // signaler un changement de DIS.
  const iCons = find(/NOUVELLE\s+CONSTITUTION/i);
  const colDroite = iCons >= 0 ? block[iCons].search(/NOUVELLE/i) - 4 : -1;
  const consLines = iCons >= 0 ? block.slice(iCons + 1) : block;
  const scan = (re: RegExp) =>
    consLines.flatMap((l) => [...l.matchAll(new RegExp(re.source, 'gi'))].map((m) => ({ m, droite: colDroite < 0 || (m.index ?? 0) >= colDroite })));
  const toDis = (m: RegExpMatchArray) => ({ full: `${m[1].toUpperCase()}${m[2]}-${m[3]}`, zone: m[1].toUpperCase(), pco: m[2], port: m[3] });
  const disAll = scan(RE_DIS);
  const disRef = disAll.filter((d) => d.droite).pop() ?? disAll[disAll.length - 1];
  const nouveau = disRef ? toDis(disRef.m) : undefined;
  const ancienM = disAll.find((d) => !d.droite);
  const ancien = ancienM ? toDis(ancienM.m) : undefined;
  if (!nouveau) warnings.push('DIS introuvable');
  const ontAll = scan(RE_ONT);
  const ontDroite = ontAll.filter((o) => o.droite);
  const ontSerials = uniq((ontDroite.length ? ontDroite : ontAll).map((o) => o.m[1].toUpperCase()));
  if (!ontSerials.length) warnings.push('Numéro de série ONT introuvable');

  const zone = nouveau?.zone ?? adresse.match(RE_ZONE)?.[1]?.toUpperCase() ?? '';
  if (!zone) warnings.push('Zone introuvable');

  // Câble fibre (installation) : « Cable fibre obtique   100 » dans les articles prévus sur devis,
  // ou « 150 metres » sous SERVICES SUPPLEMENTAIRES
  let cableFibreM: number | null = null;
  if (!isDer) {
    const art = text.match(/C[aâ]ble\s+(?:de\s+)?fibre\s+o\w*\s+(\d{1,4})\b/i);
    const iServ = find(/SERVICES\s+SUPPL/i);
    const iFin = find(/CONSTITUTION|Mise\s+en\s+service/i);
    const serv = iServ >= 0 ? block.slice(iServ, iFin > iServ ? iFin : undefined).join('\n') : '';
    const met = serv.match(/(?<![\d/])(\d{1,4})\s*(?:m[eè]tres?|ml|m)\b/i);
    const v = Number(art?.[1] ?? met?.[1]);
    cableFibreM = v > 0 ? v : null;
  }

  const defaut = isDer ? clean(text.match(/D[ée]faut\s+constat[ée]\s*:\s*(.*?)(?:\s+depuis\b|\n|$)/i)?.[1] ?? '') : '';
  const sousType = isDer
    ? defaut || 'Dérangement'
    : clean(block[0].match(/OT\s+R[ée]seau\s*:\s*(.+)$/i)?.[1] ?? 'Installation');

  return {
    numeroOt,
    nature,
    sousType,
    typeOt: isDer ? 'DRG' : typeOtFrom(sousType),
    typeLigne,
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
    abonnement: clean(text.match(/Nature\s+abonnement\s*:\s*(.+)/i)?.[1] ?? ''),
    cableFibreM,
    miseEnService: clean(text.match(/Mise\s+en\s+service\s+le\s+(.+)/i)?.[1] ?? ''),
    warnings,
  };
}

/** « Création première ligne » → CPL, « Ajout nouvelle ligne » → CLS, etc. */
export function typeOtFrom(sousType: string): string {
  const s = sousType.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/creation\s+premi/.test(s)) return 'CPL';
  if (/re-?creation|resili/.test(s)) return 'RLR';
  if (/ajout\s+(nouvelle\s+)?ligne/.test(s)) return 'CLS';
  if (/transfert/.test(s)) return 'TRL';
  if (/changement\s+(de\s+)?constitution|\bconstitution\b/.test(s)) return 'CST';
  if (/numero\s+suppl|ajout\s+num|supplementaire/.test(s)) return 'ANS';
  return '';
}

/** Lit un fichier PDF et renvoie ses fiches OT. */
export async function parseOtPdf(file: File): Promise<ParsedOT[]> {
  const lines = await pdfToLines(await file.arrayBuffer());
  return parseOtLines(lines);
}

/** Message WhatsApp du programme d'une équipe (à coller dans le groupe de l'équipe). */
export function programmeWhatsApp(
  equipe: string,
  date: string,
  ots: Pick<ParsedOT, 'nature' | 'fgp' | 'clientNom' | 'telephones' | 'dis' | 'ontSerials' | 'adresse' | 'sousType' | 'cableFibreM' | 'typeOt' | 'typeLigne'>[],
): string {
  const d = date.split('-').reverse().join('/');
  const der = ots.filter((o) => o.nature === 'derangement');
  const ins = ots.filter((o) => o.nature === 'installation');
  const line = (o: (typeof ots)[number], i: number) =>
    [
      `${i + 1}. ${o.typeLigne || 'FGP'} ${o.fgp}${o.typeOt ? ' (' + o.typeOt + ')' : ''} — ${o.clientNom}`,
      o.telephones.length ? `   Tél : ${o.telephones.join(' / ')}` : '',
      `   ${o.dis ? 'DIS ' + o.dis : ''}${o.ontSerials[0] ? ' · ONT ' + o.ontSerials[0] : ''}`,
      o.nature === 'derangement' && o.sousType ? `   Défaut : ${o.sousType}` : '',
      o.nature === 'installation' && o.cableFibreM ? `   Câble fibre : ${o.cableFibreM} m` : '',
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
