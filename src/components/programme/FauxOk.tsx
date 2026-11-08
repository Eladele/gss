import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { MOTIFS_FAUX_OK } from '@/utils/programme';

/** Bouton « Faux OK » : choisir le motif puis confirmer (−1 point, fiche rouverte) */
export function FauxOkButton({ onConfirm, compact }: { onConfirm: (note: string) => Promise<void>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Fiche marquée « Fait » à tort : l’équipe perd son point (+1) et prend −1, la fiche est rouverte"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 rounded-md px-1.5 py-1"
      >
        <ShieldAlert className="w-3.5 h-3.5" /> {compact ? 'Faux OK' : 'Signaler un faux OK'}
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg p-1.5">
      <select
        aria-label="Motif du faux OK"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="border border-red-200 rounded-md px-2 py-1 text-xs bg-white"
      >
        <option value="">— Motif —</option>
        {MOTIFS_FAUX_OK.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!note || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(note);
            setOpen(false);
            setNote('');
          } finally {
            setBusy(false);
          }
        }}
        className="text-xs font-bold text-white bg-red-600 rounded-md px-2 py-1 disabled:opacity-40"
      >
        {busy ? '…' : 'Confirmer (−1 pt, fiche rouverte)'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 px-1">
        Annuler
      </button>
    </div>
  );
}
