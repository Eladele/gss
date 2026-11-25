import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  Modal,
  Input,
  Select,
  StatCard,
  useToast,
  EmptyState,
} from '@/components/ui';
import {
  buildExportPreview,
  exportEmployesPresentsExcel,
  exportEmployesPresentsExcelSepares,
} from '@/utils/leaves';
import type { ExportPreview } from '@/utils/leaves';
import { ExportPreviewModal } from '@/components/ExportPreviewModal';
import { exporterSalairesPdf, exporterSalairesPdfSepares } from '@/utils/salairesPdf';
import { SignaturePad } from '@/components/signaturePad';
import { DEFAULT_SIGNATURE } from '@/utils/signature';
import type { Loan } from '@/types';
import { BadgeSuspendu, BoutonSuspension } from '@/components/SuspensionSalaire';
import {
  retenuesDuMois,
  moisPaieCourant,
  dernierMoisDistribue,
  dateDistributionProposee,
  libelleMois,
  type LigneRetenue,
} from '@/utils/prets';
import {
  FileSpreadsheet,
  Download,
  Eye,
  PenTool,
  Search,
  Building2,
  Calendar,
  FolderArchive,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  Undo2,
} from 'lucide-react';

const FEUILLES_DISPO = ['BPM', 'Caisse', 'BII', 'Récap'];

type FiltreStatut = 'tous' | 'presents' | 'conge' | 'double' | 'pret' | 'suspendu';

const AVATAR_PALETTE = ['#1565C0', '#2E7D32', '#E9A93B', '#8E24AA', '#00838F', '#C62828', '#546E7A'];
function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function fmt(val?: number) {
  return (val ?? 0).toLocaleString('fr-FR');
}
function detailRetenues(lignes: LigneRetenue[]): string | undefined {
  if (!lignes.length) return undefined;
  return lignes
    .map((l) => `Prêt ${fmt(l.loan.montantTotal)} : ${fmt(l.montant)} / ${fmt(l.prevu)} MRU${l.dejaPreleve ? ' (prélevé)' : ''}`)
    .join('\n');
}
function formatRib(rib?: string) {
  if (!rib) return '—';
  const digits = rib.replace(/\s+/g, '');
  if (digits.length !== 23) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 21)} ${digits.slice(21, 23)}`;
}

export default function ExportSalairePage() {
  const employees = useAppStore((s) => s.employees);
  const leaves = useAppStore((s) => s.leaves);
  const loans = useAppStore((s) => s.loans);
  const loanPayments = useAppStore((s) => s.loanPayments);
  const salaryMonths = useAppStore((s) => s.salaryMonths);
  const setDateDistribution = useAppStore((s) => s.setDateDistribution);
  const validerDistribution = useAppStore((s) => s.validerDistribution);
  const annulerDistribution = useAppStore((s) => s.annulerDistribution);
  const role = useAppStore((s) => s.user?.role);
  const superadmin = useAppStore((s) => s.user?.superadmin);
  // distribution des salaires : admin, directeur, RH (et super-administrateur)
  const peutDistribuer = !!superadmin || role === 'admin' || role === 'directeur' || role === 'rh';
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const directorSignature = useAppStore((s) => s.directorSignature);
  const setDirectorSignature = useAppStore((s) => s.setDirectorSignature);
  const { showToast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctxPaie = useMemo(() => ({ payments: loanPayments, salaryMonths }), [loanPayments, salaryMonths]);

  // ── Paramètres d'export ───────────────────────────────────────────────────
  // mois choisi par l'utilisateur ; sinon le mois de paie à distribuer (celui qui suit la dernière distribution)
  const [moisManuel, setMoisManuel] = useState<string | null>(null);
  const exportMonth = moisManuel ?? moisPaieCourant(ctxPaie);
  const [exportOrdre, setExportOrdre] = useState(() => `020/DG/GSS/${new Date().getFullYear()}`);
  const [feuilles, setFeuilles] = useState<string[]>(FEUILLES_DISPO);
  const [sigModal, setSigModal] = useState(false);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── Filtres de la table ───────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterBanque, setFilterBanque] = useState('');
  const [filterStatut, setFilterStatut] = useState<FiltreStatut>('tous');

  // Mois navigation
  const handleMonthChange = (val: string) => {
    if (!val) return;
    setMoisManuel(val);
    const yr = val.split('-')[0];
    if (yr) {
      setExportOrdre((prev) => prev.replace(/\/\d{4}$/, `/${yr}`));
    }
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = exportMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    handleMonthChange(newMonth);
  };

  const toggleFeuille = (f: string) =>
    setFeuilles((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  // ── Calcul des salaires selon règles métier GSS ─────────────────────────────
  const monthData = useMemo(() => {
    const [y, m] = exportMonth.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;

    const monthOf = (dateStr?: string): string | null => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const onLeaveIds = new Set(leaves.filter((l) => monthOf(l.dateDebut) === exportMonth).map((l) => l.employeeId));
    const doublingIds = new Set(leaves.filter((l) => monthOf(l.dateDebut) === nextMonth).map((l) => l.employeeId));

    // Prêts par employé (1er prélèvement le mois du prêt, mois distribués figés)
    const loansByEmployee = new Map<string, Loan[]>();
    loans.forEach((l) => {
      const list = loansByEmployee.get(l.employeeId) || [];
      list.push(l);
      loansByEmployee.set(l.employeeId, list);
    });

    const rows = employees
      .filter((e) => e.actif !== false)
      .map((e) => {
        // salaire suspendu : traité comme non payé (pas de virement, pas de retenue de prêt)
        const suspendu = !!e.salaireSuspendu;
        const enConge = suspendu || onLeaveIds.has(e.id);
        const congeDouble = !enConge && doublingIds.has(e.id);
        const base = e.montant ?? 0;
        const brut = congeDouble ? base * 2 : base;
        // congé / suspendu : pas de salaire → pas de retenue, le prêt est repoussé d'un mois
        const { total: pretDeduit, lignes: retenues } = retenuesDuMois(loansByEmployee.get(e.id) || [], exportMonth, ctxPaie, {
          exclu: enConge,
          brut,
        });
        const pretReporte = retenues.some((l) => l.montant < l.prevu);
        const net = enConge ? 0 : Math.max(0, brut - pretDeduit);

        return {
          employee: e,
          suspendu,
          enConge,
          congeDouble,
          retenues,
          pretReporte,
          base,
          brut,
          pretDeduit,
          net,
          banque: e.banque || 'Caisse',
        };
      });

    const presentsRows = rows.filter((r) => !r.enConge);
    const totalPresents = presentsRows.length;
    const totalEnConge = rows.filter((r) => r.enConge && !r.suspendu).length;
    const totalDouble = rows.filter((r) => r.congeDouble).length;
    const totalPretsRetenus = presentsRows.reduce((acc, r) => acc + r.pretDeduit, 0);
    const totalNetMRU = presentsRows.reduce((acc, r) => acc + r.net, 0);
    const prelevements = rows
      .flatMap((r) => r.retenues)
      .filter((l) => l.montant > 0)
      .map((l) => ({ loanId: l.loan.id, montant: l.montant }));

    // Par banque
    const parBanque: Record<string, { count: number; total: number }> = {};
    presentsRows.forEach((r) => {
      if (!parBanque[r.banque]) parBanque[r.banque] = { count: 0, total: 0 };
      parBanque[r.banque].count += 1;
      parBanque[r.banque].total += r.net;
    });

    return {
      rows,
      presentsRows,
      totalActifs: rows.length,
      totalPresents,
      totalEnConge,
      totalDouble,
      totalPretsRetenus,
      totalNetMRU,
      parBanque,
      prelevements,
    };
  }, [employees, leaves, loans, exportMonth, ctxPaie]);

  // ── Distribution du mois (date libre, validation = prélèvement des prêts) ──
  const moisPaie = salaryMonths.find((s) => s.mois === exportMonth);
  const distribue = moisPaie?.statut === 'distribue';
  const dernierDistribue = dernierMoisDistribue(ctxPaie);
  // date saisie pour un mois ; sinon la date enregistrée, sinon une date proposée
  const [dateSaisie, setDateSaisie] = useState<{ mois: string; date: string } | null>(null);
  const dateDist =
    dateSaisie?.mois === exportMonth
      ? dateSaisie.date
      : (moisPaie?.dateDistribution ?? dateDistributionProposee(exportMonth, ctxPaie));
  const setDateDist = (date: string) => setDateSaisie({ mois: exportMonth, date });
  const [busyDist, setBusyDist] = useState(false);
  const [confirmDist, setConfirmDist] = useState(false);

  const enregistrerDate = async () => {
    if (!dateDist) return;
    try {
      setBusyDist(true);
      await setDateDistribution(exportMonth, dateDist);
      showToast(`Distribution de ${libelleMois(exportMonth)} prévue le ${new Date(dateDist).toLocaleDateString('fr-FR')}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyDist(false);
    }
  };

  const handleValiderDistribution = async () => {
    try {
      setBusyDist(true);
      await validerDistribution({
        mois: exportMonth,
        date: dateDist,
        totalNet: monthData.totalNetMRU,
        prelevements: monthData.prelevements,
      });
      setConfirmDist(false);
      showToast(`Salaires de ${libelleMois(exportMonth)} distribués — mensualités prélevées ✅`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyDist(false);
    }
  };

  const handleAnnulerDistribution = async () => {
    if (!confirm(`Annuler la distribution de ${libelleMois(exportMonth)} ?\n\nLes mensualités prélevées par cette distribution seront remises sur les prêts.`)) return;
    try {
      setBusyDist(true);
      await annulerDistribution(exportMonth);
      showToast('Distribution annulée', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyDist(false);
    }
  };

  // Options pour l'export Excel
  const exportOpts = () => ({
    month: exportMonth,
    employees,
    leaves,
    loans,
    loanPayments,
    salaryMonths,
    ordreBase: exportOrdre,
    feuilles,
    signatureBase64: directorSignature,
  });

  const handlePreview = () => {
    if (!feuilles.length) {
      showToast('Sélectionnez au moins une feuille à exporter', 'error');
      return;
    }
    setPreview(buildExportPreview(exportOpts()));
  };

  const handleExportUnique = async () => {
    if (!feuilles.length) {
      showToast('Sélectionnez au moins une feuille à exporter', 'error');
      return;
    }
    try {
      setExporting(true);
      await exportEmployesPresentsExcel(exportOpts());
      setPreview(null);
      showToast('Fichier Excel Ordre de virement généré avec succès ✅', 'success');
    } catch (err) {
      showToast(`Erreur lors de la génération Excel: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // PDF A4 : même contenu que l'Excel (une ou plusieurs pages par feuille)
  const handleExportPdf = async (separes = false) => {
    if (!feuilles.length) {
      showToast('Sélectionnez au moins une feuille à exporter', 'error');
      return;
    }
    try {
      setExporting(true);
      const p = buildExportPreview(exportOpts());
      if (!p.sheets.length) {
        showToast('Aucune feuille à exporter pour ce mois', 'error');
        return;
      }
      if (separes) {
        const n = await exporterSalairesPdfSepares(p, 'Salaires', exportMonth);
        showToast(`${n} PDF téléchargé${n > 1 ? 's' : ''} ✅`, 'success');
      } else {
        await exporterSalairesPdf(p, `Salaires_${exportMonth}.pdf`);
        showToast('PDF A4 généré ✅', 'success');
      }
    } catch (err) {
      showToast(`Erreur lors de la génération du PDF : ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportSepares = async () => {
    if (!feuilles.length) {
      showToast('Sélectionnez au moins une feuille à exporter', 'error');
      return;
    }
    try {
      setExporting(true);
      await exportEmployesPresentsExcelSepares(exportOpts());
      showToast('Fichiers Excel séparés par banque téléchargés ✅', 'success');
    } catch (err) {
      showToast(`Erreur lors de la génération: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Filtrage du tableau
  const filteredRows = useMemo(() => {
    return monthData.rows.filter((r) => {
      if (filterBanque && r.banque !== filterBanque) return false;
      if (filterStatut === 'presents' && r.enConge) return false;
      if (filterStatut === 'conge' && (!r.enConge || r.suspendu)) return false;
      if (filterStatut === 'suspendu' && !r.suspendu) return false;
      if (filterStatut === 'double' && !r.congeDouble) return false;
      if (filterStatut === 'pret' && r.pretDeduit === 0) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const e = r.employee;
        const match =
          (e.name ?? '').toLowerCase().includes(q) ||
          (e.mle ?? '').toLowerCase().includes(q) ||
          (e.poste ?? '').toLowerCase().includes(q) ||
          (e.ville ?? '').toLowerCase().includes(q) ||
          (e.rib ?? '').toLowerCase().includes(q) ||
          (e.banque ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [monthData.rows, filterBanque, filterStatut, search]);

  const monthLabel = useMemo(() => {
    const [y, m] = exportMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }, [exportMonth]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Export des Salaires</h1>
              <p className="text-slate-500 text-sm">
                Ordres de virement bancaires & fiches de paie pour <strong className="text-slate-700 capitalize">{monthLabel}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setSigModal(true)} icon={<PenTool className="w-4 h-4" />}>
            {directorSignature ? 'Signature directeur ✅' : '✍️ Signature'}
          </Button>
          <Button variant="outline" onClick={handlePreview} icon={<Eye className="w-4 h-4" />}>
            Aperçu
          </Button>
          <Button onClick={handleExportUnique} disabled={exporting} icon={<Download className="w-4 h-4" />}>
            {exporting ? 'Génération...' : 'Exporter Excel'}
          </Button>
          <Button variant="outline" onClick={() => handleExportPdf()} disabled={exporting} icon={<FileText className="w-4 h-4 text-red-600" />}>
            Exporter PDF (A4)
          </Button>
        </div>
      </div>

      {/* ── Configuration de l'export ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Paramètres d'export du virement
              </span>
            </CardTitle>
            <span className="text-xs font-normal text-slate-400">Règles GSS : salaire doublé avant congé & retenues prêts déduites</span>
          </div>
        </CardHeader>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Mois d'export avec navigation rapide */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Mois d'export</label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                  title="Mois précédent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <Input
                  type="month"
                  value={exportMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="font-medium"
                />
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                  title="Mois suivant"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* N° d'ordre */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">N° Ordre de virement</label>
              <Input
                value={exportOrdre}
                onChange={(e) => setExportOrdre(e.target.value)}
                placeholder="020/DG/GSS/2026"
                className="font-mono text-sm"
              />
            </div>

            {/* Téléchargements alternatifs */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Export avancé</label>
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={handleExportSepares}
                disabled={exporting}
                icon={<FolderArchive className="w-4 h-4 text-amber-600" />}
              >
                Fichiers séparés par banque
              </Button>
              <Button
                variant="outline"
                className="w-full text-xs mt-2"
                onClick={() => handleExportPdf(true)}
                disabled={exporting}
                icon={<FileText className="w-4 h-4 text-red-600" />}
              >
                PDF séparés par banque
              </Button>
            </div>
          </div>

          {/* Feuilles à inclure */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-xs font-semibold text-slate-500">Feuilles à inclure dans le fichier :</span>
              {FEUILLES_DISPO.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={feuilles.includes(f)}
                    onChange={() => toggleFeuille(f)}
                    className="accent-blue-600 w-4 h-4 rounded"
                  />
                  <span className="font-medium">{f}</span>
                </label>
              ))}
            </div>

            <div className="text-xs text-slate-400">
              {directorSignature ? 'Signature enregistrée' : '⚠️ Aucune signature enregistrée pour le directeur'}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Distribution du mois : date libre + validation ── */}
      <Card>
        <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl border ${distribue ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {distribue ? <CheckCircle2 className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">
                Distribution des salaires — <span className="capitalize">{monthLabel}</span>
              </p>
              {distribue && moisPaie ? (
                <p className="text-xs text-emerald-700">
                  Distribués le {new Date(moisPaie.dateDistribution).toLocaleDateString('fr-FR')}
                  {moisPaie.distribuePar ? ` par ${moisPaie.distribuePar}` : ''} — mensualités prélevées, prêts mis à jour.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Choisissez le jour de distribution de ce mois, puis validez : les mensualités de prêts du mois seront prélevées (
                  {monthData.prelevements.length} mensualité(s), {fmt(monthData.prelevements.reduce((a, p) => a + p.montant, 0))} MRU).
                  {dernierDistribue && ` Dernier mois distribué : ${libelleMois(dernierDistribue)}.`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={dateDist}
              onChange={(e) => setDateDist(e.target.value)}
              disabled={distribue || !peutDistribuer}
              style={{ width: 'auto' }}
            />
            {!distribue && peutDistribuer && (
              <>
                <Button variant="outline" onClick={enregistrerDate} disabled={busyDist || !dateDist}>
                  Enregistrer la date
                </Button>
                <Button onClick={() => setConfirmDist(true)} disabled={busyDist || !dateDist} icon={<CheckCircle2 className="w-4 h-4" />}>
                  Valider la distribution
                </Button>
              </>
            )}
            {distribue && peutDistribuer && dernierDistribue === exportMonth && (
              <Button variant="outline" onClick={handleAnnulerDistribution} disabled={busyDist} icon={<Undo2 className="w-4 h-4" />}>
                Annuler la distribution
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── KPIs du mois sélectionné ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard
          value={monthData.totalActifs}
          label="Total effectif"
          icon="👥"
          accent="#1565C0"
        />
        <StatCard
          value={monthData.totalPresents}
          label="Employés payés"
          icon="✅"
          accent="#2E7D32"
        />
        <StatCard
          value={monthData.totalEnConge}
          label="En congé (exclus)"
          icon="🌴"
          accent="#E65100"
        />
        <StatCard
          value={monthData.totalDouble}
          label="Salaires doublés x2"
          icon="✨"
          accent="#8E24AA"
        />
        <StatCard
          value={`${fmt(monthData.totalPretsRetenus)} MRU`}
          label="Retenues prêts"
          icon="💳"
          accent="#D84315"
        />
        <StatCard
          value={`${fmt(monthData.totalNetMRU)} MRU`}
          label="Total net à virer"
          icon="💰"
          accent="#00838F"
        />
      </div>

      {/* ── Répartition par banque ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Object.entries(monthData.parBanque).map(([banque, stat]) => (
          <div
            key={banque}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{banque}</p>
                <p className="text-xs text-slate-400">{stat.count} employé(s) au virement</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-base font-black text-slate-900">{fmt(stat.total)}</p>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">MRU</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tableau détaillé des salaires du mois ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Détail des employés & salaires ({filteredRows.length})</CardTitle>
              <p className="text-xs text-slate-400">Prévisualisation conforme aux règles de paie et aux retenues</p>
            </div>

            {/* Filtres table */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-8 text-xs py-1.5 h-8"
                  placeholder="Rechercher nom, mle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Select
                className="text-xs py-1.5 h-8"
                value={filterBanque}
                onChange={(e) => setFilterBanque(e.target.value)}
              >
                <option value="">Toutes banques</option>
                {Object.keys(monthData.parBanque).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>

              <Select
                className="text-xs py-1.5 h-8"
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as FiltreStatut)}
              >
                <option value="tous">Tous les statuts</option>
                <option value="presents">Payés (présents)</option>
                <option value="conge">En congé (exclus)</option>
                <option value="double">Salaire doublé x2</option>
                <option value="pret">Prêt déduit</option>
                <option value="suspendu">Salaire suspendu</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        {filteredRows.length === 0 ? (
          <EmptyState icon="🔍" text="Aucun employé trouvé avec ces critères de recherche ou de filtre." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left w-12">#</th>
                  <th className="px-3 py-2.5 text-left">Employé</th>
                  <th className="px-3 py-2.5 text-left">Poste / Ville</th>
                  <th className="px-3 py-2.5 text-left">Banque & Compte / RIB</th>
                  <th className="px-3 py-2.5 text-right">Salaire Base</th>
                  <th className="px-3 py-2.5 text-center">Statut Congé</th>
                  <th className="px-3 py-2.5 text-right">Retenue Prêt</th>
                  <th className="px-3 py-2.5 text-right font-bold text-slate-900">Net à payer</th>
                  <th className="px-3 py-2.5 text-right" aria-label="Suspension" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r, idx) => {
                  const e = r.employee;
                  return (
                    <tr
                      key={e.id}
                      className={`hover:bg-slate-50 transition-colors ${r.suspendu ? 'bg-red-50/40 text-slate-400' : r.enConge ? 'bg-orange-50/30 text-slate-400' : ''}`}
                    >
                      <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ background: colorFor(e.name) }}
                          >
                            {initials(e.name)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-xs">{e.name}</p>
                            <p className="text-[10px] text-slate-400">{e.mle ? `Mle ${e.mle}` : 'Sans matricule'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-slate-700 font-medium">{e.poste || '—'}</p>
                        <p className="text-[10px] text-slate-400">{e.ville || '—'}{e.equipeNom ? ` · ${e.equipeNom}` : ''}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-slate-700">{r.banque}</span>
                        <p className="font-mono text-[10px] text-slate-500 whitespace-nowrap">{formatRib(e.rib)}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-600">
                        {fmt(r.base)} MRU
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.suspendu ? (
                          <BadgeSuspendu e={e} />
                        ) : r.enConge ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                            🌴 En congé (exclu)
                          </span>
                        ) : r.congeDouble ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                            ✨ Doublé x2 ({fmt(r.brut)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                            Présent
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" title={detailRetenues(r.retenues)}>
                        {r.pretDeduit > 0 ? (
                          <span className="font-semibold text-red-600">
                            -{fmt(r.pretDeduit)} MRU
                          </span>
                        ) : (
                          !r.pretReporte && <span className="text-slate-300">—</span>
                        )}
                        {r.pretReporte && (
                          <p className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">
                            {r.enConge ? 'Prêt reporté (+1 mois)' : 'Retenue partielle (salaire insuffisant)'}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 text-sm">
                        {r.enConge ? (
                          <span className="text-slate-400 font-normal">0 MRU</span>
                        ) : (
                          <span className="text-blue-700 font-black">{fmt(r.net)} MRU</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <BoutonSuspension e={e} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right text-slate-700">
                    TOTAL SÉLECTION ({filteredRows.filter((r) => !r.enConge).length} payés) :
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">
                    {fmt(filteredRows.filter((r) => !r.enConge).reduce((a, r) => a + r.base, 0))} MRU
                  </td>
                  <td></td>
                  <td className="px-3 py-2.5 text-right text-red-600">
                    -{fmt(filteredRows.filter((r) => !r.enConge).reduce((a, r) => a + r.pretDeduit, 0))} MRU
                  </td>
                  <td className="px-3 py-2.5 text-right text-base text-blue-700 font-black">
                    {fmt(filteredRows.filter((r) => !r.enConge).reduce((a, r) => a + r.net, 0))} MRU
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ── Modal Signature ── */}
      <Modal open={sigModal} onClose={() => setSigModal(false)} title="✍️ Signature du directeur">
        <SignaturePad
          initialValue={directorSignature ?? DEFAULT_SIGNATURE}
          onSave={async (b64) => {
            await setDirectorSignature(b64);
            setSigModal(false);
            showToast('Signature enregistrée pour les ordres de virement ✅', 'success');
          }}
          onClear={() => setDirectorSignature(null)}
        />
      </Modal>

      {/* ── Confirmation de la distribution ── */}
      <Modal open={confirmDist} onClose={() => setConfirmDist(false)} title={`Valider la distribution — ${monthLabel}`}>
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Date de distribution : <strong>{dateDist ? new Date(dateDist).toLocaleDateString('fr-FR') : '—'}</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {monthData.totalPresents} employé(s) payé(s) — total net <strong>{fmt(monthData.totalNetMRU)} MRU</strong>
            </li>
            <li>
              {monthData.prelevements.length} mensualité(s) de prêt prélevée(s) —{' '}
              <strong>{fmt(monthData.prelevements.reduce((a, p) => a + p.montant, 0))} MRU</strong>
            </li>
            <li>Les prêts des employés en congé ou suspendus ne sont pas prélevés : leur fin est repoussée d'un mois.</li>
          </ul>
          {dernierDistribue && exportMonth < dernierDistribue && (
            <p className="text-xs text-red-600 font-semibold">
              Attention : ce mois est antérieur au dernier mois distribué ({libelleMois(dernierDistribue)}).
            </p>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setConfirmDist(false)}>
              Annuler
            </Button>
            <Button onClick={handleValiderDistribution} disabled={busyDist}>
              {busyDist ? 'Validation...' : 'Confirmer la distribution'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Aperçu Export ── */}
      <ExportPreviewModal
        open={!!preview}
        preview={preview}
        onClose={() => setPreview(null)}
        onConfirm={handleExportUnique}
        onPdf={() => handleExportPdf()}
      />
    </div>
  );
}
