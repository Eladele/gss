const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const TEENS = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix sept', 'dix huit', 'dix neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre vingt', ''];

function words0to99(n: number): string {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]} ${UNITS[u]}`;
  }
  if (n < 80) { // 70-79
    const u = n - 60;
    if (u === 11) return 'soixante et onze';
    return `soixante ${TEENS[u - 10]}`;
  }
  // 80-99
  const u = n - 80;
  if (u === 0) return 'quatre vingts';
  if (u < 10) return `quatre vingt ${UNITS[u]}`;
  return `quatre vingt ${TEENS[u - 10]}`;
}

function words0to999(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100), rest = n % 100;
  const parts: string[] = [];
  if (h > 0) {
    if (h === 1) parts.push('cent');
    else parts.push(`${UNITS[h]} cent${rest === 0 ? 's' : ''}`);
  }
  if (rest > 0) parts.push(words0to99(rest));
  return parts.join(' ');
}

/** Convertit un montant entier (MRU) en toutes lettres, style "Cent Cinquante Deux Mille Sept Cent Dix Huit" */
export function numberToFrenchWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zéro';

  const milliards = Math.floor(n / 1_000_000_000); n %= 1_000_000_000;
  const millions  = Math.floor(n / 1_000_000);      n %= 1_000_000;
  const milliers   = Math.floor(n / 1000);           n %= 1000;
  const reste      = n;

  const parts: string[] = [];
  if (milliards) parts.push(`${milliards === 1 ? '' : words0to999(milliards) + ' '}milliard${milliards > 1 ? 's' : ''}`.trim());
  if (millions)  parts.push(`${millions === 1 ? 'un' : words0to999(millions)} million${millions > 1 ? 's' : ''}`);
  if (milliers)  parts.push(milliers === 1 ? 'mille' : `${words0to999(milliers)} mille`);
  if (reste)     parts.push(words0to999(reste));

  const sentence = parts.join(' ').replace(/\s+/g, ' ').trim();
  return sentence.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
