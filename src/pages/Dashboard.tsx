// Tableau de bord (Dashboard et Statistiques réunis) :
//   • « Vue d'ensemble »   : chiffres clés et graphiques de la période (ancienne page Statistiques)
//   • « Rapports »         : relevés détaillés par ville et type, backlog, NON OK
//   • « Progression équipes » : avancement de chaque équipe (ancien Dashboard)
// Seul l'onglet ouvert est calculé et dessiné, et les filtres sont communs.
// Exports : Excel, et deux PDF des délais (par ville / par équipe) pour la période et les filtres choisis.
import { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  statsByEquipe,
  statsByVille,
  statsByType,
  repeatDerangementByClient,
  inPeriod,
  exportStatsToExcel,
  MERGED_TYPES,
  statsDelaiDetailleParVilleEtType,
  statsBacklogParAnciennete,
  statsNonOk,
  type PeriodFilter,
} from '@/utils/stats';
import { Card, Button, Select, useToast } from '@/components/ui';
import { errMsg } from '@/utils';
import VueEnsemble from '@/components/dashboard/VueEnsemble';
import RapportsDetailles from '@/components/dashboard/RapportsDetailles';
import ProgressionEquipes from '@/components/dashboard/ProgressionEquipes';
import { exporterStatsDelais, fr } from '@/utils/rapportPdf';
import {
  ANNEES_SELECT,
  MOIS_FR,
  dateRef,
  firstOfMonthStr,
  matchesNature,
  presetToRange,
  todayStr,
  villesDesEquipes,
  type NatureFilter,
  type PeriodPreset,
} from '@/components/dashboard/commun';

type Onglet = 'apercu' | 'rapports' | 'equipes';
const ONGLETS: { id: Onglet; label: string; court: string }[] = [
  { id: 'apercu', label: "Vue d'ensemble", court: 'Aperçu' },
  { id: 'rapports', label: 'Rapports', court: 'Rapports' },
  { id: 'equipes', label: 'Progression équipes', court: 'Équipes' },
];
const CLE_ONGLET = 'gss.dashboard.onglet';

function ongletMemorise(): Onglet {
  try {
    const v = localStorage.getItem(CLE_ONGLET);
    return v === 'rapports' || v === 'equipes' ? v : 'apercu';
  } catch {
    return 'apercu';
  }
}

export default function Dashboard({ onNavigate }: { onNavigate?: (p: 'import-excel') => void }) {
  const situations = useAppStore((s) => s.situations);
  const equipes = useAppStore((s) => s.equipes);
  const loading = useAppStore((s) => s.loading);
  const loadAll = useAppStore((s) => s.loadAll);
  const user = useAppStore((s) => s.user)!;
  const { showToast } = useToast();

  const [onglet, setOngletState] = useState<Onglet>(ongletMemorise);
  const setOnglet = (o: Onglet) => {
    setOngletState(o);
    try {
      localStorage.setItem(CLE_ONGLET, o);
    } catch {
      /* stockage indisponible : sans importance */
    }
  };
  const [nature, setNature] = useState<NatureFilter>('installation');
  const [preset, setPreset] = useState<PeriodPreset>('mois');
  const [customFrom, setCustomFrom] = useState(firstOfMonthStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [fEquipe, setFEquipe] = useState('');
  // ville verrouillée pour un superviseur régional (villeScope)
  const [fVille, setFVille] = useState(user.villeScope ?? '');
  const [pdfEnCours, setPdfEnCours] = useState<'villes' | 'equipes' | null>(null);

  const period: PeriodFilter = useMemo(
    () => (preset === 'custom' ? { from: customFrom, to: customTo } : presetToRange(preset)),
    [preset, customFrom, customTo],
  );
  const villeDe = useMemo(() => villesDesEquipes(equipes), [equipes]);
  const equipesFiltrees = useMemo(
    () => equipes.filter((e) => (!fVille || (e.ville ?? 'Nouakchott') === fVille) && (!fEquipe || e.name.toLowerCase() === fEquipe.toLowerCase())),
    [equipes, fVille, fEquipe],
  );
  const villes = useMemo(() => [...new Set(equipes.map((e) => e.ville ?? 'Nouakchott'))].sort(), [equipes]);

  // équipe + ville (toutes dates) → + période → + nature
  const scopedSansPeriode = useMemo(
    () =>
      situations.filter((s) => {
        if (fEquipe && s.equipe?.toLowerCase() !== fEquipe.toLowerCase()) return false;
        if (fVille && villeDe(s.equipe) !== fVille) return false;
        return true;
      }),
    [situations, fEquipe, fVille, villeDe],
  );
  const scopedAll = useMemo(() => scopedSansPeriode.filter((s) => inPeriod(dateRef(s), period)), [scopedSansPeriode, period]);
  const scoped = useMemo(() => scopedAll.filter((s) => matchesNature(s, nature)), [scopedAll, nature]);

  const libellePeriode =
    preset === 'tout'
      ? 'toute la période'
      : preset === 'jour'
        ? "aujourd'hui"
        : preset === 'semaine'
          ? 'cette semaine'
          : preset === 'mois'
            ? 'ce mois'
            : `${MOIS_FR[Number(customFrom.slice(5, 7)) - 1]} ${customFrom.slice(0, 4)}`;
  // titre du PDF : « Novembre 2026 », « semaine du 09/11/2026 »…
  const periodePdf =
    preset === 'tout'
      ? 'toute la période'
      : preset === 'jour'
        ? fr(todayStr())
        : preset === 'semaine'
          ? `semaine du ${fr(period.from ?? todayStr())}`
          : `${MOIS_FR[Number((period.from ?? todayStr()).slice(5, 7)) - 1]} ${(period.from ?? todayStr()).slice(0, 4)}`;
  const filtresTexte = [fEquipe && `équipe ${fEquipe}`, fVille && `ville ${fVille}`].filter(Boolean).join(' - ');

  const exporterExcel = async () => {
    try {
      const installTypes = MERGED_TYPES.filter((t) => !['CST', 'RLR', 'ANS'].includes(t));
      await exportStatsToExcel({
        fileName: `stats_${nature}_${period.from ?? 'all'}_${period.to ?? 'all'}.xlsx`,
        byEquipe: statsByEquipe(scoped, equipes),
        byVille: statsByVille(scoped, equipes),
        byType: statsByType(scoped),
        repeats: repeatDerangementByClient(scopedAll),
        situations: scoped,
        installDetail: statsDelaiDetailleParVilleEtType(scopedAll, equipes, installTypes),
        cstDetail: statsDelaiDetailleParVilleEtType(scopedAll, equipes, ['CST']),
        drgVilleDetail: statsByVille(scopedAll.filter((s) => s.type === 'DRG'), equipes),
        nonOkDetail: statsNonOk(scopedAll, equipes),
        backlogRows: statsBacklogParAnciennete(scopedSansPeriode),
      });
    } catch (e) {
      showToast('Export impossible : ' + errMsg(e), 'error');
    }
  };

  const exporterPdf = async (mode: 'villes' | 'equipes') => {
    setPdfEnCours(mode);
    try {
      await exporterStatsDelais(
        { situations: scopedAll, periode: periodePdf, du: period.from, au: period.to, equipes: equipesFiltrees, villeDe, filtres: mode === 'villes' ? (fVille ? `ville ${fVille}` : '') : filtresTexte, auteur: user.name },
        mode,
      );
    } catch (e) {
      showToast('Export PDF impossible : ' + errMsg(e), 'error');
    } finally {
      setPdfEnCours(null);
    }
  };

  const setMois = (annee: string, mois: string) => {
    const lastDay = new Date(Number(annee), Number(mois), 0).getDate();
    setCustomFrom(`${annee}-${mois}-01`);
    setCustomTo(`${annee}-${mois}-${String(lastDay).padStart(2, '0')}`);
  };
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900">Tableau de bord</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            <span className="capitalize">{today}</span>
            {loading && <span className="ml-2 text-blue-600 animate-pulse">· chargement…</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => exporterPdf('villes')} disabled={scopedAll.length === 0 || !!pdfEnCours} title={`Dans / hors délai par catégorie et par ville, poteaux — ${periodePdf}`}>
            <FileDown className="w-4 h-4 mr-1 inline" /> {pdfEnCours === 'villes' ? 'PDF…' : 'PDF délais villes'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exporterPdf('equipes')} disabled={scopedAll.length === 0 || !!pdfEnCours} title={`Toutes les équipes : installations et dérangements, dans / hors délai — ${periodePdf}`}>
            <FileDown className="w-4 h-4 mr-1 inline" /> {pdfEnCours === 'equipes' ? 'PDF…' : 'PDF classement équipes'}
          </Button>
          <Button variant="outline" size="sm" onClick={exporterExcel} disabled={scoped.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-1 inline" /> Excel
          </Button>
          {onNavigate && (user.role === 'admin' || user.role === 'superviseur') && (
            <Button size="sm" onClick={() => onNavigate('import-excel')}>
              <Upload className="w-4 h-4 mr-1 inline" /> Importer
            </Button>
          )}
        </div>
      </div>

      {/* Filtres communs aux trois onglets */}
      <Card className="p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl sm:w-fit">
          {(['all', 'installation', 'derangement'] as NatureFilter[]).map((n) => (
            <button
              key={n}
              onClick={() => setNature(n)}
              className={`whitespace-nowrap px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${nature === n ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {n === 'all' ? 'Tout' : n === 'installation' ? 'Installation' : 'Dérangement'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
          <Select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} className="w-full md:w-auto min-w-0">
            <option value="tout">Toute la période</option>
            <option value="jour">Aujourd'hui</option>
            <option value="semaine">Cette semaine</option>
            <option value="mois">Ce mois</option>
            <option value="custom">Choisir un mois</option>
          </Select>
          {preset === 'custom' && (
            <>
              <Select value={String(Number(customFrom.slice(5, 7)))} onChange={(e) => setMois(customFrom.slice(0, 4), e.target.value.padStart(2, '0'))} className="w-full md:w-auto min-w-0">
                {MOIS_FR.map((label, i) => (
                  <option key={i} value={i + 1}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={customFrom.slice(0, 4)} onChange={(e) => setMois(e.target.value, customFrom.slice(5, 7))} className="w-full md:w-auto min-w-0">
                {ANNEES_SELECT.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </>
          )}
          <Select value={fEquipe} onChange={(e) => setFEquipe(e.target.value)} className="w-full md:w-auto min-w-0">
            <option value="">Toutes équipes</option>
            {equipes
              .filter((e) => !fVille || (e.ville ?? 'Nouakchott') === fVille)
              .map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
          </Select>
          <Select
            value={fVille}
            onChange={(e) => setFVille(e.target.value)}
            className="w-full md:w-auto min-w-0"
            disabled={!!user.villeScope}
            title={user.villeScope ? `Restreint à ${user.villeScope}` : undefined}
          >
            <option value="">Toutes villes</option>
            {villes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Onglets */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${onglet === o.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <span className="sm:hidden">{o.court}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-400 whitespace-nowrap pl-3 hidden sm:inline">
          {scoped.length} fiche{scoped.length > 1 ? 's' : ''} · {libellePeriode}
        </span>
      </div>

      {onglet === 'apercu' && (
        <VueEnsemble
          scoped={scoped}
          scopedAll={scopedAll}
          scopedSansPeriode={scopedSansPeriode}
          nature={nature}
          period={period}
          equipes={equipes}
          villeDe={villeDe}
          nbVilles={villes.length}
        />
      )}
      {onglet === 'rapports' && <RapportsDetailles scoped={scoped} scopedAll={scopedAll} scopedSansPeriode={scopedSansPeriode} equipes={equipes} villeDe={villeDe} />}
      {onglet === 'equipes' && (
        <ProgressionEquipes
          scoped={scoped}
          equipes={equipesFiltrees}
          onActualiser={loadAll}
          chargement={loading}
        />
      )}

    </div>
  );
}
