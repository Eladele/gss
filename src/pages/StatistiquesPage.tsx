import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getEquipeColor } from '@/utils';
import {
  statsByEquipe,
  statsByVille,
  statsByType,
  repeatDerangementByClient,
  inPeriod,
  exportStatsToExcel,
  type PeriodFilter,
} from '@/utils/stats';
import { Card, CardHeader, CardTitle, Button, Select, EquipeTag, EmptyState, StatCard } from '@/components/ui';
import { DonutChart, TrendArea, WeekdayBars, RankedBars, Leaderboard } from '@/components/charts';
import type { SituationNature } from '@/types';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

type PeriodPreset = 'jour' | 'semaine' | 'mois' | 'custom';

function presetToRange(preset: PeriodPreset): PeriodFilter {
  const now = new Date();
  if (preset === 'jour') return { from: todayStr(), to: todayStr() };
  if (preset === 'semaine') {
    const day = (now.getDay() + 6) % 7; // lundi = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return { from: monday.toISOString().slice(0, 10), to: todayStr() };
  }
  if (preset === 'mois') return { from: firstOfMonthStr(), to: todayStr() };
  return {};
}

const VILLE_COLORS: Record<string, string> = {
  Nouakchott: '#1565C0',
  Kaédi: '#E9A93B',
  Rosso: '#2E7D32',
  Nouadhibou: '#00838F',
};
const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function StatistiquesPage() {
  const situations = useAppStore((s) => s.situations);
  const equipes = useAppStore((s) => s.equipes);

  const [nature, setNature] = useState<SituationNature>('installation');
  const [preset, setPreset] = useState<PeriodPreset>('mois');
  const [customFrom, setCustomFrom] = useState(firstOfMonthStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [fEquipe, setFEquipe] = useState('');
  const [fVille, setFVille] = useState('');

  const period: PeriodFilter = preset === 'custom' ? { from: customFrom, to: customTo } : presetToRange(preset);

  const villes = useMemo(() => [...new Set(equipes.map((e) => e.ville ?? 'Nouakchott'))].sort(), [equipes]);

  const scoped = useMemo(
    () =>
      situations.filter((s) => {
        if ((s.nature ?? 'installation') !== nature) return false;
        if (!inPeriod(s.dateDepo, period)) return false;
        if (fEquipe && s.equipe?.toLowerCase() !== fEquipe.toLowerCase()) return false;
        if (fVille) {
          const eq = equipes.find((e) => e.name.toLowerCase() === s.equipe?.toLowerCase());
          if ((eq?.ville ?? 'Nouakchott') !== fVille) return false;
        }
        return true;
      }),
    [situations, nature, period, fEquipe, fVille, equipes],
  );

  const byEquipe = useMemo(() => statsByEquipe(scoped, equipes), [scoped, equipes]);
  const byVille = useMemo(() => statsByVille(scoped, equipes), [scoped, equipes]);
  const byType = useMemo(() => statsByType(scoped), [scoped]);
  const repeats = useMemo(() => repeatDerangementByClient(situations.filter((s) => inPeriod(s.dateDepo, period))), [situations, period]);

  const total = scoped.length;
  const horsDelai = byEquipe.reduce((a, e) => a + e.horsDelai, 0);
  const dansDelai = total - horsDelai;
  const pctConf = total ? Math.round((dansDelai / total) * 1000) / 10 : 0;
  const today = todayStr();
  const totalAujourdhui = scoped.filter((s) => s.dateDepo === today).length;
  const weekStart = presetToRange('semaine').from!;
  const totalSemaine = scoped.filter((s) => s.dateDepo >= weekStart).length;
  const villesActives = new Set(
    scoped.map((s) => {
      const eq = equipes.find((e) => e.name.toLowerCase() === s.equipe?.toLowerCase());
      return eq?.ville ?? 'Nouakchott';
    }),
  ).size;

  // Courbe de tendance (30 derniers jours de la période, ou toute la période si + courte)
  const trendPoints = useMemo(() => {
    const days: string[] = [];
    const end = period.to ? new Date(period.to) : new Date();
    const span = 29;
    for (let i = span; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const byDay: Record<string, number> = {};
    situations
      .filter((s) => (s.nature ?? 'installation') === nature)
      .forEach((s) => {
        if (s.dateDepo) byDay[s.dateDepo] = (byDay[s.dateDepo] ?? 0) + 1;
      });
    return days.map((d) => ({ label: d.slice(8, 10) + '/' + d.slice(5, 7), value: byDay[d] ?? 0 }));
  }, [situations, nature, period.to]);

  // Répartition par jour de semaine
  const weekdayData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    scoped.forEach((s) => {
      if (s.dateDepo) counts[new Date(s.dateDepo).getDay()]++;
    });
    return WEEKDAYS.map((label, i) => ({ label, value: counts[i] }));
  }, [scoped]);

  // Classement équipes les plus performantes (taux de conformité)
  const leaderboard = useMemo(
    () =>
      byEquipe
        .filter((e) => e.total >= 1)
        .slice()
        .sort((a, b) => b.pctConformite - a.pctConformite || b.total - a.total)
        .slice(0, 5)
        .map((e) => ({
          name: e.equipe,
          sub: `${e.ville} — ${e.total} dossier(s)`,
          value: e.pctConformite,
          unit: '%',
          color: getEquipeColor(e.equipe, equipes),
        })),
    [byEquipe, equipes],
  );

  const donutData = byVille.map((v) => ({ label: v.ville, value: v.total, color: VILLE_COLORS[v.ville] ?? '#546E7A' }));

  const handleExport = () => {
    exportStatsToExcel({
      fileName: `stats_${nature}_${period.from ?? 'all'}_${period.to ?? 'all'}.xlsx`,
      byEquipe,
      byVille,
      byType,
      repeats,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Statistiques</h1>
          <p className="text-slate-400 text-sm">Délai / conformité par équipe, ville, type — installation & dérangement séparés</p>
        </div>
        <Button icon="" variant="outline" onClick={handleExport}>
          Exporter Excel
        </Button>
      </div>

      {/* Nature toggle */}
      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        {(['installation', 'derangement'] as SituationNature[]).map((n) => (
          <button
            key={n}
            onClick={() => setNature(n)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${nature === n ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {n === 'installation' ? ' Installation' : ' Dérangement'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <Select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} style={{ width: 'auto' }}>
              <option value="jour">Aujourd'hui</option>
              <option value="semaine">Cette semaine</option>
              <option value="mois">Ce mois</option>
              <option value="custom">Période personnalisée</option>
            </Select>
            {preset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                />
                <span className="text-slate-400 text-sm">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                />
              </>
            )}
            <Select value={fEquipe} onChange={(e) => setFEquipe(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes équipes</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Select value={fVille} onChange={(e) => setFVille(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes villes</option>
              {villes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* KPIs — style dashboard (villes actives / semaine / jour / total) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={`${villesActives}/${villes.length}`} label="Villes actives" icon="" accent="#1565C0" />
        <StatCard value={totalSemaine} label="Cette semaine" icon="" accent="#2E7D32" />
        <StatCard value={totalAujourdhui} label="Aujourd'hui" icon="" accent="#00838F" />
        <StatCard value={total} label="Total période" icon="" accent="#E65100" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={`${pctConf}%`} label="Conformité" icon="" accent="#2E7D32" />
        <StatCard value={dansDelai} label="Dans délai" icon="" accent="#1565C0" />
        <StatCard value={horsDelai} label="Hors délai" icon="" accent="#C62828" />
        <StatCard value={repeats.length} label="Clients répétés" icon="" accent="#8E24AA" />
      </div>

      {/* Équipes les plus actives + courbe de tendance */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle> Équipes les plus actives</CardTitle>
          </CardHeader>
          <div className="p-5">
            {byEquipe.length === 0 ? (
              <EmptyState icon="" text="Aucune donnée" />
            ) : (
              <RankedBars
                data={byEquipe.slice(0, 8).map((e) => ({ label: e.equipe, value: e.total, sub: `(${e.pctConformite}%)` }))}
                color="#1565C0"
              />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle> Tendance — 30 derniers jours</CardTitle>
          </CardHeader>
          <div className="p-5">
            <TrendArea points={trendPoints} color={nature === 'installation' ? '#1565C0' : '#E65100'} />
          </div>
        </Card>
      </div>

      {/* Répartition par ville (donut) + par jour de semaine */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle> Répartition par ville</CardTitle>
          </CardHeader>
          <div className="p-5">
            {donutData.length === 0 ? <EmptyState icon="" text="Aucune donnée" /> : <DonutChart data={donutData} />}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle> Répartition par jour de semaine</CardTitle>
          </CardHeader>
          <div className="p-5">
            <WeekdayBars data={weekdayData} color={nature === 'installation' ? '#1565C0' : '#E65100'} />
          </div>
        </Card>
      </div>

      {/* Leaderboard équipes + par type */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle> Équipes les plus performantes (% conformité)</CardTitle>
          </CardHeader>
          <div className="p-5">
            {leaderboard.length === 0 ? <EmptyState icon="" text="Aucune donnée" /> : <Leaderboard items={leaderboard} />}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle> Par type (CLS, CPL, RLR, CMI, TRL, CST...)</CardTitle>
          </CardHeader>
          <div className="p-5">
            {byType.length === 0 ? (
              <EmptyState icon="" text="Aucune donnée" />
            ) : (
              <RankedBars data={byType.map((t) => ({ label: t.type, value: t.total, sub: `(${t.pctConformite}%)` }))} color="#00838F" />
            )}
          </div>
        </Card>
      </div>

      {/* Par ville - tableau détaillé */}
      <Card>
        <CardHeader>
          <CardTitle> Détail par ville</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Ville', 'Total', 'Dans délai', 'Hors délai', '% Conf.'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byVille.map((v) => (
                <tr key={v.ville} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-700">{v.ville}</td>
                  <td className="px-3 py-2">{v.total}</td>
                  <td className="px-3 py-2 text-green-700 font-semibold">{v.dansDelai}</td>
                  <td className="px-3 py-2 text-red-700 font-semibold">{v.horsDelai}</td>
                  <td className="px-3 py-2">{v.pctConformite}%</td>
                </tr>
              ))}
              {byVille.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon="" text="Aucune donnée" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dérangements répétés par client */}
      {nature === 'derangement' && (
        <Card>
          <CardHeader>
            <CardTitle> Clients avec dérangements répétés (période sélectionnée)</CardTitle>
          </CardHeader>
          {repeats.length === 0 ? (
            <EmptyState icon="" text="Aucun client avec plusieurs dérangements sur la période" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['FGP', 'Nb interventions', 'Zone', 'Équipe', 'Motifs'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {repeats.map((r) => (
                    <tr key={r.fgp} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">{r.fgp}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{r.count}×</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.zone}</td>
                      <td className="px-3 py-2">
                        <EquipeTag name={r.equipe || '—'} color={getEquipeColor(r.equipe, equipes)} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400 max-w-xs truncate" title={r.motifs.join(' | ')}>
                        {r.motifs.join(' | ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
