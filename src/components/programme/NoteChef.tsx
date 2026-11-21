import { useState } from 'react';
import { MessageSquare, Pencil } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Commentaire du superviseur pour le chef d'équipe : affiché, puis modifiable.
 * `onSave` peut être synchrone (fiche pas encore distribuée) ou enregistrer en base.
 */
export function NoteChefEditeur({ note, onSave }: { note: string; onSave: (note: string) => void | Promise<void> }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(note);
  const [busy, setBusy] = useState(false);
  const ouvrir = () => {
    setTexte(note);
    setEdition(true);
  };
  const enregistrer = async () => {
    setBusy(true);
    try {
      await onSave(texte.trim());
      setEdition(false);
    } catch {
      /* message d'erreur affiché par l'appelant */
    } finally {
      setBusy(false);
    }
  };

  if (edition)
    return (
      <div className="w-full flex flex-col gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
        <textarea
          aria-label="Commentaire pour le chef"
          autoFocus
          rows={2}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Ex. : appeler le client avant de passer, clé chez le voisin…"
          className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs bg-white resize-y"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={enregistrer} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdition(false)} disabled={busy}>
            Annuler
          </Button>
          <span className="text-[11px] text-indigo-800">Le chef le voit sur sa fiche.</span>
        </div>
      </div>
    );

  return note ? (
    <button
      type="button"
      onClick={ouvrir}
      title="Modifier le commentaire pour le chef"
      className="self-start text-left inline-flex items-start gap-1.5 text-[11px] rounded-md px-2 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100"
    >
      <MessageSquare className="w-3.5 h-3.5 mt-px flex-shrink-0" />
      <span>
        <b>Pour le chef :</b> {note}
      </span>
      <Pencil className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
    </button>
  ) : (
    <button
      type="button"
      onClick={ouvrir}
      className="self-start inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 rounded-md px-1.5 py-1"
    >
      <MessageSquare className="w-3.5 h-3.5" /> Commentaire pour le chef
    </button>
  );
}

/** Commentaire du superviseur, tel que le chef le voit sur sa fiche */
export function NoteChefAffichee({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p className="text-xs rounded-md px-2.5 py-1.5 bg-indigo-50 text-indigo-900 border border-indigo-200 flex items-start gap-1.5">
      <MessageSquare className="w-3.5 h-3.5 mt-px flex-shrink-0 text-indigo-600" />
      <span>
        <b>Commentaire du superviseur :</b> {note}
      </span>
    </p>
  );
}
