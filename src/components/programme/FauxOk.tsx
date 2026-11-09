import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { MOTIFS_FAUX_OK, type MotifFauxOk } from '@/utils/programme';
import { POINTS, fmtPts } from '@/utils/points';

/**
 * Bouton « Faux OK » : choisir un motif de la liste fixe (« Autre » → précision courte),
 * puis confirmer. La fiche perd ses points, l'équipe prend la pénalité du barème, la fiche
 * est rouverte.
 */
export function FauxOkButton({ onConfirm, compact }: { onConfirm: (motif: MotifFauxOk, note: string) => Promise<void>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState<MotifFauxOk | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const penalite = fmtPts(POINTS.penalites.faux_ok);
  const fermer = () => {
    setOpen(false);
    setMotif('');
    setNote('');
  };
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Fiche marquée « Fait » à tort : la fiche perd ses points, l’équipe prend ${penalite}, la fiche est rouverte`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 rounded-md px-1.5 py-1 shrink-0"
      >
        <ShieldAlert className="w-3.5 h-3.5" /> {compact ? 'Faux OK' : 'Signaler un faux OK'}
      </button>
    );
  const valide = motif !== '' && (motif !== 'autre' || note.trim() !== '');
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg p-1.5">
      <select
        aria-label="Motif du faux OK"
        value={motif}
        onChange={(e) => setMotif(e.target.value as MotifFauxOk | '')}
        className="border border-red-200 rounded-md px-2 py-1 text-xs bg-white"
      >
        <option value="">— Motif —</option>
        {MOTIFS_FAUX_OK.map((m) => (
          <option key={m.code} value={m.code}>
            {m.label}
          </option>
        ))}
      </select>
      {motif === 'autre' && (
        <input
          aria-label="Précision du motif"
          value={note}
          maxLength={120}
          autoFocus
          placeholder="Précisez (court)"
          onChange={(e) => setNote(e.target.value)}
          className="border border-red-200 rounded-md px-2 py-1 text-xs bg-white w-40"
        />
      )}
      <button
        type="button"
        disabled={!valide || busy}
        onClick={async () => {
          if (!motif) return;
          setBusy(true);
          try {
            await onConfirm(motif, motif === 'autre' ? note.trim() : '');
            fermer();
          } finally {
            setBusy(false);
          }
        }}
        className="text-xs font-bold text-white bg-red-600 rounded-md px-2 py-1 disabled:opacity-40"
      >
        {busy ? '…' : `Confirmer (${penalite} pt, fiche rouverte)`}
      </button>
      <button type="button" onClick={fermer} className="text-xs text-slate-500 px-1">
        Annuler
      </button>
    </div>
  );
}
