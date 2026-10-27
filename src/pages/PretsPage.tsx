import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Modal, Select, Input, EmptyState, StatCard, useToast, BtnEdit, BtnDelete } from '@/components/ui';
import type { Employee, Loan } from '@/types';
import { fetchLoanPayments } from '@/lib/supabaseService';
import { exportPretsExcel } from '@/utils/leaves';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function PretsPage() {
  const employees = useAppStore((s) => s.employees);
  const loans = useAppStore((s) => s.loans);
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const addLoan = useAppStore((s) => s.addLoan);
  const editLoan = useAppStore((s) => s.editLoan);
  const removeLoan = useAppStore((s) => s.removeLoan);
  const recordLoanPayment = useAppStore((s) => s.recordLoanPayment);
  const { showToast } = useToast();

  const [paidLoanIdsThisMonth, setPaidLoanIdsThisMonth] = useState<Set<string>>(new Set());
  const month = currentMonth();

  const loadPayments = async () => {
    try {
      const pays = await fetchLoanPayments();
      const thisMonth = new Set(pays.filter((p) => p.month === month).map((p) => p.loanId));
      setPaidLoanIdsThisMonth(thisMonth);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadEmployees();
    loadPayments();
  }, []);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  // Regroupement des prêts par employé pour gérer le multi-prêts
  const loansByEmpId = useMemo(() => {
    const map = new Map<string, Loan[]>();
    loans.forEach((l) => {
      const list = map.get(l.employeeId) || [];
      list.push(l);
      map.set(l.employeeId, list);
    });
    return map;
  }, [loans]);

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<'tous' | 'actif' | 'solde'>('tous');

  const [addOpen, setAddOpen] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [fEmployee, setFEmployee] = useState('');
  const [fMontant, setFMontant] = useState('');
  const [fMensualite, setFMensualite] = useState('');
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fDuree, setFDuree] = useState('');
  const [fBanqueCaisse, setFBanqueCaisse] = useState('');
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const actifs = loans.filter((l) => l.statut === 'actif');
    return {
      total: loans.length,
      actifs: actifs.length,
      soldes: loans.filter((l) => l.statut === 'solde').length,
      resteTotal: actifs.reduce((s, l) => s + l.reste, 0),
      mensualitesTotal: actifs.reduce((s, l) => s + Math.min(l.mensualite, l.reste), 0),
    };
  }, [loans]);

  // Prêts filtrés pour affichage
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (filterStatut !== 'tous' && l.statut !== filterStatut) return false;
      if (search) {
        const emp = employeeById.get(l.employeeId);
        const q = search.toLowerCase();
        const matchName = (emp?.name || '').toLowerCase().includes(q);
        const matchMle = (emp?.mle || '').toLowerCase().includes(q);
        const matchBq = (l.banqueCaisse || '').toLowerCase().includes(q);
        if (!matchName && !matchMle && !matchBq) return false;
      }
      return true;
    });
  }, [loans, filterStatut, search, employeeById]);

  // Info sur les prêts existants de l'employé sélectionné dans le modal
  const selectedEmpLoans = useMemo(() => {
    if (!fEmployee) return [];
    return loans.filter((l) => l.employeeId === fEmployee && l.statut === 'actif');
  }, [fEmployee, loans]);

  const resetForm = () => {
    setFEmployee('');
    setFMontant('');
    setFMensualite('');
    setFDate(new Date().toISOString().slice(0, 10));
    setFDuree('');
    setFBanqueCaisse('');
  };

  const handleSubmit = async () => {
    if (!fEmployee || !fMontant || !fMensualite || !fDate) {
      showToast('Employé, montant, mensualité et date sont obligatoires', 'error');
      return;
    }
    const m = Number(fMontant);
    const mens = Number(fMensualite);
    if (m <= 0 || mens <= 0) {
      showToast('Le montant et la mensualité doivent être supérieurs à 0', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingLoanId) {
        await editLoan(editingLoanId, {
          montantTotal: m,
          mensualite: mens,
          dateDebut: fDate,
          dureeMois: fDuree ? Number(fDuree) : undefined,
          banqueCaisse: fBanqueCaisse || undefined,
        });
        showToast('Prêt modifié avec succès', 'success');
      } else {
        await addLoan({
          employeeId: fEmployee,
          montantTotal: m,
          mensualite: mens,
          dateDebut: fDate,
          dureeMois: fDuree ? Number(fDuree) : undefined,
          banqueCaisse: fBanqueCaisse || undefined,
        });
        showToast('Nouveau prêt enregistré avec succès', 'success');
      }
      setAddOpen(false);
      setEditingLoanId(null);
      resetForm();
    } catch (err: any) {
      showToast('Échec — ' + (err?.message || 'erreur inconnue'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (l: Loan) => {
    setEditingLoanId(l.id);
    setFEmployee(l.employeeId);
    setFMontant(String(l.montantTotal));
    setFMensualite(String(l.mensualite));
    setFDate(l.dateDebut);
    setFDuree(l.dureeMois ? String(l.dureeMois) : '');
    setFBanqueCaisse(l.banqueCaisse || '');
    setAddOpen(true);
  };

  const handleDelete = async (l: Loan) => {
    const emp = employeeById.get(l.employeeId);
    if (
      !confirm(
        `Supprimer définitivement le prêt de ${emp?.name || 'cet employé'} (${l.montantTotal.toLocaleString('fr-FR')} MRU) ?\n\nCette action est irréversible et supprime aussi son historique de prélèvements.`,
      )
    )
      return;
    try {
      await removeLoan(l.id);
      showToast('Prêt supprimé', 'success');
    } catch (err: any) {
      showToast('Échec — ' + (err?.message || 'erreur inconnue'), 'error');
    }
  };

  const handlePrelever = async (loanId: string) => {
    try {
      await recordLoanPayment(loanId, month);
      await loadPayments();
      showToast('Mensualité prélevée avec succès', 'success');
    } catch {
      // toast géré par le store
    }
  };

  const handleExportExcel = async () => {
    if (!loans.length) {
      showToast('Aucun prêt à exporter', 'error');
      return;
    }
    await exportPretsExcel(filteredLoans, employees);
    showToast('Fichier Excel des prêts généré avec succès', 'success');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Prêts Employés</h1>
          <p className="text-slate-400 text-sm">
            Un employé peut avoir plusieurs prêts simultanés. Chaque mensualité active est automatiquement déduite de son salaire dans l'export Excel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            Exporter (Excel)
          </Button>
          <Button
            onClick={() => {
              setEditingLoanId(null);
              resetForm();
              setAddOpen(true);
            }}
          >
            Nouveau prêt
          </Button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={stats.total} label="Prêts enregistrés" icon="" accent="#546E7A" />
        <StatCard value={stats.actifs} label="Prêts actifs" icon="" accent="#1565C0" />
        <StatCard
          value={`${stats.mensualitesTotal.toLocaleString('fr-FR')} MRU`}
          label="Mensualités cumulées / mois"
          icon=""
          accent="#E9A93B"
        />
        <StatCard
          value={`${stats.resteTotal.toLocaleString('fr-FR')} MRU`}
          label="Reste dû total"
          icon=""
          accent="#C62828"
        />
      </div>

      {/* ── Liste des prêts ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap w-full">
            <CardTitle>Liste des prêts ({filteredLoans.length})</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 max-w-xs">
                <input
                  className="bg-transparent text-sm focus:outline-none w-44"
                  placeholder="Recherche employé, mle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as any)}
                style={{ width: 'auto' }}
              >
                <option value="tous">Tous les statuts</option>
                <option value="actif">Actifs uniquement</option>
                <option value="solde">Soldés uniquement</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        {filteredLoans.length === 0 ? (
          <EmptyState icon="" text="Aucun prêt correspondant aux critères" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-100">
                <tr>
                  <th className="px-3 py-3 text-left">Employé</th>
                  <th className="px-3 py-3 text-left">Banque/Caisse</th>
                  <th className="px-3 py-3 text-left">Date début</th>
                  <th className="px-3 py-3 text-right">Montant total</th>
                  <th className="px-3 py-3 text-right">Mensualité</th>
                  <th className="px-3 py-3 text-right">Reste dû</th>
                  <th className="px-3 py-3 text-center">Statut</th>
                  <th className="px-3 py-3 text-center">Échéance ({month})</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLoans.map((l) => {
                  const emp = employeeById.get(l.employeeId);
                  const empAllLoans = loansByEmpId.get(l.employeeId) || [];
                  const isMulti = empAllLoans.length > 1;
                  const loanIdx = empAllLoans.findIndex((x) => x.id === l.id) + 1;
                  const isPaidThisMonth = paidLoanIdsThisMonth.has(l.id);

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-semibold text-slate-800">{emp?.name || '—'}</p>
                            <p className="text-[11px] text-slate-400">
                              Mle {emp?.mle || '—'}
                              {emp?.ville ? ` · ${emp.ville}` : ''}
                            </p>
                          </div>
                          {isMulti && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                              title={`Cet employé a ${empAllLoans.length} prêts au total`}
                            >
                              Prêt {loanIdx}/{empAllLoans.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 font-medium">{l.banqueCaisse || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {l.dateDebut}
                        {l.dureeMois ? ` (${l.dureeMois} mois)` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                        {l.montantTotal.toLocaleString('fr-FR')} MRU
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-amber-600">
                        {l.mensualite.toLocaleString('fr-FR')} MRU
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                        {l.reste.toLocaleString('fr-FR')} MRU
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            l.statut === 'actif' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {l.statut === 'actif' ? 'Actif' : 'Soldé'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {l.statut === 'solde' ? (
                          <span className="text-[11px] text-slate-400 italic">Soldé</span>
                        ) : isPaidThisMonth ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Prélevé ce mois
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePrelever(l.id)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95 shadow-sm"
                          >
                            Prélever ce mois
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <BtnEdit onClick={() => openEdit(l)} />
                          <BtnDelete onClick={() => handleDelete(l)} />
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

      {/* ── Modal Prêt (Ajout / Modification) ── */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditingLoanId(null);
        }}
        title={editingLoanId ? 'Modifier le prêt' : 'Nouveau prêt employé'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Employé *</label>
            <Select
              className="w-full"
              value={fEmployee}
              onChange={(e) => setFEmployee(e.target.value)}
              disabled={!!editingLoanId}
            >
              <option value="">-- Sélectionner un employé --</option>
              {employees.map((e) => {
                const count = (loansByEmpId.get(e.id) || []).filter((l) => l.statut === 'actif').length;
                return (
                  <option key={e.id} value={e.id}>
                    {e.mle ? `${e.mle} — ` : ''}
                    {e.name}
                    {count > 0 ? ` (${count} prêt${count > 1 ? 's' : ''} en cours)` : ''}
                  </option>
                );
              })}
            </Select>
            {editingLoanId && (
              <p className="text-[11px] text-slate-400 mt-1">L'employé ne peut pas être modifié après création.</p>
            )}
            {!editingLoanId && selectedEmpLoans.length > 0 && (
              <div className="mt-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  Cet employé a déjà {selectedEmpLoans.length} prêt{selectedEmpLoans.length > 1 ? 's' : ''} actif
                  {selectedEmpLoans.length > 1 ? 's' : ''} en cours :
                </p>
                <p>
                  • Reste total dû actuel :{' '}
                  <strong>{selectedEmpLoans.reduce((s, l) => s + l.reste, 0).toLocaleString('fr-FR')} MRU</strong>
                </p>
                <p>
                  • Mensualités déjà retenues :{' '}
                  <strong>
                    {selectedEmpLoans.reduce((s, l) => s + Math.min(l.mensualite, l.reste), 0).toLocaleString('fr-FR')} MRU/mois
                  </strong>
                </p>
                <p className="text-[11px] text-amber-700 italic pt-0.5">
                  Ce nouveau prêt viendra s'ajouter : sa mensualité sera cumulée avec les autres retenues sur son salaire.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Montant total (MRU) *</label>
              <Input
                type="number"
                placeholder="Ex: 50000"
                value={fMontant}
                onChange={(e) => setFMontant(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Mensualité à retenir (MRU) *</label>
              <Input
                type="number"
                placeholder="Ex: 5000"
                value={fMensualite}
                onChange={(e) => setFMensualite(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Date de début *</label>
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Durée (mois, optionnel)</label>
              <Input
                type="number"
                placeholder="Ex: 10"
                value={fDuree}
                onChange={(e) => setFDuree(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Banque / Caisse</label>
            <Select
              className="w-full"
              value={fBanqueCaisse}
              onChange={(e) => setFBanqueCaisse(e.target.value)}
            >
              <option value="">-- Sélectionner --</option>
              <option value="Banque">Banque</option>
              <option value="Caisse">Caisse</option>
              <option value="BPM">BPM</option>
              <option value="SGM">SGM</option>
            </Select>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setEditingLoanId(null);
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Enregistrement...' : editingLoanId ? 'Enregistrer les modifications' : 'Créer le prêt'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}