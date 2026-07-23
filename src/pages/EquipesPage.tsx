import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ProgressBar, ZoneChip, EmptyState, Modal, Button, Input } from '@/components/ui';
import { ETAT_MATERIEL_LABELS, ETAT_MATERIEL_STYLES } from '@/data';
import type { Equipe } from '@/types';

const VILLES = ['Nouakchott', 'Kaédi', 'Rosso', 'Nouadhibou'];

function EquipeFormModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Equipe | null }) {
  const addEquipe = useAppStore((s) => s.addEquipe);
  const editEquipe = useAppStore((s) => s.editEquipe);
  const [name, setName] = useState('');
  const [leader, setLeader] = useState('');
  const [color, setColor] = useState('#1565C0');
  const [ville, setVille] = useState('Nouakchott');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setLeader(editing.leader);
      setColor(editing.color);
      setVille(editing.ville ?? 'Nouakchott');
    } else {
      setName('');
      setLeader('');
      setColor('#1565C0');
      setVille('Nouakchott');
    }
  }, [editing, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !leader.trim()) return;
    setLoading(true);
    if (editing) {
      await editEquipe(editing.id, { name: name.trim(), leader: leader.trim(), color, ville: ville as Equipe['ville'] });
    } else {
      await addEquipe({ name: name.trim(), leader: leader.trim(), color, zones: [], ville: ville as Equipe['ville'] });
    }
    setLoading(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? ` Modifier ${editing.name}` : ' Créer une Équipe'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom de l'équipe</label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Equipe Alpha" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Chef d'équipe</label>
          <Input required value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="Ex: Ahmed" />
          {!editing && (
            <p className="text-[10px] text-slate-400 mt-1">Un profil sera automatiquement créé pour le chef (mot de passe "chef2026").</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ville</label>
            <select
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {VILLES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Couleur</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-[38px] p-1 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-400">
          Les membres de l'équipe et le matériel assigné ne se saisissent plus ici : ils sont récupérés automatiquement depuis les modules
          "Employés" et "Matériel" (en fonction de l'équipe RH renseignée sur chaque fiche).
        </p>
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? '...' : editing ? ' Enregistrer' : "Créer l'équipe"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function EquipesPage() {
  const situations = useAppStore((s) => s.situations);
  const equipes = useAppStore((s) => s.equipes);
  const vehicles = useAppStore((s) => s.vehicles);
  const employees = useAppStore((s) => s.employees);
  const materiels = useAppStore((s) => s.materiels);
  const loading = useAppStore((s) => s.loading);
  const user = useAppStore((s) => s.user);
  const removeEquipe = useAppStore((s) => s.removeEquipe);
  const loadVehicles = useAppStore((s) => s.loadVehicles);
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const loadMateriels = useAppStore((s) => s.loadMateriels);

  useEffect(() => {
    if (vehicles.length === 0) loadVehicles();
    if (employees.length === 0) loadEmployees();
    if (materiels.length === 0) loadMateriels();
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Equipe | null>(null);

  const canManage = user?.role === 'superviseur' || user?.role === 'admin';
  const canDelete = user?.role === 'admin';

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (eq: Equipe) => {
    setEditing(eq);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="text-3xl animate-spin"></span>
        <span className="ml-3">Chargement des équipes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Équipes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {equipes.length} équipes · {situations.length} situations
          </p>
        </div>
        {canManage && (
          <Button icon="" onClick={openNew}>
            Créer une Équipe
          </Button>
        )}
      </div>

      {equipes.length === 0 ? (
        <EmptyState icon="" text="Aucune équipe trouvée. Vérifiez que les équipes sont bien configurées." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {equipes.map((eq) => {
            const eqSits = situations.filter((s) => s.equipe?.toLowerCase() === eq.name.toLowerCase());
            const ok = eqSits.filter((s) => s.status === 'ok').length;
            const nok = eqSits.filter((s) => s.status === 'non_ok').length;
            const pend = eqSits.filter((s) => s.status === 'pending' || s.status === 'urgent').length;
            const pct = eqSits.length ? Math.round((ok / eqSits.length) * 100) : 0;
            const vehicle = vehicles.find((v) => (v.equipeNom ?? '').toLowerCase() === eq.name.toLowerCase());

            // Relation réelle Équipe ↔ Employés (module RH), basée sur employees.equipeNom
            const members = employees.filter((e) => (e.equipeNom ?? '').trim().toLowerCase() === eq.name.trim().toLowerCase());
            const chef = members.find((e) => (e.poste ?? '').toLowerCase().includes('chef')) ?? null;
            const techniciens = members.filter((e) => e.id !== chef?.id);

            // Relation réelle Équipe ↔ Matériel, basée sur materiels.equipeNom
            const eqMateriels = materiels.filter((m) => (m.equipeNom ?? '').trim().toLowerCase() === eq.name.trim().toLowerCase());

            return (
              <div
                key={eq.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-1.5" style={{ background: eq.color }} />
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                      style={{ background: eq.color }}
                    >
                      {eq.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 capitalize truncate">{eq.name}</div>
                      <div className="text-xs text-slate-400">
                        {chef ? chef.name : eq.leader} (Chef) · {eq.ville ?? 'Nouakchott'}
                        {!chef && <span className="text-amber-500"> · à confirmer (aucun employé "Chef d'équipe" trouvé)</span>}
                      </div>
                    </div>
                    <div className="text-2xl font-black shrink-0" style={{ color: eq.color }}>
                      {pct}%
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex gap-1.5 mb-4">
                      <button
                        onClick={() => openEdit(eq)}
                        className="flex-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                      >
                        {' '}
                        Modifier
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer l'équipe ${eq.name} ?`)) removeEquipe(eq.id);
                          }}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg"
                        ></button>
                      )}
                    </div>
                  )}

                  {vehicle && (
                    <div className="mb-4 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs">
                      <span className="text-lg"></span>
                      <div>
                        <span className="font-semibold text-slate-700">{vehicle.type}</span>
                        <span className="text-slate-400 font-mono ml-1.5">{vehicle.immatriculation}</span>
                      </div>
                      <span
                        className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${vehicle.statut === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                      >
                        {vehicle.statut}
                      </span>
                    </div>
                  )}

                  {/* Membres réels (module Employés) */}
                  <div className="mb-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Membres ({members.length})</p>
                    {members.length === 0 ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50 p-2 rounded border border-slate-100">
                        Aucun employé rattaché — renseignez l'"Équipe (RH)" = "{eq.name}" sur ses fiches dans le module Employés.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {chef && (
                          <div className="flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-100 rounded px-2 py-1">
                            <span></span>
                            <span className="font-semibold text-blue-800">{chef.name}</span>
                            <span className="text-blue-400">Mle {chef.mle || '—'} · Chef d'équipe</span>
                          </div>
                        )}
                        {techniciens.map((t) => {
                          const villeMismatch = chef?.ville && t.ville && t.ville.trim().toLowerCase() !== chef.ville.trim().toLowerCase();
                          return (
                            <div
                              key={t.id}
                              className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 border ${villeMismatch ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}
                            >
                              <span></span>
                              <span className="font-medium text-slate-700">{t.name}</span>
                              <span className="text-slate-400">
                                Mle {t.mle || '—'} · {t.poste || 'technicien'} · {t.ville || '—'}
                              </span>
                              {villeMismatch && (
                                <span
                                  className="ml-auto text-amber-600 font-semibold"
                                  title={`Ville différente du chef (${chef?.ville})`}
                                ></span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Matériel réel (module Matériel) */}
                  {eqMateriels.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Matériel assigné ({eqMateriels.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {eqMateriels.map((m) => (
                          <span key={m.id} className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${ETAT_MATERIEL_STYLES[m.etat]}`}>
                            {m.nom} × {m.quantite} <span className="opacity-70 font-normal">({ETAT_MATERIEL_LABELS[m.etat]})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center bg-green-50 rounded-lg p-2">
                      <div className="font-bold text-green-700 text-lg">{ok}</div>
                      <div className="text-[10px] text-green-600 font-medium">OK</div>
                    </div>
                    <div className="text-center bg-red-50 rounded-lg p-2">
                      <div className="font-bold text-red-700 text-lg">{nok}</div>
                      <div className="text-[10px] text-red-600 font-medium">NON OK</div>
                    </div>
                    <div className="text-center bg-slate-50 rounded-lg p-2">
                      <div className="font-bold text-slate-700 text-lg">{pend}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Restant</div>
                    </div>
                  </div>

                  <ProgressBar value={pct} color={eq.color} />

                  {/* Zones */}
                  {(eq.zones ?? []).length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Zones Couvertes ({(eq.zones ?? []).length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(eq.zones ?? []).map((z) => (
                          <ZoneChip key={z} zone={z} />
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mt-3">{eqSits.length} situations totales</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EquipeFormModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
    </div>
  );
}
