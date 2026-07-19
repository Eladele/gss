import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Modal, Select, Input, Textarea, EmptyState, StatCard, useToast } from '@/components/ui';
import { BANQUES } from '@/data';
import { exportEmployesPresentsExcel } from '@/utils/leaves';
import type { Employee, LeaveType } from '@/types';

const LEAVE_LABELS: Record<LeaveType, string> = {
  annuel: 'Congé annuel', maladie: 'Congé maladie', sans_solde: 'Sans solde',
  exceptionnel: 'Exceptionnel', maternite: 'Maternité', autre: 'Autre',
};
const LEAVE_ICONS: Record<LeaveType, string> = {
  annuel: '🏖️', maladie: '🤒', sans_solde: '⏸️', exceptionnel: '⚡', maternite: '👶', autre: '📌',
};
const SOLDE_ANNUEL = 22; // jours de congé annuel de référence / an

const POSTE_STYLES: Record<string, string> = {
  "chef d'équipe": 'bg-blue-100 text-blue-700',
  technicien: 'bg-slate-100 text-slate-600',
  superviseur: 'bg-purple-100 text-purple-700',
  cordinteur: 'bg-amber-100 text-amber-700',
  coordinateur: 'bg-amber-100 text-amber-700',
};
const AVATAR_PALETTE = ['#1565C0', '#2E7D32', '#E9A93B', '#8E24AA', '#00838F', '#C62828', '#546E7A'];
function colorFor(seed: string) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const d1 = new Date(a), d2 = new Date(b);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

export default function EmployesPage() {
  const employees     = useAppStore(s => s.employees);
  const leaves         = useAppStore(s => s.leaves);
  const loadEmployees  = useAppStore(s => s.loadEmployees);
  const addEmployee    = useAppStore(s => s.addEmployee);
  const editEmployee   = useAppStore(s => s.editEmployee);
  const removeEmployee = useAppStore(s => s.removeEmployee);
  const addLeave        = useAppStore(s => s.addLeave);
  const removeLeave     = useAppStore(s => s.removeLeave);
  const { showToast } = useToast();

  useEffect(() => { loadEmployees(); }, []);

  const [search, setSearch] = useState('');
  const [fVille, setFVille] = useState('');
  const [empModal, setEmpModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<Employee>>({ actif: true });

  const [congeModal, setCongeModal] = useState(false);
  const [congeEmployee, setCongeEmployee] = useState<Employee | null>(null);
  const [leaveForm, setLeaveForm] = useState({ type: 'annuel' as LeaveType, dateDebut: '', dateFin: '', motif: '' });
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportOrdre, setExportOrdre] = useState('020/DG/GSS/2026');

  const villes = useMemo(() => [...new Set(employees.map(e => e.ville).filter(Boolean))].sort() as string[], [employees]);

  const filtered = useMemo(() => employees.filter(e => {
    if (fVille && e.ville !== fVille) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || (e.mle ?? '').includes(search)
      || (e.equipeNom ?? '').toLowerCase().includes(q) || (e.ville ?? '').toLowerCase().includes(q);
  }), [employees, search, fVille]);

  const soldeFor = (empId: string) => {
    const taken = leaves.filter(l => l.employeeId === empId && l.type === 'annuel').reduce((a, l) => a + l.jours, 0);
    return SOLDE_ANNUEL - taken;
  };

  const counts = useMemo(() => ({
    total: employees.length,
    actifs: employees.filter(e => e.actif).length,
    chefs: employees.filter(e => (e.poste ?? '').toLowerCase().includes('chef')).length,
    techniciens: employees.filter(e => (e.poste ?? '').toLowerCase().includes('technicien')).length,
  }), [employees]);

  const openNew = () => { setEditing(null); setForm({ actif: true }); setEmpModal(true); };
  const openEdit = (emp: Employee) => { setEditing(emp); setForm(emp); setEmpModal(true); };

  const saveEmployee = async () => {
    if (!form.name?.trim()) { showToast('Le nom est obligatoire', 'error'); return; }
    if (editing) await editEmployee(editing.id, form);
    else await addEmployee(form);
    setEmpModal(false);
    showToast(editing ? 'Employé mis à jour ✓' : 'Employé ajouté ✓', 'success');
  };

  const openConge = (emp: Employee) => {
    setCongeEmployee(emp);
    setLeaveForm({ type: 'annuel', dateDebut: '', dateFin: '', motif: '' });
    setCongeModal(true);
  };

  const saveConge = async () => {
    if (!congeEmployee || !leaveForm.dateDebut || !leaveForm.dateFin) {
      showToast('Dates de début et fin obligatoires', 'error'); return;
    }
    const jours = daysBetween(leaveForm.dateDebut, leaveForm.dateFin);
    await addLeave({ employeeId: congeEmployee.id, ...leaveForm, jours });
    setCongeModal(false);
    showToast('Congé enregistré ✓', 'success');
  };

  const handleExportPresents = () => {
    exportEmployesPresentsExcel({ month: exportMonth, employees, leaves, ordreBase: exportOrdre });
    showToast('Fichier Excel des employés présents généré ✓', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Employés</h1>
          <p className="text-slate-400 text-sm">Module indépendant (paie, congés) — réservé à l'administration</p>
        </div>
        <Button icon="➕" onClick={openNew}>Nouvel Employé</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={counts.total}       label="Employés"     icon="🧑‍💼" accent="#1565C0" />
        <StatCard value={counts.actifs}      label="Actifs"       icon="✅" accent="#2E7D32" />
        <StatCard value={counts.chefs}       label="Chefs d'équipe" icon="⭐" accent="#E9A93B" />
        <StatCard value={counts.techniciens} label="Techniciens"  icon="🔧" accent="#00838F" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-sm flex-1">
              <span className="text-slate-400">🔍</span>
              <input className="bg-transparent text-sm focus:outline-none flex-1" placeholder="Nom, matricule, équipe, ville..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={fVille} onChange={e => setFVille(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes villes</option>
              {villes.map(v => <option key={v} value={v}>{v}</option>)}
            </Select>
          </div>
        </CardHeader>
        {filtered.length === 0 ? (
          <EmptyState icon="👤" text="Aucun employé enregistré" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employé', 'Équipe / Ville', 'Poste', 'Téléphone', 'Montant (MRU)', 'Solde congé', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const solde = soldeFor(e.id);
                  const posteKey = (e.poste ?? '').toLowerCase();
                  const posteStyle = POSTE_STYLES[posteKey] ?? 'bg-slate-100 text-slate-600';
                  const avatarColor = colorFor(e.name);
                  return (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ background: avatarColor }}>
                            {e.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{e.name}</p>
                            <p className="text-[11px] text-slate-400">{e.mle ? `Mle ${e.mle}` : '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-slate-700 text-xs font-medium">{e.equipeNom || '—'}</p>
                        <p className="text-[11px] text-slate-400">{e.ville || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${posteStyle}`}>{e.poste || '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{e.telephone || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{e.montant ? e.montant.toLocaleString('fr-FR') : '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${solde < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {solde}j
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${e.actif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {e.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          <button onClick={() => openConge(e)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">🗓️ Congé</button>
                          <button onClick={() => openEdit(e)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">✏️</button>
                          <button onClick={() => { if (confirm(`Supprimer ${e.name} ?`)) removeEmployee(e.id); }}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Historique des congés récents — cartes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <CardTitle>🗓️ Congés enregistrés</CardTitle>
            <div className="flex items-center gap-2">
              <Input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} className="w-auto" />
              <Input value={exportOrdre} onChange={e => setExportOrdre(e.target.value)} placeholder="N° d'ordre ex: 020/DG/GSS/2026" className="w-48" />
              <Button variant="outline" icon="📥" onClick={handleExportPresents}>
                Exporter employés présents (Excel)
              </Button>
            </div>
          </div>
        </CardHeader>
        <p className="px-5 -mt-2 pb-1 text-[11px] text-slate-400">
          Génère un fichier Excel au format "Ordre de virement" GSS (en-tête, motif, tableau, total, signature) — un onglet par banque (BPM, Caisse, SGM), pour les employés qui ne sont PAS en congé sur le mois sélectionné.
        </p>
        {leaves.length === 0 ? <EmptyState icon="🗓️" text="Aucun congé enregistré" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-5">
            {leaves.map(l => {
              const emp = employees.find(e => e.id === l.employeeId);
              return (
                <div key={l.id} className="rounded-xl border border-slate-200 p-4 bg-white hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{LEAVE_ICONS[l.type]}</span>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{emp?.name ?? '—'}</p>
                        <p className="text-[11px] text-slate-400">{LEAVE_LABELS[l.type]}</p>
                      </div>
                    </div>
                    <button onClick={() => removeLeave(l.id)} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                    <span>{l.dateDebut} → {l.dateFin}</span>
                    <span className="font-bold text-slate-700">{l.jours}j</span>
                  </div>
                  {l.motif && <p className="text-[11px] text-slate-400 mt-2 italic truncate" title={l.motif}>{l.motif}</p>}
                  <p className="text-[10px] text-slate-300 mt-2">Ajouté par {l.createdBy || '—'}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Employee modal */}
      <Modal open={empModal} onClose={() => setEmpModal(false)} title={editing ? `✏️ Modifier ${editing.name}` : '➕ Nouvel Employé'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Matricule</label>
              <Input value={form.mle ?? ''} onChange={e => setForm(f => ({ ...f, mle: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom complet *</label>
              <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Poste</label>
              <Input value={form.poste ?? ''} onChange={e => setForm(f => ({ ...f, poste: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Téléphone</label>
              <Input value={form.telephone ?? ''} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">NNI</label>
              <Input value={form.nni ?? ''} onChange={e => setForm(f => ({ ...f, nni: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ville</label>
              <Input value={form.ville ?? ''} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} placeholder="NKTT, NDB, KEADI, ROSSO..." />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Équipe (RH)</label>
            <Input value={form.equipeNom ?? ''} onChange={e => setForm(f => ({ ...f, equipeNom: e.target.value }))} placeholder="ARAFAT, CENTRE VILLE, TVZ, Déploiement..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Banque</label>
              <Select className="w-full" value={form.banque ?? ''} onChange={e => setForm(f => ({ ...f, banque: e.target.value || undefined }))}>
                <option value="">— Choisir —</option>
                {BANQUES.map(b => <option key={b} value={b}>{b}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">RIB</label>
              <Input value={form.rib ?? ''} onChange={e => setForm(f => ({ ...f, rib: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Montant net (MRU)</label>
              <Input type="number" value={form.montant ?? ''} onChange={e => setForm(f => ({ ...f, montant: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Statut</label>
              <Select value={form.actif ? '1' : '0'} onChange={e => setForm(f => ({ ...f, actif: e.target.value === '1' }))}>
                <option value="1">Actif</option>
                <option value="0">Inactif</option>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setEmpModal(false)}>Annuler</Button>
            <Button onClick={saveEmployee}>💾 Enregistrer</Button>
          </div>
        </div>
      </Modal>

      {/* Congé modal */}
      <Modal open={congeModal} onClose={() => setCongeModal(false)} title={`🗓️ Congé — ${congeEmployee?.name ?? ''}`}>
        <div className="space-y-4">
          {congeEmployee && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2">
              Solde congé annuel restant : <strong>{soldeFor(congeEmployee.id)} jours</strong> / {SOLDE_ANNUEL}
            </p>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type</label>
            <Select className="w-full" value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value as LeaveType }))}>
              {Object.entries(LEAVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Du</label>
              <input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                value={leaveForm.dateDebut} onChange={e => setLeaveForm(f => ({ ...f, dateDebut: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Au</label>
              <input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                value={leaveForm.dateFin} onChange={e => setLeaveForm(f => ({ ...f, dateFin: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Motif / note</label>
            <Textarea rows={2} value={leaveForm.motif} onChange={e => setLeaveForm(f => ({ ...f, motif: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setCongeModal(false)}>Annuler</Button>
            <Button onClick={saveConge}>✓ Enregistrer le congé</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
