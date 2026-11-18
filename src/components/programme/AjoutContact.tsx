import { useState } from 'react';
import { Check, Phone, Plus, X } from 'lucide-react';

/** Numéro saisi → 8 chiffres (sans 222 / +222 / espaces) */
const normaliserTel = (t: string) => {
  const d = t.replace(/\D/g, '');
  return /^(?:00)?222\d{8}$/.test(d) ? d.slice(-8) : d;
};
const telValide = (t: string) => /^[234]\d{7}$/.test(normaliserTel(t));

/**
 * « + Contact » : ajoute un numéro à la fiche après la distribution (il passe en premier dans
 * la liste des numéros de la ligne, pour toutes ses fiches).
 */
export function AjoutContact({ onAjouter, compact = false }: { onAjouter: (tel: string) => Promise<void>; compact?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = telValide(val);

  const valider = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await onAjouter(normaliserTel(val));
      setVal('');
      setOuvert(false);
    } catch {
      /* erreur affichée par la page */
    } finally {
      setBusy(false);
    }
  };

  if (!ouvert)
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={`inline-flex items-center gap-1 font-semibold text-blue-700 hover:bg-blue-50 rounded-md ${compact ? 'text-[11px] px-1.5 py-1' : 'text-xs px-2 py-1.5 border border-dashed border-blue-300'}`}
      >
        <Plus className="w-3.5 h-3.5" /> Contact
      </button>
    );

  return (
    <span className="inline-flex items-center gap-1">
      <span className="relative">
        <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          autoFocus
          inputMode="tel"
          aria-label="Nouveau contact"
          placeholder="44 38 05 34"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') valider();
            if (e.key === 'Escape') setOuvert(false);
          }}
          className={`w-32 pl-7 pr-2 py-1 text-xs rounded-md border bg-white tabular-nums ${val && !ok ? 'border-red-400' : 'border-slate-200'}`}
        />
      </span>
      <button
        type="button"
        onClick={valider}
        disabled={!ok || busy}
        aria-label="Ajouter le contact"
        className="p-1 rounded-md bg-blue-600 text-white disabled:opacity-40"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => setOuvert(false)} aria-label="Annuler" className="p-1 rounded-md text-slate-400 hover:bg-slate-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
