import { SIGNATURE_DG_BASE64 } from '@/assets/signature';

export const toDataUrl = (b64: string, mime = 'image/jpeg') =>
  b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;

/** Signature du DG (image JPEG convertie en data-URL base64) — utilisée par défaut */
export const DEFAULT_SIGNATURE = toDataUrl(SIGNATURE_DG_BASE64);

/** Signature enregistrée si elle existe, sinon la signature du DG */
export const resolveSignature = (s?: string | null) => s || DEFAULT_SIGNATURE;

/** Extension ExcelJS selon le type réel de l'image (data-URL ou base64 brut) */
export function imageExtension(b64: string): 'png' | 'jpeg' {
  if (b64.startsWith('data:image/png')) return 'png';
  if (b64.startsWith('data:')) return 'jpeg';
  return b64.startsWith('iVBOR') ? 'png' : 'jpeg';
}