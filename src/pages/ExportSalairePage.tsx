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
import { SignaturePad } from '@/components/signaturePad';
import { DEFAULT_SIGNATURE } from '@/utils/signature';
import type { Employee, Loan } from '@/types';
import {
  FileSpreadsheet,
  Download,
  Eye,
  PenTool,
  Search,
  Building2,
  Calendar,
  Wallet,
  Users,
  CheckCircle2,
  AlertCircle,
  FolderArchive,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const FEUILLES_DISPO = ['BPM', 'Caisse', 'SGM', 'Récap'];

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
  const loadEmployees = useAppStore((s) => s.loadEmployees);
  const directorSignature = useAppStore((s) => s.directorSignature);
  const setDirectorSignature = useAppStore((s) => s.setDirectorSignature);
  const { showToast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Paramètres d'export ───────────────────────────────────────────────────
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportOrdre, setExportOrdre] = useState(() => `020/DG/GSS/${new Date().getFullYear()}`);
  const [feuilles, setFeuilles] = useState<string[]>(FEUILLES_DISPO);
  const [sigModal, setSigModal] = useState(false);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── Filtres de la table ───────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterBanque, setFilterBanque] = useState('');
  const [filterStatut, setFilterStatut] = useState<'tous' | 'presents' | 'conge' | 'double' | 'pret'>('tous');

  // Mois navigation
  const handleMonthChange = (val: string) => {
    if (!val) return;
    setExportMonth(val);
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

    // Prêts actifs
    const activeLoansByEmployee = new Map<string, Loan[]>();
    loans.forEach((l) => {
      if (l.statut === 'actif' && l.reste > 0) {
        const list = activeLoansByEmployee.get(l.employeeId) || [];
        list.push(l);
        activeLoansByEmployee.set(l.employeeId, list);
      }
    });

    const rows = employees
      .filter((e) => e.actif !== false)
      .map((e) => {
        const enConge = onLeaveIds.has(e.id);
        const congeDouble = !enConge && doublingIds.has(e.id);
        const empLoans = activeLoansByEmployee.get(e.id) || [];
        const base = e.montant ?? 0;
        const brut = congeDouble ? base * 2 : base;
        const pretDeduit = enConge ? 0 : empLoans.reduce((sum, l) => sum + Math.min(l.mensualite, l.reste), 0);
        const net = enConge ? 0 : Math.max(0, brut - pretDeduit);

        return {
          employee: e,
          enConge,
          congeDouble,
          empLoans,
          base,
          brut,
          pretDeduit,
          net,
          banque: e.banque || 'Caisse',
        };
      });

    const presentsRows = rows.filter((r) => !r.enConge);
    const totalPresents = presentsRows.length;
    const totalEnConge = rows.filter((r) => r.enConge).length;
    const totalDouble = rows.filter((r) => r.congeDouble).length;
    const totalPretsRetenus = presentsRows.reduce((acc, r) => acc + r.pretDeduit, 0);
    const totalNetMRU = presentsRows.reduce((acc, r) => acc + r.net, 0);

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
    };
  }, [employees, leaves, loans, exportMonth]);

  // Options pour l'export Excel
  const exportOpts = () => ({
    month: exportMonth,
    employees,
    leaves,
    loans,
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
    } catch (err: any) {
      showToast(`Erreur lors de la génération Excel: ${err?.message || err}`, 'error');
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
    } catch (err: any) {
      showToast(`Erreur lors de la génération: ${err?.message || err}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Filtrage du tableau
  const filteredRows = useMemo(() => {
    return monthData.rows.filter((r) => {
      if (filterBanque && r.banque !== filterBanque) return false;
      if (filterStatut === 'presents' && r.enConge) return false;
      if (filterStatut === 'conge' && !r.enConge) return false;
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
                onChange={(e) => setFilterStatut(e.target.value as any)}
              >
                <option value="tous">Tous les statuts</option>
                <option value="presents">Payés (présents)</option>
                <option value="conge">En congé (exclus)</option>
                <option value="double">Salaire doublé x2</option>
                <option value="pret">Prêt déduit</option>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r, idx) => {
                  const e = r.employee;
                  return (
                    <tr
                      key={e.id}
                      className={`hover:bg-slate-50 transition-colors ${r.enConge ? 'bg-orange-50/30 text-slate-400' : ''}`}
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
                        {r.enConge ? (
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
                      <td className="px-3 py-2 text-right">
                        {r.pretDeduit > 0 ? (
                          <span className="font-semibold text-red-600">
                            -{fmt(r.pretDeduit)} MRU
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 text-sm">
                        {r.enConge ? (
                          <span className="text-slate-400 font-normal">0 MRU</span>
                        ) : (
                          <span className="text-blue-700 font-black">{fmt(r.net)} MRU</span>
                        )}
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

      {/* ── Modal Aperçu Export ── */}
      <ExportPreviewModal
        open={!!preview}
        preview={preview}
        onClose={() => setPreview(null)}
        onConfirm={handleExportUnique}
      />
    </div>
  );
}
