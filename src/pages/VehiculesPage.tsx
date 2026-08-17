import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Modal, Select, Input, Textarea, EmptyState, StatCard, useToast } from '@/components/ui';
import type { Vehicle, VehicleStatut } from '@/types';

const STATUT_LABELS: Record<VehicleStatut, string> = {
  active: 'Active',
  reserve: 'Réserve',
  maintenance: 'Maintenance',
};
const STATUT_STYLES: Record<VehicleStatut, string> = {
  active: 'bg-green-100 text-green-700',
  reserve: 'bg-amber-100 text-amber-700',
  maintenance: 'bg-red-100 text-red-700',
};
const TYPE_ICONS: Record<string, string> = {
  L200: '',
  GANGO: '',
  EXPRESS: '',
  NISSAN: '',
};

function joursDepuis(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default function VehiculesPage() {
  const vehicles = useAppStore((s) => s.vehicles);
  const employees = useAppStore((s) => s.employees);
  const loadVehicles = useAppStore((s) => s.loadVehicles);
  const addVehicle = useAppStore((s) => s.addVehicle);
  const editVehicle = useAppStore((s) => s.editVehicle);
  const removeVehicle = useAppStore((s) => s.removeVehicle);
  const { showToast } = useToast();

  useEffect(() => {
    loadVehicles();
  }, []);

  const [search, setSearch] = useState('');
  const [fStatut, setFStatut] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<Partial<Vehicle>>({ statut: 'active' });

  const filtered = useMemo(
    () =>
      vehicles.filter((v) => {
        if (fStatut && v.statut !== fStatut) return false;
        if (
          search &&
          !v.immatriculation.toLowerCase().includes(search.toLowerCase()) &&
          !v.type.toLowerCase().includes(search.toLowerCase()) &&
          !(v.equipeNom ?? '').toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [vehicles, search, fStatut],
  );

  const counts = useMemo(
    () => ({
      total: vehicles.length,
      active: vehicles.filter((v) => v.statut === 'active').length,
      reserve: vehicles.filter((v) => v.statut === 'reserve').length,
      maintenance: vehicles.filter((v) => v.statut === 'maintenance').length,
    }),
    [vehicles],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ statut: 'active' });
    setModalOpen(true);
  };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm(v);
    setModalOpen(true);
  };

  const changeStatut = (v: Vehicle, statut: VehicleStatut) => {
    if (statut === v.statut) return;
    editVehicle(v.id, { statut, statutDepuis: new Date().toISOString() });
  };

  const save = async () => {
    if (!form.type?.trim() || !form.immatriculation?.trim()) {
      showToast('Type et immatriculation sont obligatoires', 'error');
      return;
    }
    if (editing) {
      const statutChanged = form.statut !== editing.statut;
      await editVehicle(editing.id, statutChanged ? { ...form, statutDepuis: new Date().toISOString() } : form);
    } else {
      await addVehicle(form);
    }
    setModalOpen(false);
    showToast(editing ? 'Véhicule mis à jour ' : 'Véhicule ajouté ', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion du Parc Véhicules</h1>
          <p className="text-slate-400 text-sm">Affectation par équipe, statut, chauffeur — réservé à l'administration</p>
        </div>
        <Button icon="" onClick={openNew}>
          Nouveau Véhicule
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={counts.total} label="Total véhicules" icon="" accent="#1565C0" />
        <StatCard value={counts.active} label="Actifs" icon="" accent="#2E7D32" />
        <StatCard value={counts.reserve} label="En réserve" icon="" accent="#E9A93B" />
        <StatCard value={counts.maintenance} label="Maintenance" icon="" accent="#C62828" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-sm flex-1">
              <span className="text-slate-400"></span>
              <input
                className="bg-transparent text-sm focus:outline-none flex-1"
                placeholder="Type, immatriculation, équipe..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={fStatut} onChange={(e) => setFStatut(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous statuts</option>
              <option value="active">Active</option>
              <option value="reserve">Réserve</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="" text="Aucun véhicule enregistré" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
            {filtered.map((v) => {
              const driver = employees.find((e) => e.id === v.chauffeurId);
              return (
                <div key={v.id} className="rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow bg-white">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{TYPE_ICONS[v.type] ?? ''}</span>
                        <div>
                          <p className="font-bold text-slate-800">{v.type}</p>
                          <p className="text-xs text-slate-400 font-mono">{v.immatriculation}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUT_STYLES[v.statut]}`}>
                        {STATUT_LABELS[v.statut]}
                      </span>
                    </div>
                    {v.statut === 'maintenance' && (
                      <div className="mb-3 flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-700">
                        {joursDepuis(v.statutDepuis)} jour{joursDepuis(v.statutDepuis) > 1 ? 's' : ''} au garage
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">Changer le statut</label>
                      <Select className="w-full" value={v.statut} onChange={(e) => changeStatut(v, e.target.value as VehicleStatut)}>
                        <option value="active">Active</option>
                        <option value="reserve">Réserve</option>
                        <option value="maintenance">Maintenance</option>
                      </Select>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1 mb-3">
                      <p>
                        <span className="text-slate-400">Équipe :</span> {v.equipeNom || '—'}
                      </p>
                      <p>
                        <span className="text-slate-400">Chauffeur :</span> {driver?.name || '—'}
                      </p>
                      {v.notes && <p className="text-slate-400 italic">{v.notes}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(v)}
                        className="flex-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                      >
                        {' '}
                        Modifier
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer le véhicule ${v.immatriculation} ?`)) removeVehicle(v.id);
                        }}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg"
                      ></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? ` Modifier ${editing.immatriculation}` : ' Nouveau Véhicule'}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type / modèle *</label>
              <Input
                value={form.type ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                placeholder="L200, GANGO, EXPRESS..."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Immatriculation *</label>
              <Input
                value={form.immatriculation ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, immatriculation: e.target.value }))}
                placeholder="0000AA00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Statut</label>
              <Select
                className="w-full"
                value={form.statut ?? 'active'}
                onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value as VehicleStatut }))}
              >
                <option value="active">Active</option>
                <option value="reserve">Réserve</option>
                <option value="maintenance">Maintenance</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Équipe assignée</label>
              <Input
                value={form.equipeNom ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, equipeNom: e.target.value }))}
                placeholder="ARAFAT, ROSSO..."
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Chauffeur</label>
            <Select
              className="w-full"
              value={form.chauffeurId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, chauffeurId: e.target.value || undefined }))}
            >
              <option value="">— Aucun —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Notes</label>
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={save}> Enregistrer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
