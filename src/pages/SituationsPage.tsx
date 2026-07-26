import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getEquipeColor } from '@/utils';
import { calcDelai, MERGED_TYPES } from '@/utils/stats';
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  TypeBadge,
  StatusBadge,
  ZoneChip,
  EquipeTag,
  Modal,
  NOKSheet,
  Select,
  Textarea,
  EmptyState,
} from '@/components/ui';
import { useToast } from '@/components/ui';

export default function SituationsPage() {
  const situations = useAppStore((s) => s.situations);
  const equipes = useAppStore((s) => s.equipes);
  const user = useAppStore((s) => s.user)!;
  const markOK = useAppStore((s) => s.markOK);
  const markNonOK = useAppStore((s) => s.markNonOK);
  const addUrgence = useAppStore((s) => s.addUrgence);
  const reassign = useAppStore((s) => s.reassign);
  const loadAll = useAppStore((s) => s.loadAll);
  const { showToast } = useToast();

  const isAdmin = user.role === 'admin' || user.role === 'superviseur';

  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('');
  const [fEquipe, setFEquipe] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fDate, setFDate] = useState('');
  // Par défaut, on n'affiche que l'essentiel : les situations pas encore décidées
  // (en attente / en cours) — OK et NON OK sont des issues finales, masquées par défaut.
  const [showEnCoursOnly, setShowEnCoursOnly] = useState(true);
  const [urgOpen, setUrgOpen] = useState(false);
  const [nokFgp, setNokFgp] = useState('');
  const [nokId, setNokId] = useState('');
  const [nokInitialComment, setNokInitialComment] = useState('');
  const [nokOpen, setNokOpen] = useState(false);

  // Reassign modal
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignFgp, setReassignFgp] = useState('');
  const [reassignId, setReassignId] = useState('');
  const [reassignEquipe, setReassignEquipe] = useState('');
  const [saving, setSaving] = useState(false);

  // Urgence form
  const allZones = useMemo(() => [...new Set(situations.map((s) => s.zone))].sort(), [situations]);
  const [urgZone, setUrgZone] = useState('');
  const [urgType, setUrgType] = useState('DRG');
  const [urgComment, setUrgComment] = useState('');
  const [urgEquipe, setUrgEquipe] = useState('');

  const filtered = useMemo(
    () =>
      situations.filter((s) => {
        if (search && !s.fgp.includes(search) && !s.zone.toLowerCase().includes(search.toLowerCase())) return false;
        if (fType === '__installation__' && !MERGED_TYPES.includes(s.type)) return false;
        else if (fType === '__derangement__' && s.type !== 'DRG') return false;
        else if (fType && fType !== '__installation__' && fType !== '__derangement__' && s.type !== fType) return false;
        if (fEquipe && s.equipe?.toLowerCase() !== fEquipe.toLowerCase()) return false;
        if (fStatus && s.status !== fStatus) return false;
        if (fDate && (s.dateDepo || s.dateMessage) !== fDate) return false;
        // Vue par défaut : seulement les situations pas encore décidées (en attente / en
        // cours) — OK et NON OK sont des issues finales, désactivable via le bouton.
        if (showEnCoursOnly && !fStatus && !fDate) {
          if (s.status !== 'pending' && s.status !== 'in_progress') return false;
        }
        return true;
      }),
    [situations, search, fType, fEquipe, fStatus, fDate, showEnCoursOnly],
  );

  const handleMarkOK = async (id: string, fgp: string) => {
    await markOK(id);
    showToast(`FGP ${fgp} marqué OK `, 'success');
  };
  const handleMarkNOK = (id: string, fgp: string, existingComment = '') => {
    setNokId(id);
    setNokFgp(fgp);
    setNokInitialComment(existingComment);
    setNokOpen(true);
  };
  const handleNOKConfirm = async (comment: string) => {
    await markNonOK(nokId, comment);
    setNokOpen(false);
    showToast(`FGP ${nokFgp} — NON OK enregistré`, 'warning');
  };

  const openReassign = (id: string, fgp: string, currentEquipe: string) => {
    setReassignId(id);
    setReassignFgp(fgp);
    setReassignEquipe(equipes.find((e) => e.name.toLowerCase() === currentEquipe?.toLowerCase())?.id ?? '');
    setReassignOpen(true);
  };

  const handleReassign = async () => {
    const eq = equipes.find((e) => e.id === reassignEquipe);
    if (!eq) {
      showToast('Sélectionnez une équipe', 'error');
      return;
    }
    setSaving(true);
    // `reassign` (store) persiste déjà en base — pas d'appel direct à reassignSituationEquipe ici.
    reassign(reassignId, eq.name);
    setSaving(false);
    setReassignOpen(false);
    showToast(`FGP ${reassignFgp} → ${eq.name} `, 'success');
  };

  const submitUrgence = async () => {
    if (!urgComment.trim()) {
      showToast('Commentaire obligatoire', 'error');
      return;
    }
    const zone = urgZone || allZones[0];
    // If equipe specified, override the zone-based auto-assignment
    await addUrgence(zone, urgType, urgComment.trim(), urgEquipe || undefined);
    setUrgOpen(false);
    setUrgComment('');
    setUrgEquipe('');
    showToast(`Urgence créée → ${urgEquipe || 'auto-assignée'} `, 'warning');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Situations</h1>
          <p className="text-slate-400 text-sm">
            {filtered.length} / {situations.length} situations
            {showEnCoursOnly && !fStatus && !fDate && <span className="text-blue-600 font-medium"> — en cours seulement</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowEnCoursOnly(!showEnCoursOnly)}>
            {showEnCoursOnly ? "Voir tout l'historique" : 'Revenir à "en cours" seulement'}
          </Button>
          {isAdmin && (
            <Button variant="warning" icon="" onClick={() => setUrgOpen(true)}>
              Créer Urgence
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-48">
              <span className="text-slate-400"></span>
              <input
                className="bg-transparent text-sm focus:outline-none flex-1"
                placeholder="Rechercher FGP, zone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={fType} onChange={(e) => setFType(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous types</option>
              <option value="__installation__">Installation (CPL/TRL/CMI/CLS/RLR/CST/ANS)</option>
              <option value="__derangement__">Dérangement (DRG)</option>
              {['CPL', 'DRG', 'TRL', 'CST', 'ANS', 'CLS', 'CMI', 'RLR'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select value={fEquipe} onChange={(e) => setFEquipe(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes équipes</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous statuts</option>
              <option value="pending">En attente</option>
              <option value="in_progress">En cours</option>
              <option value="ok">OK</option>
              <option value="non_ok">NON OK</option>
              <option value="urgent">Urgent</option>
            </Select>
            <input
              type="date"
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
              title="Filtrer par date de dépôt"
            />
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="" text="Aucune situation trouvée" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[
                    'FGP',
                    'Type',
                    'Date Message',
                    'Service Dest.',
                    'Zone',
                    'Date Dépôt',
                    'Date Mise en Service',
                    'Motif',
                    'Équipe',
                    'Délai',
                    'Conformité',
                    'Statut',
                    'Actions',
                  ].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${s.isUrgent ? 'bg-orange-50/30' : ''}`}
                  >
                    <td className="px-3 py-3 font-bold text-slate-800">
                      {s.fgp}
                      {s.isUrgent && <span className="ml-1 text-orange-500 text-xs"></span>}
                    </td>
                    <td className="px-3 py-3">
                      <TypeBadge type={s.type} />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateMessage || '—'}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{s.serviceDestination || '—'}</td>
                    <td className="px-3 py-3">
                      <ZoneChip zone={s.zone} />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateDepo || '—'}</td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateClt || '—'}</td>
                    <td className="px-3 py-3 text-xs text-slate-500 max-w-40 truncate" title={s.status === 'non_ok' && s.comment ? s.comment : s.motif}>
                      {s.status === 'non_ok' && s.comment ? (
                        <span className="text-red-600 font-medium">{s.comment}</span>
                      ) : (
                        s.motif || '—'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <EquipeTag name={s.equipe || '—'} color={getEquipeColor(s.equipe, equipes)} />
                    </td>
                    <td className="px-3 py-3 text-xs text-center">
                      {s.status === 'non_ok' && MERGED_TYPES.includes(s.type)
                        ? '—'
                        : s.dateDepo || s.dateMessage
                          ? `${calcDelai(s)}j`
                          : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-center">
                      {!(s.status === 'non_ok' && MERGED_TYPES.includes(s.type)) && s.conformite ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.conformite === 'HorsDelais' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                        >
                          {s.conformite === 'HorsDelais' ? 'HorsDélais' : 'TLID'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        {s.status !== 'ok' && (
                          <button
                            onClick={() => handleMarkOK(s.id, s.fgp)}
                            title="Marquer OK"
                            className="px-3 py-2 text-xs font-bold rounded-lg transition-colors active:scale-95 bg-green-100 hover:bg-green-600 hover:text-white text-green-700"
                          >
                            OK
                          </button>
                        )}
                        {s.status !== 'non_ok' && (
                          <button
                            onClick={() => handleMarkNOK(s.id, s.fgp, '')}
                            title="Marquer NON OK"
                            className="px-3 py-2 text-xs font-bold rounded-lg transition-colors active:scale-95 bg-red-100 hover:bg-red-600 hover:text-white text-red-700"
                          >
                            NOK
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => openReassign(s.id, s.fgp, s.equipe)}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95 shadow-sm"
                          >
                            Réaffecter équipe
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── Créer Urgence Modal */}
      <Modal open={urgOpen} onClose={() => setUrgOpen(false)} title=" Créer une Urgence">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Zone</label>
            <Select className="w-full" value={urgZone || allZones[0]} onChange={(e) => setUrgZone(e.target.value)}>
              {allZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type</label>
            <Select className="w-full" value={urgType} onChange={(e) => setUrgType(e.target.value)}>
              <option value="DRG">DRG — Dérangement</option>
              <option value="CPL">CPL — Installation</option>
            </Select>
          </div>

          {/* NEW: Équipe assignment */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">
              Affecter à l'équipe <span className="text-slate-300 font-normal">(optionnel — sinon auto par zone)</span>
            </label>
            <Select className="w-full" value={urgEquipe} onChange={(e) => setUrgEquipe(e.target.value)}>
              <option value="">Auto (par zone)</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name} — {e.leader}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Commentaire (FGP + Tel client + Problème)</label>
            <Textarea
              rows={4}
              value={urgComment}
              onChange={(e) => setUrgComment(e.target.value)}
              placeholder={'FGP: 223344\nClient: 46464646\nPas de signal fibre'}
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setUrgOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={submitUrgence}>
              {' '}
              Créer Urgence
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Réaffecter situation modal */}
      <Modal open={reassignOpen} onClose={() => setReassignOpen(false)} title={` Réaffecter FGP ${reassignFgp}`}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Nouvelle équipe</label>
            <Select className="w-full" value={reassignEquipe} onChange={(e) => setReassignEquipe(e.target.value)}>
              <option value="">-- Sélectionner --</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.leader}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleReassign} disabled={saving}>
              {saving ? '...' : ' Confirmer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* NOK sheet */}
      <NOKSheet
        open={nokOpen}
        fgp={nokFgp}
        initialComment={nokInitialComment}
        onClose={() => setNokOpen(false)}
        onConfirm={handleNOKConfirm}
      />
    </div>
  );
}