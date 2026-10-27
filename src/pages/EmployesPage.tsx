import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Modal, Select, Input, EmptyState, StatCard, useToast, BtnEdit, BtnDelete } from '@/components/ui';
import { BANQUES } from '@/data';
import { exportEmployesListExcel } from '@/utils/leaves';
import type { Employee } from '@/types';

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
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export default function EmployesPage() {
  const employees = useAppStore((s) => s.employees);
  const leaves = useAppStore((s) => s.leaves);
  const loans = useAppStore((s) => s.loans);
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const addEmployee = useAppStore((s) => s.addEmployee);
  const editEmployee = useAppStore((s) => s.editEmployee);
  const removeEmployee = useAppStore((s) => s.removeEmployee);
  const { showToast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []);

  const [search, setSearch] = useState('');
  const [fVille, setFVille] = useState('');
  const [fStatut, setFStatut] = useState<'tous' | 'actif' | 'inactif'>('tous');
  const [fBanque, setFBanque] = useState('');

  const [empModal, setEmpModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<Employee>>({ actif: true });
  const [saving, setSaving] = useState(false);

  const villes = useMemo(
    () => [...new Set(employees.map((e) => e.ville).filter(Boolean))].sort() as string[],
    [employees],
  );

  // Prêts actifs groupés par employé
  const activeLoansByEmp = useMemo(() => {
    const map = new Map<string, { count: number; totalMensualite: number; totalReste: number }>();
    loans.forEach((l) => {
      if (l.statut === 'actif' && l.reste > 0) {
        const cur = map.get(l.employeeId) || { count: 0, totalMensualite: 0, totalReste: 0 };
        cur.count += 1;
        cur.totalMensualite += Math.min(l.mensualite, l.reste);
        cur.totalReste += l.reste;
        map.set(l.employeeId, cur);
      }
    });
    return map;
  }, [loans]);

  // Solde de congé annuel restant — cumul global tous mois confondus (22 jours au total)
  const soldeFor = (empId: string) => {
    const taken = leaves
      .filter((l) => l.employeeId === empId && l.type === 'annuel')
      .reduce((a, l) => a + l.jours, 0);
    return SOLDE_ANNUEL - taken;
  };


  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (fVille && e.ville !== fVille) return false;
      if (fStatut === 'actif' && !e.actif) return false;
      if (fStatut === 'inactif' && e.actif) return false;
      if (fBanque && (e.banque || 'Caisse') !== fBanque) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        (e.mle ?? '').toLowerCase().includes(q) ||
        (e.poste ?? '').toLowerCase().includes(q) ||
        (e.telephone ?? '').toLowerCase().includes(q) ||
        (e.nni ?? '').toLowerCase().includes(q) ||
        (e.equipeNom ?? '').toLowerCase().includes(q) ||
        (e.ville ?? '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, fVille, fStatut, fBanque]);

  const counts = useMemo(() => {
    const total = employees.length;
    const actifs = employees.filter((e) => e.actif).length;
    const inactifs = total - actifs;
    const chefs = employees.filter((e) => (e.poste ?? '').toLowerCase().includes('chef')).length;
    const techniciens = employees.filter((e) => (e.poste ?? '').toLowerCase().includes('technicien')).length;
    const masseSalariale = employees.filter((e) => e.actif).reduce((acc, e) => acc + (e.montant || 0), 0);
    return { total, actifs, inactifs, chefs, techniciens, masseSalariale };
  }, [employees]);

  const openNew = () => {
    setEditing(null);
    setForm({
      actif: true,
      mle: '',
      name: '',
      poste: 'Technicien',
      telephone: '',
      nni: '',
      ville: 'NKTT',
      equipeNom: '',
      banque: 'Caisse',
      rib: '',
      montant: undefined,
      dateEmbauche: new Date().toISOString().slice(0, 10),
    });
    setEmpModal(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({ ...emp });
    setEmpModal(true);
  };

  const saveEmployee = async () => {
    if (!form.name?.trim()) {
      showToast('Le nom complet est obligatoire', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await editEmployee(editing.id, form);
        showToast(`Employé ${form.name} mis à jour avec succès`, 'success');
      } else {
        await addEmployee(form);
        showToast(`Nouvel employé ${form.name} créé avec succès`, 'success');
      }
      setEmpModal(false);
      setEditing(null);
    } catch (err: any) {
      showToast('Erreur : ' + (err?.message || 'échec de l’enregistrement'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    if (!filtered.length) {
      showToast('Aucun employé à exporter', 'error');
      return;
    }
    await exportEmployesListExcel(filtered);
    showToast('Export Excel des employés téléchargé avec succès', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Employés</h1>
          <p className="text-slate-400 text-sm">
            Annuaire du personnel GSS, fiches employés, salaires et suivi des statuts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            Exporter la liste (Excel)
          </Button>
          <Button onClick={openNew}>
            Nouvel Employé
          </Button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard value={counts.total} label="Total employés" icon="" accent="#1565C0" />
        <StatCard value={counts.actifs} label="Actifs" icon="" accent="#2E7D32" />
        <StatCard value={counts.chefs} label="Chefs d'équipe" icon="" accent="#E9A93B" />
        <StatCard value={counts.techniciens} label="Techniciens" icon="" accent="#00838F" />
        <StatCard
          value={`${counts.masseSalariale.toLocaleString('fr-FR')} MRU`}
          label="Masse salariale mensuelle"
          icon=""
          accent="#546E7A"
        />
      </div>

      {/* ── Table des employés ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap w-full">
            <CardTitle>Liste du personnel ({filtered.length})</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 max-w-sm">
                <input
                  className="bg-transparent text-sm focus:outline-none w-52"
                  placeholder="Nom, mle, équipe, téléphone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Select value={fVille} onChange={(e) => setFVille(e.target.value)} style={{ width: 'auto' }}>
                <option value="">Toutes les villes</option>
                {villes.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>

              <Select value={fBanque} onChange={(e) => setFBanque(e.target.value)} style={{ width: 'auto' }}>
                <option value="">Toutes les banques</option>
                <option value="BPM">BPM</option>
                <option value="Caisse">Caisse</option>
                <option value="SGM">SGM</option>
              </Select>

              <Select
                value={fStatut}
                onChange={(e) => setFStatut(e.target.value as any)}
                style={{ width: 'auto' }}
              >
                <option value="tous">Tous les statuts</option>
                <option value="actif">Actifs uniquement</option>
                <option value="inactif">Inactifs uniquement</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="" text="Aucun employé correspondant" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-100">
                <tr>
                  <th className="px-3 py-3 text-left">Employé</th>
                  <th className="px-3 py-3 text-left">Poste</th>
                  <th className="px-3 py-3 text-left">Équipe / Ville</th>
                  <th className="px-3 py-3 text-left">Téléphone</th>
                  <th className="px-3 py-3 text-left">Banque & RIB</th>
                  <th className="px-3 py-3 text-right">Salaire Net</th>
                  <th className="px-3 py-3 text-center">Prêts en cours</th>
                  <th className="px-3 py-3 text-center">Solde congé</th>
                  <th className="px-3 py-3 text-center">Statut</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => {
                  const solde = soldeFor(e.id);
                  const posteKey = (e.poste ?? '').toLowerCase();
                  const posteStyle = POSTE_STYLES[posteKey] ?? 'bg-slate-100 text-slate-600';
                  const avatarColor = colorFor(e.name);
                  const loanInfo = activeLoansByEmp.get(e.id);

                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ background: avatarColor }}
                          >
                            {e.name
                              .split(' ')
                              .slice(0, 2)
                              .map((w) => w[0])
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{e.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {e.mle ? `Mle ${e.mle}` : 'Sans matricule'}
                              {e.nni ? ` · NNI: ${e.nni}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${posteStyle}`}>
                          {e.poste || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-slate-700 text-xs font-medium">{e.equipeNom || '—'}</p>
                        <p className="text-[11px] text-slate-400">{e.ville || '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{e.telephone || '—'}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-700 text-xs">{e.banque || 'Caisse'}</p>
                        {e.rib ? (
                          <p className="text-[11px] text-slate-400 font-mono">{e.rib}</p>
                        ) : (
                          <p className="text-[11px] text-slate-300 italic">Sans RIB</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                        {e.montant ? `${e.montant.toLocaleString('fr-FR')} MRU` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {loanInfo ? (
                          <span
                            className="inline-flex flex-col items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold"
                            title={`Reste total dû : ${loanInfo.totalReste.toLocaleString('fr-FR')} MRU`}
                          >
                            <span>{loanInfo.count} prêt{loanInfo.count > 1 ? 's' : ''}</span>
                            <span className="text-[9px] font-normal text-amber-600">
                              -{loanInfo.totalMensualite.toLocaleString('fr-FR')}/mois
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            solde < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {solde}j / {SOLDE_ANNUEL}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            e.actif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {e.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <BtnEdit onClick={() => openEdit(e)} />
                          <BtnDelete
                            onClick={() => {
                              if (confirm(`Supprimer définitivement l'employé ${e.name} ?`)) {
                                removeEmployee(e.id);
                                showToast(`${e.name} supprimé`, 'success');
                              }
                            }}
                          />
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

      {/* ── Modal Création / Édition Employé ── */}
      <Modal
        open={empModal}
        onClose={() => setEmpModal(false)}
        title={editing ? `Modifier l'employé : ${editing.name}` : 'Créer un nouvel employé'}
      >
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Matricule (Mle)</label>
              <Input
                placeholder="Ex: 0142"
                value={form.mle ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, mle: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Nom complet *</label>
              <Input
                placeholder="Ex: Mohamed Lemine"
                value={form.name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Poste</label>
              <Input
                placeholder="Technicien, Chef d'équipe..."
                value={form.poste ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, poste: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Téléphone</label>
              <Input
                placeholder="Ex: 46001122"
                value={form.telephone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">NNI</label>
              <Input
                placeholder="10 chiffres"
                value={form.nni ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, nni: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Ville</label>
              <Input
                placeholder="NKTT, NDB, KAEDI..."
                value={form.ville ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, ville: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Équipe (RH)</label>
              <Input
                placeholder="ARAFAT, CENTRE VILLE..."
                value={form.equipeNom ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, equipeNom: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date d'embauche</label>
              <Input
                type="date"
                value={form.dateEmbauche ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dateEmbauche: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Banque</label>
              <Select
                className="w-full"
                value={form.banque ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, banque: e.target.value || undefined }))}
              >
                <option value="">— Choisir —</option>
                {BANQUES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">RIB / Numéro de compte</label>
              <Input
                placeholder="Numéro sans espace"
                value={form.rib ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, rib: e.target.value.replace(/\s+/g, '') }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Salaire Net (MRU)</label>
              <Input
                type="number"
                placeholder="Ex: 35000"
                value={form.montant ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, montant: parseFloat(e.target.value) || undefined }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Statut</label>
              <Select
                value={form.actif ? '1' : '0'}
                onChange={(e) => setForm((f) => ({ ...f, actif: e.target.value === '1' }))}
              >
                <option value="1">Actif</option>
                <option value="0">Inactif</option>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setEmpModal(false)}>
              Annuler
            </Button>
            <Button onClick={saveEmployee} disabled={saving}>
              {saving ? 'Enregistrement...' : editing ? 'Mettre à jour' : 'Créer l’employé'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}