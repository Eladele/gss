import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { addZoneToTeam, removeZoneFromTeam } from '@/lib/supabaseService';
import { getEquipeColor } from '@/utils';
import { Card, CardHeader, CardTitle, Button, Modal, Input, Select, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui';

export default function ZonesPage() {
  const situations = useAppStore(s => s.situations);
  const equipes    = useAppStore(s => s.equipes);
  const user       = useAppStore(s => s.user)!;
  const loadAll    = useAppStore(s => s.loadAll);
  const { showToast } = useToast();

  const isAdmin = user.role === 'admin' || user.role === 'superviseur';

  // All zones from situations + from equipe zones arrays
  const allZones = useMemo(() => {
    const fromSits = situations.map(s => s.zone);
    const fromTeams = equipes.flatMap(e => e.zones ?? []);
    return [...new Set([...fromSits, ...fromTeams])].filter(Boolean).sort();
  }, [situations, equipes]);

  // Map zone → equipe name
  const zoneEquipeMap = useMemo(() => {
    const map: Record<string, string> = {};
    equipes.forEach(e => (e.zones ?? []).forEach(z => { if (!map[z]) map[z] = e.name; }));
    return map;
  }, [equipes]);

  // ─── Add zone modal
  const [addOpen, setAddOpen] = useState(false);
  const [newZone, setNewZone] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(equipes[0]?.id ?? '');

  // ─── Assign zone modal
  const [assignOpen, setAssignOpen]   = useState(false);
  const [zoneToAssign, setZoneToAssign] = useState('');
  const [assignTeam, setAssignTeam]   = useState('');
  const [saving, setSaving]           = useState(false);

  const openAssign = (zone: string) => {
    const currentEq = equipes.find(e => e.name === zoneEquipeMap[zone]);
    setZoneToAssign(zone);
    setAssignTeam(currentEq?.id ?? '');
    setAssignOpen(true);
  };

  const handleAddZone = async () => {
    const zone = newZone.trim().toUpperCase();
    if (!zone) { showToast('Entrez un nom de zone', 'error'); return; }
    if (!selectedTeam) { showToast('Sélectionnez une équipe', 'error'); return; }
    setSaving(true);
    await addZoneToTeam(selectedTeam, zone);
    await loadAll();
    setSaving(false);
    setAddOpen(false);
    setNewZone('');
    showToast(`Zone ${zone} ajoutée ✓`, 'success');
  };

  const handleAssignZone = async () => {
    if (!assignTeam) { showToast('Sélectionnez une équipe', 'error'); return; }
    setSaving(true);
    // Remove from previous team
    const prevTeam = equipes.find(e => e.name === zoneEquipeMap[zoneToAssign]);
    if (prevTeam) await removeZoneFromTeam(prevTeam.id, zoneToAssign);
    // Add to new team
    await addZoneToTeam(assignTeam, zoneToAssign);
    await loadAll();
    setSaving(false);
    setAssignOpen(false);
    showToast(`Zone ${zoneToAssign} réaffectée ✓`, 'success');
  };

  const handleRemoveZone = async (zone: string) => {
    const team = equipes.find(e => e.name === zoneEquipeMap[zone]);
    if (!team) return;
    setSaving(true);
    await removeZoneFromTeam(team.id, zone);
    await loadAll();
    setSaving(false);
    showToast(`Zone ${zone} retirée`, 'info');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Zones</h1>
          <p className="text-slate-400 text-sm mt-0.5">{allZones.length} zones · {equipes.length} équipes</p>
        </div>
        {isAdmin && (
          <Button icon="➕" onClick={() => { setSelectedTeam(equipes[0]?.id ?? ''); setAddOpen(true); }}>
            Nouvelle Zone
          </Button>
        )}
      </div>

      {/* Summary cards per team */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {equipes.map(eq => {
          const zones = eq.zones ?? [];
          return (
            <div key={eq.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ background: eq.color }} />
                <span className="font-bold text-slate-800 text-sm">{eq.name}</span>
                <span className="ml-auto text-xs text-slate-400">{zones.length} zones</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {zones.slice(0, 8).map(z => (
                  <span key={z} className="text-xs font-mono px-2 py-0.5 rounded border"
                    style={{ background: eq.color + '15', borderColor: eq.color + '40', color: eq.color }}>
                    {z}
                  </span>
                ))}
                {zones.length > 8 && <span className="text-xs text-slate-400">+{zones.length - 8}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zones grid */}
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Affectation Zones → Équipes</CardTitle>
        </CardHeader>
        {allZones.length === 0 ? (
          <EmptyState icon="🗺️" text="Aucune zone trouvée. Importez des situations ou ajoutez une zone." />
        ) : (
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {allZones.map(zone => {
              const equipeName = zoneEquipeMap[zone];
              const eq = equipes.find(e => e.name === equipeName);
              const count = situations.filter(s => s.zone === zone).length;
              const nok   = situations.filter(s => s.zone === zone && s.status === 'non_ok').length;
              return (
                <div key={zone}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all group">
                  <div className="font-mono text-sm font-black text-slate-800 mb-2">{zone}</div>
                  {eq ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white"
                      style={{ background: eq.color }}>
                      {equipeName}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Non affecté</span>
                  )}
                  <div className="mt-2 text-xs text-slate-400">
                    {count} sit.
                    {nok > 0 && <span className="ml-1 text-red-500 font-semibold">{nok} NOK</span>}
                  </div>
                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="mt-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openAssign(zone)}
                        className="flex-1 text-[10px] py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold transition-colors">
                        ✏️ Affecter
                      </button>
                      {eq && (
                        <button
                          onClick={() => handleRemoveZone(zone)}
                          disabled={saving}
                          className="text-[10px] py-1 px-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold transition-colors">
                          🗑️
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Add Zone Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="➕ Ajouter une Zone">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Code Zone</label>
            <Input
              value={newZone}
              onChange={e => setNewZone(e.target.value.toUpperCase())}
              placeholder="Ex: CA1Z02, SP1Z01..."
              autoFocus
            />
            <p className="text-[10px] text-slate-400 mt-1">Format recommandé: XX0Z00 (ex: CA1Z02)</p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Affecter à l'équipe</label>
            <Select className="w-full" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
              <option value="">-- Sélectionner une équipe --</option>
              {equipes.map(e => <option key={e.id} value={e.id}>{e.name} ({e.leader})</option>)}
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={handleAddZone} disabled={saving}>
              {saving ? '⏳ Enregistrement...' : '✓ Ajouter Zone'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Assign Zone Modal */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`✏️ Affecter zone ${zoneToAssign}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Zone actuelle : <strong>{zoneEquipeMap[zoneToAssign] || 'Non affectée'}</strong>
          </p>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Nouvelle équipe</label>
            <Select className="w-full" value={assignTeam} onChange={e => setAssignTeam(e.target.value)}>
              <option value="">-- Sélectionner --</option>
              {equipes.map(e => <option key={e.id} value={e.id}>{e.name} ({e.leader})</option>)}
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Annuler</Button>
            <Button onClick={handleAssignZone} disabled={saving}>
              {saving ? '⏳...' : '✓ Confirmer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
