import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Modal, Select, Input, EmptyState, useToast, BtnEdit, BtnDelete } from '@/components/ui';
import type { Employee, Loan } from '@/types';
import { exportPretsExcel } from '@/utils/leaves';
import { libelleMois, moisPaieCourant, moisPremierAuto, nbEcheances, planPret, premierPrelevement, type PlanPret } from '@/utils/prets';
import { Search, Plus, FileSpreadsheet, CalendarClock, Wallet, Users, HandCoins, CheckCircle2, AlertTriangle, BadgeCheck } from 'lucide-react';

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} MRU`;
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err ?? 'erreur inconnue'));

const AVATAR_PALETTE = ['#1565C0', '#2E7D32', '#E9A93B', '#8E24AA', '#00838F', '#C62828', '#546E7A'];
function couleur(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function initiales(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <div
      className={`${size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs'} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ background: couleur(name) }}
    >
      {initiales(name) || '?'}
    </div>
  );
}

/** Barre de progression du remboursement */
function Progression({ loan }: { loan: Loan }) {
  const rembourse = Math.max(0, loan.montantTotal - loan.reste);
  const pct = loan.montantTotal > 0 ? Math.min(100, Math.round((rembourse / loan.montantTotal) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${loan.statut === 'solde' ? 'bg-emerald-500' : 'bg-blue-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        {fmt(rembourse)} remboursés · {pct}%
      </p>
    </div>
  );
}

function StatutBadge({ loan }: { loan: Loan }) {
  if (loan.statut === 'actif')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">Actif</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700"
      title={loan.motifSolde}
    >
      Soldé{loan.soldeHorsSalaireLe ? ' · sans prélèvement' : ''}
    </span>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 flex items-center gap-3 min-w-0">
      <div className="p-2 rounded-lg shrink-0" style={{ background: `${accent}14`, color: accent }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base sm:text-xl font-black text-slate-900 truncate">{value}</p>
        <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">{label}</p>
      </div>
    </div>
  );
}

type ActionConfirm = { type: 'prelever' | 'solder' | 'supprimer'; loan: Loan };

export default function PretsPage() {
  const employees = useAppStore((s) => s.employees);
  const loans = useAppStore((s) => s.loans);
  const leaves = useAppStore((s) => s.leaves);
  const loanPayments = useAppStore((s) => s.loanPayments);
  const salaryMonths = useAppStore((s) => s.salaryMonths);
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const addLoan = useAppStore((s) => s.addLoan);
  const editLoan = useAppStore((s) => s.editLoan);
  const removeLoan = useAppStore((s) => s.removeLoan);
  const recordLoanPayment = useAppStore((s) => s.recordLoanPayment);
  const solderPret = useAppStore((s) => s.solderPret);
  const role = useAppStore((s) => s.user?.role);
  const superadmin = useAppStore((s) => s.user?.superadmin);
  const peutSolder = !!superadmin || role === 'admin' || role === 'directeur';
  const { showToast } = useToast();

  const ctxPaie = useMemo(() => ({ payments: loanPayments, salaryMonths }), [loanPayments, salaryMonths]);
  // mois de paie en cours = celui qui suit la dernière distribution validée
  const month = moisPaieCourant(ctxPaie);
  const paidLoanIdsThisMonth = useMemo(
    () => new Set(loanPayments.filter((p) => p.month === month).map((p) => p.loanId)),
    [loanPayments, month],
  );

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

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
  const [filterStatut, setFilterStatut] = useState<'tous' | 'actif' | 'solde'>('actif');

  const [addOpen, setAddOpen] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [fEmployee, setFEmployee] = useState('');
  const [fMontant, setFMontant] = useState('');
  const [fMensualite, setFMensualite] = useState('');
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fBanqueCaisse, setFBanqueCaisse] = useState('');
  // 1er prélèvement : automatique (mois du prêt) sauf si l'admin le change
  const [fPremier, setFPremier] = useState('');
  const [saving, setSaving] = useState(false);

  // confirmation (prélever / solder / supprimer) avec le nom de l'employé
  const [confirmation, setConfirmation] = useState<ActionConfirm | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);

  // plan de chaque prêt : 1er mois, mois non prélevés, fin prévue, durée réelle
  const plans = useMemo(() => {
    const map = new Map<string, PlanPret>();
    loans.forEach((l) => map.set(l.id, planPret(l, ctxPaie, { leaves, employee: employeeById.get(l.employeeId) })));
    return map;
  }, [loans, ctxPaie, leaves, employeeById]);

  // aperçu automatique dans le formulaire
  const premierAuto = fDate ? moisPremierAuto(fDate, ctxPaie) : '';
  const apercu = useMemo(() => {
    const m = Number(fMontant);
    const mens = Number(fMensualite);
    if (!(m > 0) || !(mens > 0) || !fDate) return null;
    const existant = editingLoanId ? loans.find((l) => l.id === editingLoanId) : undefined;
    const brouillon: Loan = {
      id: editingLoanId ?? '__nouveau__',
      employeeId: fEmployee,
      montantTotal: m,
      mensualite: mens,
      dateDebut: fDate,
      reste: Math.max(0, m - (existant ? existant.montantTotal - existant.reste : 0)),
      statut: 'actif',
      moisPremierPrelevement: fPremier || premierAuto,
    };
    if (brouillon.reste <= 0) brouillon.statut = 'solde';
    return { echeances: nbEcheances(m, mens), plan: planPret(brouillon, ctxPaie, { leaves, employee: employeeById.get(fEmployee) }) };
  }, [fMontant, fMensualite, fDate, fPremier, premierAuto, fEmployee, editingLoanId, loans, ctxPaie, leaves, employeeById]);

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

  // Prêts filtrés pour affichage (actifs d'abord, puis les plus récents)
  const filteredLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans
      .filter((l) => {
        if (filterStatut !== 'tous' && l.statut !== filterStatut) return false;
        if (q) {
          const emp = employeeById.get(l.employeeId);
          const match =
            (emp?.name || '').toLowerCase().includes(q) ||
            (emp?.mle || '').toLowerCase().includes(q) ||
            (l.banqueCaisse || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => (a.statut === b.statut ? b.dateDebut.localeCompare(a.dateDebut) : a.statut === 'actif' ? -1 : 1));
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
    setFBanqueCaisse('');
    setFPremier('');
  };

  const openNew = () => {
    setEditingLoanId(null);
    resetForm();
    setAddOpen(true);
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
        // durée, reste et fin prévue : recalculés automatiquement par la base
        await editLoan(editingLoanId, {
          montantTotal: m,
          mensualite: mens,
          dateDebut: fDate,
          banqueCaisse: fBanqueCaisse || undefined,
          moisPremierPrelevement: fPremier || premierAuto,
        });
        showToast('Prêt modifié avec succès', 'success');
      } else {
        await addLoan({
          employeeId: fEmployee,
          montantTotal: m,
          mensualite: mens,
          dateDebut: fDate,
          dureeMois: nbEcheances(m, mens),
          banqueCaisse: fBanqueCaisse || undefined,
          moisPremierPrelevement: fPremier || premierAuto,
        });
        showToast(`Prêt enregistré — 1er prélèvement : ${libelleMois(fPremier || premierAuto)}`, 'success');
      }
      setAddOpen(false);
      setEditingLoanId(null);
      resetForm();
    } catch (err) {
      showToast('Échec — ' + errText(err), 'error');
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
    setFBanqueCaisse(l.banqueCaisse || '');
    setFPremier(l.moisPremierPrelevement || '');
    setAddOpen(true);
  };

  const demander = (type: ActionConfirm['type'], loan: Loan) => {
    setMotif(type === 'solder' ? 'Cas exceptionnel' : '');
    setConfirmation({ type, loan });
  };

  const confirmer = async () => {
    if (!confirmation) return;
    const { type, loan } = confirmation;
    const nom = employeeById.get(loan.employeeId)?.name || 'employé';
    setBusy(true);
    try {
      if (type === 'prelever') {
        await recordLoanPayment(loan.id, month);
        showToast(`Mensualité prélevée — ${nom}`, 'success');
      } else if (type === 'solder') {
        await solderPret(loan.id, motif);
        showToast(`Prêt soldé sans prélèvement — ${nom}`, 'success');
      } else {
        await removeLoan(loan.id);
        showToast(`Prêt supprimé — ${nom}`, 'success');
      }
      setConfirmation(null);
    } catch (err) {
      showToast('Échec — ' + errText(err), 'error');
    } finally {
      setBusy(false);
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

  // ── Infos d'affichage d'un prêt (partagées carte mobile / tableau) ──
  const infos = (l: Loan) => {
    const emp = employeeById.get(l.employeeId);
    const empAllLoans = loansByEmpId.get(l.employeeId) || [];
    const premier = premierPrelevement(l, ctxPaie);
    return {
      emp,
      nom: emp?.name || '—',
      multi: empAllLoans.length > 1 ? `Prêt ${empAllLoans.findIndex((x) => x.id === l.id) + 1}/${empAllLoans.length}` : null,
      plan: plans.get(l.id),
      premier,
      payeCeMois: paidLoanIdsThisMonth.has(l.id),
      pasEncoreDu: month < premier,
      // soldable : actif, ou soldé avec une mensualité notée sur un mois pas encore distribué
      soldable:
        l.statut === 'actif' ||
        loanPayments.some((p) => p.loanId === l.id && !salaryMonths.some((s) => s.mois === p.month && s.statut === 'distribue')),
    };
  };

  const Echeance = ({ l }: { l: Loan }) => {
    const i = infos(l);
    if (l.statut === 'solde') return <span className="text-[11px] text-slate-400">—</span>;
    if (i.payeCeMois)
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" /> Prélevé
        </span>
      );
    if (i.pasEncoreDu) return <span className="text-[11px] text-slate-400 italic whitespace-nowrap">Dès {libelleMois(i.premier)}</span>;
    return (
      <Button size="sm" onClick={() => demander('prelever', l)} className="whitespace-nowrap justify-center">
        Prélever {fmt(Math.min(l.mensualite, l.reste))}
      </Button>
    );
  };

  const Calendrier = ({ l }: { l: Loan }) => {
    const { plan, premier } = infos(l);
    if (!plan) return null;
    const sautes = plan.nonPreleves.length + plan.sautesPrevus.length;
    return (
      <div className="text-xs space-y-0.5">
        <p className="text-slate-600">
          {libelleMois(premier)} → <span className="font-semibold text-slate-800">{libelleMois(plan.fin)}</span>{' '}
          <span className="text-slate-400">({plan.duree} mois)</span>
        </p>
        <p className="text-[11px] text-slate-400">
          {plan.nbPayes}/{plan.echeances} échéance{plan.echeances > 1 ? 's' : ''} prélevée{plan.nbPayes > 1 ? 's' : ''}
        </p>
        {sautes > 0 && (
          <p
            className="text-[11px] font-semibold text-amber-600"
            title={[
              plan.nonPreleves.length ? `Non prélevés : ${plan.nonPreleves.map(libelleMois).join(', ')}` : '',
              plan.sautesPrevus.length ? `Congé / suspension à venir : ${plan.sautesPrevus.map(libelleMois).join(', ')}` : '',
            ]
              .filter(Boolean)
              .join('\n')}
          >
            +{sautes} mois non prélevé{sautes > 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  };

  const Actions = ({ l, pleineLargeur = false }: { l: Loan; pleineLargeur?: boolean }) => {
    const i = infos(l);
    return (
      <div className={`flex gap-1.5 ${pleineLargeur ? 'flex-wrap' : 'justify-end'}`}>
        {peutSolder && i.soldable && (
          <button
            type="button"
            onClick={() => demander('solder', l)}
            title="Cas exceptionnel : le prêt se termine sans prélèvement sur le salaire"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 whitespace-nowrap"
          >
            <BadgeCheck className="w-3.5 h-3.5" /> Solder sans prélèvement
          </button>
        )}
        <BtnEdit iconOnly={!pleineLargeur} onClick={() => openEdit(l)} />
        <BtnDelete iconOnly={!pleineLargeur} onClick={() => demander('supprimer', l)} />
      </div>
    );
  };

  const filtres: { key: typeof filterStatut; label: string; n: number }[] = [
    { key: 'actif', label: 'Actifs', n: stats.actifs },
    { key: 'solde', label: 'Soldés', n: stats.soldes },
    { key: 'tous', label: 'Tous', n: stats.total },
  ];

  // ── Contenu de la confirmation ──
  const cLoan = confirmation?.loan;
  const cEmp = cLoan ? employeeById.get(cLoan.employeeId) : undefined;
  const cNom = cEmp?.name || 'cet employé';
  const cMontant = cLoan ? Math.min(cLoan.mensualite, cLoan.reste) : 0;

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in pb-10">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Prêts employés</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5 max-w-2xl">
            1er prélèvement le mois du prêt · durée automatique : un mois non prélevé (congé, salaire suspendu) repousse la fin d'un mois.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
          <Button variant="outline" onClick={handleExportExcel} icon={<FileSpreadsheet className="w-4 h-4" />} className="justify-center">
            Excel
          </Button>
          <Button onClick={openNew} icon={<Plus className="w-4 h-4" />} className="justify-center">
            Nouveau prêt
          </Button>
        </div>
      </div>

      {/* ── Indicateurs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi icon={<Users className="w-5 h-5" />} label="Prêts actifs" value={`${stats.actifs} / ${stats.total}`} accent="#1565C0" />
        <Kpi icon={<HandCoins className="w-5 h-5" />} label="Mensualités / mois" value={fmt(stats.mensualitesTotal)} accent="#E9A93B" />
        <Kpi icon={<Wallet className="w-5 h-5" />} label="Reste dû total" value={fmt(stats.resteTotal)} accent="#C62828" />
        <Kpi icon={<CalendarClock className="w-5 h-5" />} label="Mois de paie en cours" value={libelleMois(month)} accent="#00838F" />
      </div>

      {/* ── Barre de filtres ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-2 sm:p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher un employé, un matricule, une banque…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 sm:flex bg-slate-100 rounded-lg p-1 gap-1">
          {filtres.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterStatut(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                filterStatut === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label} <span className="text-slate-400">{f.n}</span>
            </button>
          ))}
        </div>
      </div>

      {filteredLoans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState icon="" text="Aucun prêt correspondant aux critères" />
        </div>
      ) : (
        <>
          {/* ── Téléphone / tablette : cartes ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {filteredLoans.map((l) => {
              const i = infos(l);
              return (
                <div key={l.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={i.nom} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 truncate">{i.nom}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Mle {i.emp?.mle || '—'}
                        {i.emp?.ville ? ` · ${i.emp.ville}` : ''} · {l.banqueCaisse || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatutBadge loan={l} />
                      {i.multi && <span className="text-[10px] font-bold text-amber-700">{i.multi}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 py-2">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Montant</p>
                      <p className="text-sm font-bold text-slate-700">{l.montantTotal.toLocaleString('fr-FR')}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 py-2">
                      <p className="text-[10px] text-amber-600 uppercase font-semibold">Mensualité</p>
                      <p className="text-sm font-bold text-amber-700">{l.mensualite.toLocaleString('fr-FR')}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 py-2">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Reste</p>
                      <p className="text-sm font-bold text-slate-900">{l.reste.toLocaleString('fr-FR')}</p>
                    </div>
                  </div>

                  <Progression loan={l} />
                  <Calendrier l={l} />

                  <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                    {l.statut === 'actif' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">Échéance {libelleMois(month)}</span>
                        <Echeance l={l} />
                      </div>
                    )}
                    <Actions l={l} pleineLargeur />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Grand écran : tableau ── */}
          <div className="hidden lg:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left">Employé</th>
                  <th className="px-3 py-3 text-right">Montant / mensualité</th>
                  <th className="px-3 py-3 text-left w-44">Remboursement</th>
                  <th className="px-3 py-3 text-left">Calendrier</th>
                  <th className="px-3 py-3 text-center">Échéance {libelleMois(month)}</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLoans.map((l) => {
                  const i = infos(l);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <Avatar name={i.nom} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800">{i.nom}</p>
                            <p className="text-[11px] text-slate-400">
                              Mle {i.emp?.mle || '—'}
                              {i.emp?.ville ? ` · ${i.emp.ville}` : ''} · {l.banqueCaisse || '—'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <StatutBadge loan={l} />
                              {i.multi && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  {i.multi}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <p className="font-semibold text-slate-700">{fmt(l.montantTotal)}</p>
                        <p className="text-xs font-bold text-amber-600">{fmt(l.mensualite)} / mois</p>
                        <p className="text-[11px] text-slate-400">prêt du {new Date(l.dateDebut).toLocaleDateString('fr-FR')}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-slate-900 mb-1">Reste {fmt(l.reste)}</p>
                        <Progression loan={l} />
                      </td>
                      <td className="px-3 py-3">
                        <Calendrier l={l} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Echeance l={l} />
                      </td>
                      <td className="px-4 py-3">
                        <Actions l={l} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Confirmation : prélever / solder / supprimer ── */}
      <Modal
        open={!!confirmation}
        onClose={() => !busy && setConfirmation(null)}
        title={
          confirmation?.type === 'prelever'
            ? 'Confirmer le prélèvement'
            : confirmation?.type === 'solder'
              ? 'Solder sans prélèvement'
              : 'Supprimer le prêt'
        }
      >
        {cLoan && confirmation && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Avatar name={cNom} size="lg" />
              <div className="min-w-0">
                <p className="text-base font-black text-slate-900 break-words">{cNom}</p>
                <p className="text-xs text-slate-500">
                  Mle {cEmp?.mle || '—'}
                  {cEmp?.ville ? ` · ${cEmp.ville}` : ''} · {cLoan.banqueCaisse || '—'}
                </p>
                <p className="text-xs text-slate-500">
                  Prêt de {fmt(cLoan.montantTotal)} du {new Date(cLoan.dateDebut).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>

            {confirmation.type === 'prelever' && (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-[11px] text-blue-700 font-semibold">Retenue sur le salaire de {libelleMois(month)}</p>
                  <p className="text-lg font-black text-blue-800">{fmt(cMontant)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500 font-semibold">Reste après prélèvement</p>
                  <p className="text-lg font-black text-slate-800">{fmt(Math.max(0, cLoan.reste - cMontant))}</p>
                </div>
              </div>
            )}

            {confirmation.type === 'solder' && (
              <>
                <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Cas exceptionnel : le prêt se termine. Le reste (<strong>{fmt(cLoan.reste)}</strong>) ne sera plus retenu sur le
                    salaire, et une mensualité notée pour un mois pas encore distribué est retirée. Les mois déjà distribués restent comptés.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Motif</label>
                  <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Cas exceptionnel" />
                </div>
              </>
            )}

            {confirmation.type === 'supprimer' && (
              <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Suppression définitive du prêt et de tout son historique de prélèvements. Cette action est irréversible.</p>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <Button variant="outline" onClick={() => setConfirmation(null)} disabled={busy} className="justify-center">
                Annuler
              </Button>
              <Button
                variant={confirmation.type === 'supprimer' ? 'danger' : confirmation.type === 'solder' ? 'warning' : 'primary'}
                onClick={confirmer}
                disabled={busy}
                className="justify-center"
              >
                {busy
                  ? 'En cours…'
                  : confirmation.type === 'prelever'
                    ? `Prélever ${fmt(cMontant)} — ${cNom}`
                    : confirmation.type === 'solder'
                      ? `Solder le prêt de ${cNom}`
                      : `Supprimer le prêt de ${cNom}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
            <Select className="w-full" value={fEmployee} onChange={(e) => setFEmployee(e.target.value)} disabled={!!editingLoanId}>
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
            {editingLoanId && <p className="text-[11px] text-slate-400 mt-1">L'employé ne peut pas être modifié après création.</p>}
            {!editingLoanId && selectedEmpLoans.length > 0 && (
              <div className="mt-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-bold">
                  Cet employé a déjà {selectedEmpLoans.length} prêt{selectedEmpLoans.length > 1 ? 's' : ''} en cours :
                </p>
                <p>
                  • Reste total dû : <strong>{fmt(selectedEmpLoans.reduce((s, l) => s + l.reste, 0))}</strong>
                </p>
                <p>
                  • Mensualités déjà retenues :{' '}
                  <strong>{fmt(selectedEmpLoans.reduce((s, l) => s + Math.min(l.mensualite, l.reste), 0))}/mois</strong>
                </p>
                <p className="text-[11px] text-amber-700 italic pt-0.5">La mensualité de ce nouveau prêt s'ajoutera aux autres retenues.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Montant total (MRU) *</label>
              <Input type="number" inputMode="numeric" placeholder="Ex: 50000" value={fMontant} onChange={(e) => setFMontant(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Mensualité à retenir (MRU) *</label>
              <Input type="number" inputMode="numeric" placeholder="Ex: 5000" value={fMensualite} onChange={(e) => setFMensualite(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Date du prêt *</label>
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">1er prélèvement (auto : mois du prêt)</label>
              <Input type="month" value={fPremier || premierAuto} onChange={(e) => setFPremier(e.target.value)} />
            </div>
          </div>

          {apercu && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
              <p>
                Durée automatique : <strong>{apercu.echeances} mensualité{apercu.echeances > 1 ? 's' : ''}</strong>
                {Number(fMontant) % Number(fMensualite) !== 0 && (
                  <> (dernière : {fmt(Number(fMontant) % Number(fMensualite))})</>
                )}
              </p>
              <p>
                Prélèvements de <strong>{libelleMois(apercu.plan.premier)}</strong> à <strong>{libelleMois(apercu.plan.fin)}</strong> (
                {apercu.plan.duree} mois)
              </p>
              {apercu.plan.sautesPrevus.length > 0 && (
                <p className="text-amber-700">
                  Non prélevé en {apercu.plan.sautesPrevus.map(libelleMois).join(', ')} (congé / salaire suspendu) : fin repoussée.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Banque / Caisse</label>
            <Select className="w-full" value={fBanqueCaisse} onChange={(e) => setFBanqueCaisse(e.target.value)}>
              <option value="">-- Sélectionner --</option>
              <option value="Banque">Banque</option>
              <option value="Caisse">Caisse</option>
              <option value="BPM">BPM</option>
              <option value="BII">BII</option>
            </Select>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
            <Button
              variant="outline"
              className="justify-center"
              onClick={() => {
                setAddOpen(false);
                setEditingLoanId(null);
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={saving} className="justify-center">
              {saving ? 'Enregistrement...' : editingLoanId ? 'Enregistrer les modifications' : 'Créer le prêt'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
