// Tableau de bord — onglet « Vue d'ensemble » : chiffres clés et graphiques de la période
import { useMemo, useState } from 'react';
import { getEquipeColor } from '@/utils';
import { statsByEquipe, statsByVille, statsByType, repeatDerangementByClient, isHorsDelai, type PeriodFilter } from '@/utils/stats';
import { Card, CardHeader, CardTitle, EquipeTag, ZoneChip, TypeBadge, EmptyState, StatCard } from '@/components/ui';
import { DonutChart, TrendArea, WeekdayBars, RankedBars, Leaderboard } from '@/components/charts';
import type { Equipe, Situation } from '@/types';
import { fmtPts } from '@/utils/points';
import { bilanProgramme, dateRef, matchesNature, poteauxDansPeriode, poteauxDe, presetToRange, todayStr, VILLE_COLORS, type NatureFilter } from './commun';

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

interface Props {
  /** situations de la période, filtrées par nature, équipe et ville */
  scoped: Situation[];
  /** situations de la période, filtrées par équipe et ville (toutes natures) */
  scopedAll: Situation[];
  /** toutes les situations filtrées par équipe et ville (pour la tendance sur 30 jours) */
  scopedSansPeriode: Situation[];
  nature: NatureFilter;
  period: PeriodFilter;
  /** « Choisir une date » : jour du programme montré (null sinon) */
  jourProgramme?: string | null;
  equipes: Equipe[];
  villeDe: (equipe?: string) => string;
  nbVilles: number;
}

export default function VueEnsemble({ scoped, scopedAll, scopedSansPeriode, nature, period, jourProgramme, equipes, villeDe, nbVilles }: Props) {
  const [delaiDetail, setDelaiDetail] = useState<'dans' | 'hors' | null>(null);
  const [repeatsOpen, setRepeatsOpen] = useState(false);
  const [poteauxOpen, setPoteauxOpen] = useState(false);
  const programme = useMemo(() => (jourProgramme ? bilanProgramme(scoped) : null), [jourProgramme, scoped]);
  const couleur = nature === 'derangement' ? '#E65100' : nature === 'all' ? '#6A1B9A' : '#1565C0';

  const byEquipe = useMemo(() => statsByEquipe(scoped, equipes), [scoped, equipes]);
  const byVille = useMemo(() => statsByVille(scoped, equipes), [scoped, equipes]);
  const byType = useMemo(() => statsByType(scoped), [scoped]);
  const repeats = useMemo(() => repeatDerangementByClient(scopedAll), [scopedAll]);

  const total = scoped.length;
  // poteaux posés : datés par la mise à jour de la fiche (updated_at), pas par la date du message
  const fichesPoteaux = useMemo(
    () =>
      poteauxDansPeriode(scopedSansPeriode, period, nature)
        .map((s) => ({ s, n: poteauxDe(s) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => (b.s.updatedAt ?? '').localeCompare(a.s.updatedAt ?? '')),
    [scopedSansPeriode, period, nature],
  );
  const totalPoteaux = fichesPoteaux.reduce((sum, x) => sum + x.n, 0);
  const horsDelai = byEquipe.reduce((a, e) => a + e.horsDelai, 0);
  const dansDelai = total - horsDelai;
  const pctConf = total ? Math.round((dansDelai / total) * 1000) / 10 : 0;
  const today = todayStr();
  const totalAujourdhui = scoped.filter((s) => dateRef(s) === today || s.status === 'pending' || s.status === 'in_progress').length;
  const weekStart = presetToRange('semaine').from!;
  const totalSemaine = scoped.filter((s) => dateRef(s) >= weekStart).length;
  const villesActives = new Set(scoped.map((s) => villeDe(s.equipe))).size;

  const delaiDetailRows = useMemo(() => {
    if (!delaiDetail) return [];
    return scoped.filter((s) => (delaiDetail === 'hors' ? isHorsDelai(s) : !isHorsDelai(s)));
  }, [scoped, delaiDetail]);

  // Tendance : 30 jours qui finissent à la fin de la période
  const trendPoints = useMemo(() => {
    const end = period.to ? new Date(period.to) : new Date();
    const byDay: Record<string, number> = {};
    scopedSansPeriode.forEach((s) => {
      if (!matchesNature(s, nature)) return;
      const d = dateRef(s);
      if (d) byDay[d] = (byDay[d] ?? 0) + 1;
    });
    return Array.from({ length: 30 }, (_, k) => {
      const d = new Date(end);
      d.setDate(end.getDate() - (29 - k));
      const iso = d.toISOString().slice(0, 10);
      return { label: iso.slice(8, 10) + '/' + iso.slice(5, 7), value: byDay[iso] ?? 0 };
    });
  }, [scopedSansPeriode, nature, period.to]);

  const weekdayData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    scoped.forEach((s) => {
      const d = dateRef(s);
      if (d) counts[new Date(d).getDay()]++;
    });
    return WEEKDAYS.map((label, i) => ({ label, value: counts[i] }));
  }, [scoped]);

  const leaderboard = useMemo(
    () =>
      byEquipe
        .filter((e) => e.total >= 1)
        .slice()
        .sort((a, b) => b.pctConformite - a.pctConformite || b.total - a.total)
        .slice(0, 5)
        .map((e) => ({ name: e.equipe, sub: `${e.ville} — ${e.total} dossier(s)`, value: e.pctConformite, unit: '%', color: getEquipeColor(e.equipe, equipes) })),
    [byEquipe, equipes],
  );

  const donutData = byVille.map((v) => ({ label: v.ville, value: v.total, color: VILLE_COLORS[v.ville] ?? '#546E7A' }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {programme && jourProgramme && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle>
              Programme du {jourProgramme.split('-').reverse().join('/')} — {programme.total.total} fiche{programme.total.total > 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 pb-3">
            {(
              [
                ['Faites', programme.total.faites, 'text-green-700'],
                ['Non faites', programme.total.nonFaites, 'text-red-700'],
                ['En cours', programme.total.enCours, 'text-sky-700'],
                ['En retard', programme.total.enRetard, 'text-red-700'],
                ['Points', fmtPts(programme.total.points), 'text-amber-700'],
              ] as const
            ).map(([label, v, cls]) => (
              <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase">{label}</p>
                <p className={`text-xl font-black tabular-nums ${cls}`}>{v}</p>
              </div>
            ))}
          </div>
          {programme.lignes.length === 0 ? (
            <EmptyState icon="" text="Aucune fiche distribuée pour ce jour" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-100">
                    {['Équipe', 'Fiches', 'Faites', 'Non faites', 'En cours', 'En retard', 'Points'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {programme.lignes.map((l) => (
                    <tr key={l.equipe} className="border-b border-slate-50">
                      <td className="px-3 py-2">
                        <EquipeTag name={l.equipe} color={getEquipeColor(l.equipe, equipes)} />
                      </td>
                      <td className="px-3 py-2 font-bold tabular-nums">{l.total}</td>
                      <td className="px-3 py-2 text-green-700 tabular-nums">{l.faites}</td>
                      <td className="px-3 py-2 text-red-700 tabular-nums">{l.nonFaites}</td>
                      <td className="px-3 py-2 text-sky-700 tabular-nums">{l.enCours}</td>
                      <td className="px-3 py-2 text-red-700 tabular-nums">{l.enRetard}</td>
                      <td className="px-3 py-2 font-black text-amber-700 tabular-nums">{fmtPts(l.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-2 text-[11px] text-slate-400">
            Fiches distribuées pour ce jour (date du programme). Points du barème des fiches, sans les pénalités de 22 h. Une fiche renvoyée à un autre jour compte dans
            le programme de ce jour-là.
          </p>
        </Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard value={`${villesActives}/${nbVilles}`} label="Villes actives" icon="" accent="#1565C0" />
        <StatCard value={totalSemaine} label="Cette semaine" icon="" accent="#2E7D32" />
        <StatCard value={totalAujourdhui} label="Aujourd'hui" icon="" accent="#00838F" />
        <StatCard value={total} label="Total période" icon="" accent="#E65100" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard value={`${pctConf}%`} label="Conformité" icon="" accent="#2E7D32" />
        <StatCard value={dansDelai} label="Dans délai" icon="" accent="#1565C0" active={delaiDetail === 'dans'} onClick={() => setDelaiDetail(delaiDetail === 'dans' ? null : 'dans')} />
        <StatCard value={horsDelai} label="Hors délai" icon="" accent="#C62828" active={delaiDetail === 'hors'} onClick={() => setDelaiDetail(delaiDetail === 'hors' ? null : 'hors')} />
        <StatCard value={repeats.length} label="DRG répétés" icon="" accent="#8E24AA" active={repeatsOpen} onClick={() => setRepeatsOpen(!repeatsOpen)} />
        <StatCard value={totalPoteaux} label="Poteaux posés" icon="" accent="#6D4C41" active={poteauxOpen} onClick={() => setPoteauxOpen(!poteauxOpen)} />
      </div>

      {delaiDetail && (
        <Card className={delaiDetail === 'hors' ? 'border-red-200 bg-red-50/30' : 'border-blue-200 bg-blue-50/30'}>
          <CardHeader>
            <div className="flex items-center justify-between w-full gap-2">
              <CardTitle>
                {delaiDetail === 'hors' ? 'Situations hors délai' : 'Situations dans les délais'} ({delaiDetailRows.length})
              </CardTitle>
              <button onClick={() => setDelaiDetail(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 shrink-0">
                Fermer ✕
              </button>
            </div>
          </CardHeader>
          {delaiDetailRows.length === 0 ? (
            <EmptyState icon="" text="Aucune situation" />
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-100">
                    {['FGP', 'Type', 'Zone', 'Équipe', 'Motif équipe', 'Statut'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {delaiDetailRows.slice(0, 300).map((s) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">{s.fgp}</td>
                      <td className="px-3 py-2">
                        <TypeBadge type={s.type} />
                      </td>
                      <td className="px-3 py-2">
                        <ZoneChip zone={s.zone} />
                      </td>
                      <td className="px-3 py-2">
                        <EquipeTag name={s.equipe || '—'} color={getEquipeColor(s.equipe, equipes)} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-40 truncate">{s.motifCloture || (s.status === 'non_ok' ? s.comment : '') || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {s.status === 'ok' ? 'OK' : s.status === 'non_ok' ? 'NON OK' : s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {delaiDetailRows.length > 300 && (
                <p className="text-[11px] text-slate-400 p-3">Affichage limité à 300 lignes sur {delaiDetailRows.length} — affinez les filtres.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {poteauxOpen && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <div className="flex items-center justify-between w-full gap-2">
              <CardTitle>
                Lignes avec poteaux ({fichesPoteaux.length} fiche{fichesPoteaux.length > 1 ? 's' : ''} · {totalPoteaux} poteau{totalPoteaux > 1 ? 'x' : ''})
              </CardTitle>
              <button onClick={() => setPoteauxOpen(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 shrink-0">
                Fermer ✕
              </button>
            </div>
          </CardHeader>
          {fichesPoteaux.length === 0 ? (
            <EmptyState icon="" text="Aucun poteau sur cette période" />
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-100">
                    {['FGP', 'Client', 'Zone', 'Équipe', 'Poteaux', 'Motif', 'Statut', 'Mis à jour'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fichesPoteaux.slice(0, 300).map(({ s, n }) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">{s.fgp}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-48 truncate" title={s.clientNom}>
                        {s.clientNom || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <ZoneChip zone={s.zone} />
                      </td>
                      <td className="px-3 py-2">
                        <EquipeTag name={s.equipe || '—'} color={getEquipeColor(s.equipe, equipes)} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">{n}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-48 truncate" title={s.motifCloture || s.comment || s.motif}>
                        {s.motifCloture || (s.status === 'non_ok' ? s.comment : '') || s.motif || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {s.status === 'ok' ? 'OK' : 'NON OK'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{(s.updatedAt ?? '').slice(0, 10).split('-').reverse().join('/')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fichesPoteaux.length > 300 && (
                <p className="text-[11px] text-slate-400 p-3">Affichage limité à 300 lignes sur {fichesPoteaux.length} — affinez les filtres.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {repeatsOpen && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <div className="flex items-center justify-between w-full gap-2">
              <CardTitle>DRG répétés ({repeats.length})</CardTitle>
              <button onClick={() => setRepeatsOpen(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 shrink-0">
                Fermer ✕
              </button>
            </div>
          </CardHeader>
          {repeats.length === 0 ? (
            <EmptyState icon="" text="Aucun client avec plusieurs dérangements sur la période" />
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-100">
                    {['FGP', 'Nb', 'Zone', 'Équipe'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {repeats.slice(0, 300).map((r) => (
                    <tr key={r.fgp} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">{r.fgp}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{r.count}×</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.zone}</td>
                      <td className="px-3 py-2">
                        <EquipeTag name={r.equipe || '—'} color={getEquipeColor(r.equipe, equipes)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Équipes les plus actives</CardTitle>
          </CardHeader>
          <div className="p-4 sm:p-5">
            {byEquipe.length === 0 ? (
              <EmptyState icon="" text="Aucune donnée" />
            ) : (
              <RankedBars data={byEquipe.slice(0, 8).map((e) => ({ label: e.equipe, value: e.total, sub: `(${e.pctConformite}%)` }))} color="#1565C0" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tendance — 30 jours</CardTitle>
          </CardHeader>
          <div className="p-4 sm:p-5">
            <TrendArea points={trendPoints} color={couleur} />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par ville</CardTitle>
          </CardHeader>
          <div className="p-4 sm:p-5">{donutData.length === 0 ? <EmptyState icon="" text="Aucune donnée" /> : <DonutChart data={donutData} />}</div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Par jour de la semaine</CardTitle>
          </CardHeader>
          <div className="p-4 sm:p-5">
            <WeekdayBars data={weekdayData} color={couleur} />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Équipes les plus performantes (% conformité)</CardTitle>
          </CardHeader>
          <div className="p-4 sm:p-5">{leaderboard.length === 0 ? <EmptyState icon="" text="Aucune donnée" /> : <Leaderboard items={leaderboard} />}</div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Par type (CLS, CPL, RLR, CMI, TRL, CST, ANS…)</CardTitle>
          </CardHeader>
          <div className="p-4 sm:p-5">
            {byType.length === 0 ? (
              <EmptyState icon="" text="Aucune donnée" />
            ) : (
              <RankedBars data={byType.map((t) => ({ label: t.type, value: t.total, sub: `(${t.pctConformite}%)` }))} color="#00838F" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
