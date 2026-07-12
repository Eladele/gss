import type { SituationStatus, SituationType } from '@/types';

// Color palette for equipes (fallback if not in DB)
const FALLBACK_COLORS: Record<string, string> = {
  hamadi: '#2E7D32',
  tiam:   '#1565C0',
  'mohamed dahmed': '#E65100',
  djiby:  '#6A1B9A',
  med:    '#E65100',
  sidi:   '#00838F',
};

export function getEquipeColor(name: string, equipes?: Array<{name: string; color: string}>): string {
  if (equipes) {
    const eq = equipes.find(e => e.name.toLowerCase() === name?.toLowerCase());
    if (eq) return eq.color;
  }
  return FALLBACK_COLORS[name?.toLowerCase()] ?? '#546E7A';
}

export function statusLabel(status: SituationStatus): string {
  const map: Record<SituationStatus, string> = {
    pending: 'En attente', in_progress: 'En cours',
    ok: 'OK', non_ok: 'NON OK', urgent: 'Urgent',
  };
  return map[status] ?? status;
}

export function statusColors(status: SituationStatus) {
  const map: Record<SituationStatus, { bg: string; text: string; border: string }> = {
    pending:     { bg: 'bg-slate-100',   text: 'text-slate-600',  border: 'border-slate-300' },
    in_progress: { bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-300'  },
    ok:          { bg: 'bg-green-100',   text: 'text-green-800',  border: 'border-green-300' },
    non_ok:      { bg: 'bg-red-100',     text: 'text-red-800',    border: 'border-red-300'   },
    urgent:      { bg: 'bg-orange-100',  text: 'text-orange-800', border: 'border-orange-300'},
  };
  return map[status] ?? map.pending;
}

export function typeColors(type: SituationType) {
  const map: Record<string, { bg: string; text: string }> = {
    CPL: { bg: 'bg-blue-100',   text: 'text-blue-800'   },
    DRG: { bg: 'bg-purple-100', text: 'text-purple-800' },
    TRL: { bg: 'bg-amber-100',  text: 'text-amber-800'  },
    CST: { bg: 'bg-emerald-100',text: 'text-emerald-800'},
    ANS: { bg: 'bg-pink-100',   text: 'text-pink-800'   },
    CLS: { bg: 'bg-teal-100',   text: 'text-teal-800'   },
    CMI: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    RLR: { bg: 'bg-cyan-100',   text: 'text-cyan-800'   },
  };
  return map[type] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };
}

export function statusBorderColor(status: SituationStatus): string {
  const map: Record<SituationStatus, string> = {
    pending: 'border-l-slate-300', in_progress: 'border-l-blue-500',
    ok: 'border-l-green-500', non_ok: 'border-l-red-500', urgent: 'border-l-orange-500',
  };
  return map[status] ?? 'border-l-slate-300';
}
