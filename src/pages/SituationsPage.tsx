import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getEquipeColor } from '@/utils';
import { calcDelai } from '@/utils/stats';
import { reassignSituationEquipe } from '@/lib/supabaseService';
import { Card, CardHeader, CardTitle, Button, TypeBadge, StatusBadge, ZoneChip, EquipeTag, Modal, NOKSheet, Select, Textarea, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui';

export default function SituationsPage() {
  const situations = useAppStore(s => s.situations);
  const equipes    = useAppStore(s => s.equipes);
  const user       = useAppStore(s => s.user)!;
  const markOK     = useAppStore(s => s.markOK);
  const markNonOK  = useAppStore(s => s.markNonOK);
  const addUrgence = useAppStore(s => s.addUrgence);
  const reassign   = useAppStore(s => s.reassign);
  const loadAll    = useAppStore(s => s.loadAll);
  const { showToast } = useToast();

  const isAdmin = user.role === 'admin' || user.role === 'superviseur';

  const [search, setSearch]   = useState('');
  const [fType, setFType]     = useState('');
  const [fEquipe, setFEquipe] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fNature, setFNature] = useState('');
  const [fDate, setFDate]     = useState('');
  const [urgOpen, setUrgOpen] = useState(false);
  const [nokFgp, setNokFgp]   = useState('');
  const [nokOpen, setNokOpen] = useState(false);

  // Reassign modal
  const [reassignOpen, setReassignOpen]     = useState(false);
  const [reassignFgp, setReassignFgp]       = useState('');
  const [reassignEquipe, setReassignEquipe] = useState('');
  const [saving, setSaving]                 = useState(false);

  // Urgence form
  const allZones = useMemo(() => [...new Set(situations.map(s => s.zone))].sort(), [situations]);
  const [urgZone, setUrgZone]       = useState('');
  const [urgType, setUrgType]       = useState('DRG');
  const [urgComment, setUrgComment] = useState('');
  const [urgEquipe, setUrgEquipe]   = useState('');

  const filtered = useMemo(() => situations.filter(s => {
    if (search && !s.fgp.includes(search) && !s.zone.toLowerCase().includes(search.toLowerCase())) return false;
    if (fType && s.type !== fType) return false;
    if (fEquipe && s.equipe?.toLowerCase() !== fEquipe.toLowerCase()) return false;
    if (fStatus && s.status !== fStatus) return false;
    if (fNature && (s.nature ?? 'installation') !== fNature) return false;
    if (fDate && s.dateDepo !== fDate) return false;
    return true;
  }), [situations, search, fType, fEquipe, fStatus, fNature, fDate]);

  const handleMarkOK = async (fgp: string) => {
    await markOK(fgp);
    showToast(`FGP ${fgp} marqué OK ✓`, 'success');
  };
  const handleMarkNOK = (fgp: string) => { setNokFgp(fgp); setNokOpen(true); };
  const handleNOKConfirm = async (comment: string) => {
    await markNonOK(nokFgp, comment);
    setNokOpen(false);
    showToast(`FGP ${nokFgp} — NON OK enregistré`, 'warning');
  };

  const openReassign = (fgp: string, currentEquipe: string) => {
    setReassignFgp(fgp);
    setReassignEquipe(equipes.find(e => e.name.toLowerCase() === currentEquipe?.toLowerCase())?.id ?? '');
    setReassignOpen(true);
  };

  const handleReassign = async () => {
    const eq = equipes.find(e => e.id === reassignEquipe);
    if (!eq) { showToast('Sélectionnez une équipe', 'error'); return; }
    setSaving(true);
    reassign(reassignFgp, eq.name);
    await reassignSituationEquipe(reassignFgp, eq.name);
    setSaving(false);
    setReassignOpen(false);
    showToast(`FGP ${reassignFgp} → ${eq.name} ✓`, 'success');
  };

  const submitUrgence = async () => {
    if (!urgComment.trim()) { showToast('Commentaire obligatoire', 'error'); return; }
    const zone = urgZone || allZones[0];
    // If equipe specified, override the zone-based auto-assignment
    await addUrgence(zone, urgType, urgComment.trim(), urgEquipe || undefined);
    setUrgOpen(false); setUrgComment(''); setUrgEquipe('');
    showToast(`Urgence créée → ${urgEquipe || 'auto-assignée'} ⚠️`, 'warning');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Situations</h1>
          <p className="text-slate-400 text-sm">{filtered.length} / {situations.length} situations</p>
        </div>
        {isAdmin && (
          <Button variant="warning" icon="⚠️" onClick={() => setUrgOpen(true)}>Créer Urgence</Button>
        )}
      </div>

      <Card>
        <CardHeader>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-48">
              <span className="text-slate-400">🔍</span>
              <input
                className="bg-transparent text-sm focus:outline-none flex-1"
                placeholder="Rechercher FGP, zone..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={fType} onChange={e => setFType(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous types</option>
              {['CPL','DRG','TRL','CST','ANS','CLS','CMI','RLR'].map(t => <option key={t}>{t}</option>)}
            </Select>
            <Select value={fEquipe} onChange={e => setFEquipe(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes équipes</option>
              {equipes.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
            </Select>
            <Select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous statuts</option>
              <option value="pending">En attente</option>
              <option value="ok">OK</option>
              <option value="non_ok">NON OK</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Select value={fNature} onChange={e => setFNature(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Installation + Dérangement</option>
              <option value="installation">🔧 Installation</option>
              <option value="derangement">⚠️ Dérangement</option>
            </Select>
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm" title="Filtrer par date de dépôt" />
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="📭" text="Aucune situation trouvée" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['FGP','Type','Zone','Équipe','Motif','Date Dépôt','Délai','Statut','Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${s.isUrgent ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-3 py-3 font-bold text-slate-800">
                      {s.fgp}
                      {s.isUrgent && <span className="ml-1 text-orange-500 text-xs">⚠</span>}
                    </td>
                    <td className="px-3 py-3"><TypeBadge type={s.type} /></td>
                    <td className="px-3 py-3"><ZoneChip zone={s.zone} /></td>
                    <td className="px-3 py-3">
                      <EquipeTag name={s.equipe || '—'} color={getEquipeColor(s.equipe, equipes)} />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400 max-w-28 truncate" title={s.motif}>{s.motif || '—'}</td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateDepo || '—'}</td>
                    <td className="px-3 py-3 text-xs text-center">{s.dateDepo ? `${calcDelai(s)}j` : '—'}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={s.status} />
                      {s.status === 'non_ok' && s.comment && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-28 truncate" title={s.comment}>{s.comment}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {(s.status === 'pending' || s.status === 'urgent') && (
                          <>
                            <button onClick={() => handleMarkOK(s.fgp)}
                              className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95">
                              ✓ OK
                            </button>
                            <button onClick={() => handleMarkNOK(s.fgp)}
                              className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95">
                              ✗ NOK
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button onClick={() => openReassign(s.fgp, s.equipe)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition-colors active:scale-95">
                            🔁
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
      <Modal open={urgOpen} onClose={() => setUrgOpen(false)} title="⚠️ Créer une Urgence">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Zone</label>
            <Select className="w-full" value={urgZone || allZones[0]} onChange={e => setUrgZone(e.target.value)}>
              {allZones.map(z => <option key={z} value={z}>{z}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type</label>
            <Select className="w-full" value={urgType} onChange={e => setUrgType(e.target.value)}>
              <option value="DRG">DRG — Dérangement</option>
              <option value="CPL">CPL — Installation</option>
            </Select>
          </div>

          {/* NEW: Équipe assignment */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">
              Affecter à l'équipe <span className="text-slate-300 font-normal">(optionnel — sinon auto par zone)</span>
            </label>
            <Select className="w-full" value={urgEquipe} onChange={e => setUrgEquipe(e.target.value)}>
              <option value="">Auto (par zone)</option>
              {equipes.map(e => <option key={e.id} value={e.name}>{e.name} — {e.leader}</option>)}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Commentaire (FGP + Tel client + Problème)</label>
            <Textarea
              rows={4} value={urgComment} onChange={e => setUrgComment(e.target.value)}
              placeholder={"FGP: 223344\nClient: 46464646\nPas de signal fibre"}
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setUrgOpen(false)}>Annuler</Button>
            <Button variant="danger" onClick={submitUrgence}>⚠️ Créer Urgence</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Réaffecter situation modal */}
      <Modal open={reassignOpen} onClose={() => setReassignOpen(false)} title={`🔁 Réaffecter FGP ${reassignFgp}`}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Nouvelle équipe</label>
            <Select className="w-full" value={reassignEquipe} onChange={e => setReassignEquipe(e.target.value)}>
              <option value="">-- Sélectionner --</option>
              {equipes.map(e => <option key={e.id} value={e.id}>{e.name} — {e.leader}</option>)}
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Annuler</Button>
            <Button onClick={handleReassign} disabled={saving}>
              {saving ? '⏳...' : '✓ Confirmer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* NOK sheet */}
      <NOKSheet
        open={nokOpen} fgp={nokFgp}
        onClose={() => setNokOpen(false)}
        onConfirm={handleNOKConfirm}
      />
    </div>
  );
}
