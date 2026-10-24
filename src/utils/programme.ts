// Libellés et couleurs communs aux pages Programme et Distribution
export const NATURE_LABEL = { derangement: 'Dérangement', installation: 'Installation' } as const;
export const NATURE_CLASS = {
  derangement: 'bg-orange-50 text-orange-800 border-orange-200',
  installation: 'bg-sky-50 text-sky-800 border-sky-200',
} as const;
export const STATUT_OT = {
  a_faire: { label: 'À faire', cls: 'bg-slate-100 text-slate-600 border-slate-200', border: 'border-l-slate-300' },
  fait: { label: 'Fait', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', border: 'border-l-emerald-500' },
  non_fait: { label: 'Non fait', cls: 'bg-red-50 text-red-700 border-red-200', border: 'border-l-red-500' },
} as const;

/** 49617103 → « 49 61 71 03 » (plus lisible au téléphone) */
export const fmtTel = (t: string) => t.replace(/(\d{2})(?=\d)/g, '$1 ');
