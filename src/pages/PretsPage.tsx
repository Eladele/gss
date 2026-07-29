import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Modal, Select, Input, EmptyState, StatCard, useToast } from '@/components/ui';
import type { Employee } from '@/types';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function PretsPage() {
  const employees = useAppStore((s) => s.employees);
  const loans = useAppStore((s) => s.loans);
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const addLoan = useAppStore((s) => s.addLoan);
  const recordLoanPayment = useAppStore((s) => s.recordLoanPayment);
  const { showToast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const [addOpen, setAddOpen] = useState(false);
  const [fEmployee, setFEmployee] = useState('');
  const [fMontant, setFMontant] = useState('');
  const [fMensualite, setFMensualite] = useState('');
  const [fDate, setFDate] = useState('');
  const [fDuree, setFDuree] = useState('');
  const [fBanqueCaisse, setFBanqueCaisse] = useState('');
  const [saving, setSaving] = useState(false);

  const month = currentMonth();

  const stats = useMemo(() => {
    const actifs = loans.filter((l) => l.statut === 'actif');
    return {
      total: loans.length,
      actifs: actifs.length,
      resteTotal: actifs.reduce((s, l) => s + l.reste, 0),
      mensualitesTotal: actifs.reduce((s, l) => s + Math.min(l.mensualite, l.reste), 0),
    };
  }, [loans]);

  const resetForm = () => {
    setFEmployee('');
    setFMontant('');
    setFMensualite('');
    setFDate('');
    setFDuree('');
    setFBanqueCaisse('');
  };

  const handleAdd = async () => {
    if (!fEmployee || !fMontant || !fMensualite || !fDate) {
      showToast('Employé, montant, mensualité et date sont obligatoires', 'error');
      return;
    }
    setSaving(true);
    try {
      await addLoan({
        employeeId: fEmployee,
        montantTotal: Number(fMontant),
        mensualite: Number(fMensualite),
        dateDebut: fDate,
        dureeMois: fDuree ? Number(fDuree) : undefined,
        banqueCaisse: fBanqueCaisse || undefined,
      });
      setAddOpen(false);
      resetForm();
    } catch (err: any) {
      showToast('Échec — ' + (err?.message || 'erreur inconnue'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrelever = async (loanId: string) => {
    try {
      await recordLoanPayment(loanId, month);
    } catch {
      // toast déjà affiché par le store
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Prêts employés</h1>
          <p className="text-slate-400 text-sm">
            La mensualité en cours est déduite automatiquement du salaire dans l'export "Ordre de virement".
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Nouveau prêt</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={stats.total} label="Prêts au total" icon="" accent="#546E7A" />
        <StatCard value={stats.actifs} label="Prêts actifs" icon="" accent="#1565C0" />
        <StatCard value={`${stats.mensualitesTotal.toLocaleString('fr-FR')} MRU`} label="Mensualités du mois" icon="" accent="#E9A93B" />
        <StatCard value={`${stats.resteTotal.toLocaleString('fr-FR')} MRU`} label="Reste dû total" icon="" accent="#C62828" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des prêts</CardTitle>
        </CardHeader>
        {loans.length === 0 ? (
          <EmptyState icon="" text="Aucun prêt enregistré" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Employé</th>
                  <th className="px-3 py-2 text-left">Banque/Caisse</th>
                  <th className="px-3 py-2 text-center">Montant total</th>
                  <th className="px-3 py-2 text-center">Mensualité</th>
                  <th className="px-3 py-2 text-center">Reste dû</th>
                  <th className="px-3 py-2 text-center">Statut</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loans.map((l) => {
                  const emp = employeeById.get(l.employeeId);
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800">{emp?.name || '—'}</p>
                        <p className="text-[11px] text-slate-400">Mle {emp?.mle}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{l.banqueCaisse || '—'}</td>
                      <td className="px-3 py-2 text-center">{l.montantTotal.toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-center">{l.mensualite.toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-center font-semibold">{l.reste.toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${l.statut === 'actif' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
                        >
                          {l.statut === 'actif' ? 'Actif' : 'Soldé'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.statut === 'actif' && (
                          <button
                            onClick={() => handlePrelever(l.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95"
                          >
                            Prélever ce mois
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Nouveau prêt">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Employé</label>
            <Select className="w-full" value={fEmployee} onChange={(e) => setFEmployee(e.target.value)}>
              <option value="">-- Sélectionner --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.mle} — {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Montant total (MRU)</label>
              <Input type="number" value={fMontant} onChange={(e) => setFMontant(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Mensualité (MRU)</label>
              <Input type="number" value={fMensualite} onChange={(e) => setFMensualite(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Date de début</label>
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Durée (mois, optionnel)</label>
              <Input type="number" value={fDuree} onChange={(e) => setFDuree(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Banque / Caisse</label>
            <Select className="w-full" value={fBanqueCaisse} onChange={(e) => setFBanqueCaisse(e.target.value)}>
              <option value="">-- Sélectionner --</option>
              <option value="Banque">Banque</option>
              <option value="Caisse">Caisse</option>
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? '...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}