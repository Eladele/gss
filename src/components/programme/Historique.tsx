import { History } from 'lucide-react';
import type { ClotureArchivee } from '@/lib/programmeService';
import { jourCourt } from '@/utils/points';

/**
 * Motifs passés d'une fiche renvoyée : « Non fait le mar. 10/11 (EQ A) : RV demain — client absent ».
 * Gardés même quand la fiche est redistribuée et refaite.
 */
export function HistoriqueMotifs({ liste, compact }: { liste?: ClotureArchivee[]; compact?: boolean }) {
  if (!liste?.length) return null;
  return (
    <div className={`rounded-md border border-amber-200 bg-amber-50/70 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'} space-y-0.5`}>
      {liste.map((h) => (
        <p key={h.id} className="text-[11px] text-amber-900 flex items-start gap-1.5">
          <History className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" />
          <span>
            <b>{h.statut === 'non_ok' ? 'Non fait' : 'Fait'}</b>
            {h.traiteLe ? ` le ${jourCourt(h.traiteLe.slice(0, 10))}` : ''}
            {h.equipe ? ` (${h.equipe})` : ''}
            {h.motif ? ` : ${h.motif}` : ''}
            {h.commentaire ? ` — ${h.commentaire}` : ''}
            {!compact && <span className="text-amber-700/80"> · renvoyée le {jourCourt(h.renvoyeLe.slice(0, 10))}{h.renvoyeParNom ? ` par ${h.renvoyeParNom}` : ''}</span>}
          </span>
        </p>
      ))}
    </div>
  );
}
