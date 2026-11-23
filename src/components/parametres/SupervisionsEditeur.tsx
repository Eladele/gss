// Page Paramètres → Supervision : ville de chaque équipe « SUPERVISION … » et équipes de terrain
// qu'elle gère (celles de sa ville ; une supervision de Nouakchott gère toutes les villes).
// Changer la ville d'une équipe la fait passer sous une autre supervision. Les zones de chaque
// équipe se modifient dans la page Zones.
import { useMemo, useState } from 'react';
import { MapPin, ShieldCheck, Users } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, Modal, Select, useToast } from '@/components/ui';
import { VILLES } from '@/lib/parametresService';
import { estEquipeSupervision, villeEquipe } from '@/hooks/usePerimetre';
import type { Equipe, Ville } from '@/types';
import { errMsg } from '@/utils';

export function SupervisionsEditeur() {
  const equipes = useAppStore((s) => s.equipes);
  const editEquipe = useAppStore((s) => s.editEquipe);
  const { showToast } = useToast();
  const [demande, setDemande] = useState<{ eq: Equipe; ville: Ville } | null>(null);
  const [busy, setBusy] = useState(false);

  const supervisions = useMemo(() => equipes.filter((e) => estEquipeSupervision(e.name)).sort((a, b) => a.name.localeCompare(b.name)), [equipes]);
  const terrain = useMemo(() => equipes.filter((e) => !estEquipeSupervision(e.name)).sort((a, b) => a.name.localeCompare(b.name)), [equipes]);
  // villes régionales sans supervision : leurs équipes ne sont gérées que par Nouakchott (toutes les villes)
  const villesSansSupervision = VILLES.filter(
    (v) => v !== 'Nouakchott' && !supervisions.some((s) => villeEquipe(s) === v) && terrain.some((t) => villeEquipe(t) === v),
  );

  const appliquer = async () => {
    if (!demande) return;
    setBusy(true);
    try {
      await editEquipe(demande.eq.id, { ville: demande.ville });
      showToast(`${demande.eq.name} : ville ${demande.ville}`, 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
      setDemande(null);
    }
  };

  const selectVille = (eq: Equipe) => (
    <Select
      aria-label={`Ville de ${eq.name}`}
      className="!py-1 !text-xs w-36"
      value={villeEquipe(eq)}
      onChange={(e) => e.target.value !== villeEquipe(eq) && setDemande({ eq, ville: e.target.value as Ville })}
    >
      {VILLES.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  );

  const ligneEquipe = (eq: Equipe) => (
    <div key={eq.id} className="px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: eq.color ?? '#94A3B8' }} />
      <span className="font-semibold text-slate-800">{eq.name}</span>
      {eq.leader && <span className="text-xs text-slate-500">chef : {eq.leader}</span>}
      <span className="text-xs text-slate-500">
        · {(eq.zones ?? []).length} zone{(eq.zones ?? []).length > 1 ? 's' : ''}
        {(eq.zones ?? []).length > 0 && ` : ${(eq.zones ?? []).join(', ')}`}
      </span>
      <span className="ml-auto">{selectVille(eq)}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="px-4 py-3 text-xs text-slate-600 space-y-1">
          <p>
            Un compte superviseur rattaché à une équipe <b>« SUPERVISION … »</b> d’une ville régionale ne voit et ne gère que les équipes de terrain et les
            zones de cette ville (programme, surveillance, points, situations, équipes, zones, scans, chantiers). Une supervision de <b>Nouakchott</b> gère
            toutes les équipes de toutes les villes.
          </p>
          <p>
            Pour changer ce qu’une supervision gère, changez la <b>ville</b> de la supervision ou celle d’une équipe de terrain. Les zones de chaque équipe se
            modifient dans la page <b>Zones</b>.
          </p>
        </div>
      </Card>

      {supervisions.length === 0 && (
        <Card>
          <p className="px-4 py-3 text-xs text-slate-400 italic">
            Aucune équipe « SUPERVISION … ». Créez-en une dans la page Équipes (nom commençant par « SUPERVISION »).
          </p>
        </Card>
      )}

      {supervisions.map((sup) => {
        const ville = villeEquipe(sup);
        const toutes = ville === 'Nouakchott';
        const geres = toutes ? terrain : terrain.filter((t) => villeEquipe(t) === ville);
        const nbZones = geres.reduce((a, g) => a + (g.zones ?? []).length, 0);
        return (
          <Card key={sup.id}>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              <h2 className="font-bold text-slate-800">{sup.name}</h2>
              <span className="text-xs text-slate-500">
                · {toutes ? 'toutes les villes' : ville} · {geres.length} équipe{geres.length > 1 ? 's' : ''} · {nbZones} zone{nbZones > 1 ? 's' : ''}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="w-3.5 h-3.5" /> Ville {selectVille(sup)}
              </span>
            </div>
            {toutes ? (
              <p className="px-4 py-2 text-xs text-slate-500">Gère toutes les équipes de toutes les villes ({terrain.length}).</p>
            ) : geres.length === 0 ? (
              <p className="px-4 py-2 text-xs text-slate-400 italic">Aucune équipe de terrain à {ville}.</p>
            ) : (
              <div className="divide-y divide-slate-100">{geres.map(ligneEquipe)}</div>
            )}
          </Card>
        );
      })}

      {villesSansSupervision.map((v) => (
        <Card key={v} className="border-amber-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600" />
            <h2 className="font-bold text-slate-800">{v} : sans supervision régionale (gérée par Nouakchott)</h2>
          </div>
          <div className="divide-y divide-slate-100">{terrain.filter((t) => villeEquipe(t) === v).map(ligneEquipe)}</div>
        </Card>
      ))}

      {/* Équipes de Nouakchott (gérées seulement par la supervision de Nouakchott) */}
      {supervisions.some((s) => villeEquipe(s) !== 'Nouakchott') && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-slate-800">Équipes de Nouakchott</h2>
            <span className="text-xs text-slate-400">changer la ville pour les confier à une supervision régionale</span>
          </div>
          <div className="divide-y divide-slate-100">{terrain.filter((t) => villeEquipe(t) === 'Nouakchott').map(ligneEquipe)}</div>
        </Card>
      )}

      <Modal open={!!demande} onClose={() => !busy && setDemande(null)} title="Changer la ville ?">
        {demande && (
          <p className="text-sm text-slate-600 mb-5">
            {estEquipeSupervision(demande.eq.name) ? (
              <>
                <b>{demande.eq.name}</b> passera de {villeEquipe(demande.eq)} à <b>{demande.ville}</b>
                {demande.ville === 'Nouakchott' ? ' : elle gérera toutes les villes.' : ` : elle ne gérera plus que les équipes de ${demande.ville}.`}
              </>
            ) : (
              <>
                L’équipe <b>{demande.eq.name}</b> passera de {villeEquipe(demande.eq)} à <b>{demande.ville}</b>, avec ses {(demande.eq.zones ?? []).length}{' '}
                zone(s) : elle sera gérée par la supervision de {demande.ville} (et toujours par celle de Nouakchott).
              </>
            )}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDemande(null)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={appliquer} disabled={busy}>
            {busy ? '…' : 'Confirmer'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
