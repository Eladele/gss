import { useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Modal, useToast } from '@/components/ui';
import type { Employee } from '@/types';

/** Seuls l'admin, le directeur et le super-administrateur peuvent suspendre ou rétablir un salaire */
const peutSuspendreSalaire = (role?: string | null, superadmin?: boolean) => !!superadmin || role === 'admin' || role === 'directeur';

/** Badge « Salaire suspendu » (avec le motif au survol) */
export function BadgeSuspendu({ e }: { e: Employee }) {
  if (!e.salaireSuspendu) return null;
  const depuis = e.suspenduLe ? ` depuis le ${new Date(e.suspenduLe).toLocaleDateString('fr-FR')}` : '';
  return (
    <span
      title={`Salaire suspendu${depuis}${e.motifSuspension ? ` : ${e.motifSuspension}` : ''}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 whitespace-nowrap"
    >
      <PauseCircle className="w-3 h-3" /> Salaire suspendu
    </span>
  );
}

/** Bouton Suspendre / Rétablir le salaire (admin, directeur) ; rien pour les autres rôles */
export function BoutonSuspension({ e }: { e: Employee }) {
  const role = useAppStore((s) => s.user?.role);
  const superadmin = useAppStore((s) => s.user?.superadmin);
  const suspendre = useAppStore((s) => s.suspendreSalaire);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  if (!peutSuspendreSalaire(role, superadmin)) return null;

  const valider = async (suspendu: boolean) => {
    setBusy(true);
    try {
      await suspendre(e.id, suspendu, motif);
      showToast(suspendu ? `Salaire de ${e.name} suspendu` : `Salaire de ${e.name} rétabli`, 'success');
      setOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMotif('');
          setOpen(true);
        }}
        title={e.salaireSuspendu ? 'Rétablir le salaire' : 'Suspendre le salaire'}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
          e.salaireSuspendu ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50' : 'text-red-700 border-red-200 hover:bg-red-50'
        }`}
      >
        {e.salaireSuspendu ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
        {e.salaireSuspendu ? 'Rétablir' : 'Suspendre'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={e.salaireSuspendu ? 'Rétablir le salaire ?' : 'Suspendre le salaire ?'}>
        <div className="space-y-4">
          {e.salaireSuspendu ? (
            <p className="text-sm text-slate-600">
              <b>{e.name}</b> sera de nouveau dans les ordres de virement et la caisse.
              {e.motifSuspension && <span className="block text-xs text-slate-500 mt-1">Motif de la suspension : {e.motifSuspension}</span>}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Le salaire de <b>{e.name}</b> ne sera plus dans les exports (ordres de virement, caisse, récap) ni retenue de prêt, jusqu’à ce
                qu’il soit rétabli.
              </p>
              <div>
                <label htmlFor="motif-suspension" className="text-xs font-semibold text-slate-500">
                  Motif (facultatif)
                </label>
                <textarea
                  id="motif-suspension"
                  value={motif}
                  onChange={(ev) => setMotif(ev.target.value)}
                  rows={2}
                  placeholder="ex. absence non justifiée"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button variant={e.salaireSuspendu ? 'success' : 'danger'} onClick={() => valider(!e.salaireSuspendu)} disabled={busy}>
              {e.salaireSuspendu ? 'Rétablir' : 'Suspendre'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
