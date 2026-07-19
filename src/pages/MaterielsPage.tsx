import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, Button, Modal, Select, Input, Textarea, EmptyState, StatCard, useToast } from '@/components/ui';
import { MATERIEL_CATALOGUE, ETAT_MATERIEL_LABELS as ETAT_LABELS, ETAT_MATERIEL_STYLES as ETAT_STYLES } from '@/data';
import type { Materiel, EtatMateriel } from '@/types';

export default function MaterielsPage() {
  const materiels     = useAppStore(s => s.materiels);
  const equipes        = useAppStore(s => s.equipes);
  const loadMateriels  = useAppStore(s => s.loadMateriels);
  const addMateriel    = useAppStore(s => s.addMateriel);
  const editMateriel   = useAppStore(s => s.editMateriel);
  const removeMateriel = useAppStore(s => s.removeMateriel);
  const { showToast } = useToast();

  useEffect(() => { loadMateriels(); }, []);

  const [search, setSearch] = useState('');
  const [fEquipe, setFEquipe] = useState('');
  const [fEtat, setFEtat] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Materiel | null>(null);
  const [form, setForm] = useState<Partial<Materiel>>({ etat: 'bon', quantite: 1 });

  const filtered = useMemo(() => materiels.filter(m => {
    if (fEquipe && (m.equipeNom ?? '') !== fEquipe) return false;
    if (fEtat && m.etat !== fEtat) return false;
    if (search && !m.nom.toLowerCase().includes(search.toLowerCase())
      && !(m.equipeNom ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [materiels, search, fEquipe, fEtat]);

  const counts = useMemo(() => ({
    total: materiels.reduce((sum, m) => sum + (m.quantite || 0), 0),
    bon: materiels.filter(m => m.etat === 'bon' || m.etat === 'neuf').length,
    aReparer: materiels.filter(m => m.etat === 'a_reparer').length,
    horsService: materiels.filter(m => m.etat === 'hors_service').length,
  }), [materiels]);

  const openNew = () => { setEditing(null); setForm({ etat: 'bon', quantite: 1 }); setModalOpen(true); };
  const openEdit = (m: Materiel) => { setEditing(m); setForm(m); setModalOpen(true); };

  const save = async () => {
    if (!form.nom?.trim()) { showToast('Le nom du matériel est obligatoire', 'error'); return; }
    if (editing) await editMateriel(editing.id, form);
    else await addMateriel(form);
    setModalOpen(false);
    showToast(editing ? 'Matériel mis à jour ✓' : 'Matériel ajouté ✓', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Matériel & Outillage des Équipes</h1>
          <p className="text-slate-400 text-sm">Suivi du matériel (marteau, pince, cliveuse, source laser, grimpette, power mètre, tournevis...) et de son état</p>
        </div>
        <Button icon="➕" onClick={openNew}>Nouveau Matériel</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={counts.total}       label="Quantité totale" icon="🧰" accent="#1565C0" />
        <StatCard value={counts.bon}         label="Bon / Neuf"      icon="✅" accent="#2E7D32" />
        <StatCard value={counts.aReparer}    label="À réparer"       icon="🛠️" accent="#E9A93B" />
        <StatCard value={counts.horsService} label="Hors service"    icon="⛔" accent="#C62828" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-sm flex-1">
              <span className="text-slate-400">🔍</span>
              <input className="bg-transparent text-sm focus:outline-none flex-1" placeholder="Matériel, équipe..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={fEquipe} onChange={e => setFEquipe(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes équipes</option>
              {equipes.map(eq => <option key={eq.id} value={eq.name}>{eq.name}</option>)}
            </Select>
            <Select value={fEtat} onChange={e => setFEtat(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous états</option>
              <option value="neuf">Neuf</option>
              <option value="bon">Bon état</option>
              <option value="a_reparer">À réparer</option>
              <option value="hors_service">Hors service</option>
            </Select>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="🧰" text="Aucun matériel enregistré" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
            {filtered.map(m => (
              <div key={m.id} className="rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow bg-white">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-slate-800">{m.nom}</p>
                      <p className="text-xs text-slate-400">Qté : {m.quantite}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${ETAT_STYLES[m.etat]}`}>
                      {ETAT_LABELS[m.etat]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1 mb-3">
                    <p><span className="text-slate-400">Équipe :</span> {m.equipeNom || '— Stock central —'}</p>
                    {m.notes && <p className="text-slate-400 italic">{m.notes}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(m)}
                      className="flex-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">✏️ Modifier</button>
                    <button onClick={() => { if (confirm(`Supprimer ${m.nom} ?`)) removeMateriel(m.id); }}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg">🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `✏️ Modifier ${editing.nom}` : '➕ Nouveau Matériel'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom du matériel *</label>
            <Input list="materiel-catalogue" value={form.nom ?? ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Marteau, Pince, Cliveuse fibre optique..." />
            <datalist id="materiel-catalogue">
              {MATERIEL_CATALOGUE.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Quantité</label>
              <Input type="number" min={0} value={form.quantite ?? 1} onChange={e => setForm(f => ({ ...f, quantite: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">État</label>
              <Select className="w-full" value={form.etat ?? 'bon'} onChange={e => setForm(f => ({ ...f, etat: e.target.value as EtatMateriel }))}>
                <option value="neuf">Neuf</option>
                <option value="bon">Bon état</option>
                <option value="a_reparer">À réparer</option>
                <option value="hors_service">Hors service</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Équipe assignée</label>
            <Select className="w-full" value={form.equipeNom ?? ''} onChange={e => setForm(f => ({ ...f, equipeNom: e.target.value || undefined }))}>
              <option value="">— Stock central —</option>
              {equipes.map(eq => <option key={eq.id} value={eq.name}>{eq.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Notes</label>
            <Textarea rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ex: 2 bon, 1 neuf..." />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={save}>💾 Enregistrer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
