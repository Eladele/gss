// Tableau de bord — onglet « Rapports détaillés » (relevés par ville et type, backlog, NON OK)
import { useMemo, type ReactNode } from 'react';
import { statsByVille, statsDelaiDetailleParVilleEtType, statsBacklogParAnciennete, statsNonOk, MERGED_TYPES } from '@/utils/stats';
import { Card, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { Equipe, Situation } from '@/types';
import { poteauxDansPeriode, poteauxDe, type NatureFilter } from './commun';
import type { PeriodFilter } from '@/utils/stats';
import { motifSansCst } from '@/utils/programme';

interface Props {
  scoped: Situation[];
  scopedAll: Situation[];
  scopedSansPeriode: Situation[];
  nature: NatureFilter;
  period: PeriodFilter;
  equipes: Equipe[];
  villeDe: (equipe?: string) => string;
}

interface LigneMotif {
  motif: string;
  total: number;
  faites: number;
  nonFaites: number;
  equipes: number;
}

/** Motifs les plus fréquents (motif de clôture sans la partie CST ; NON OK sans motif : son commentaire) */
function statsMotifs(liste: Situation[]): LigneMotif[] {
  const m = new Map<string, LigneMotif & { eq: Set<string> }>();
  for (const s of liste) {
    if (s.status !== 'ok' && s.status !== 'non_ok') continue;
    const brut = motifSansCst(s.motifCloture || (s.status === 'non_ok' ? s.comment : '') || '').replace(/\s+/g, ' ').trim();
    const motif = brut || 'Sans motif';
    const cle = motif.toLowerCase();
    const r = m.get(cle) ?? { motif, total: 0, faites: 0, nonFaites: 0, equipes: 0, eq: new Set<string>() };
    r.total++;
    if (s.status === 'ok') r.faites++;
    else r.nonFaites++;
    if (s.equipe) r.eq.add(s.equipe);
    m.set(cle, r);
  }
  return [...m.values()].map(({ eq, ...r }) => ({ ...r, equipes: eq.size })).sort((a, b) => b.total - a.total || a.motif.localeCompare(b.motif));
}

type Cell = ReactNode;

function Tableau({ titre, aide, entetes, lignes, total, vide = 'Aucune donnée' }: { titre: string; aide?: string; entetes: string[]; lignes: { key: string; cells: Cell[]; fort?: boolean }[]; total?: Cell[]; vide?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      {aide && <p className="px-4 sm:px-5 -mt-1 pb-2 text-[11px] text-slate-400">{aide}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {entetes.map((h) => (
                <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.key} className={`border-b border-slate-50 ${l.fort ? 'bg-blue-50/40 font-semibold' : ''}`}>
                {l.cells.map((c, i) => (
                  <td key={i} className={`px-3 py-2 whitespace-nowrap ${i === 0 ? 'font-semibold text-slate-700' : ''}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {total && lignes.length > 0 && (
              <tr className="bg-slate-50/80 font-bold">
                {total.map((c, i) => (
                  <td key={i} className="px-3 py-2 whitespace-nowrap">
                    {c}
                  </td>
                ))}
              </tr>
            )}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={entetes.length}>
                  <EmptyState icon="" text={vide} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const vert = (v: Cell) => <span className="text-green-700">{v}</span>;
const rouge = (v: Cell) => <span className="text-red-700">{v}</span>;
const bleu = (v: Cell) => <span className="text-blue-600">{v}</span>;

export default function RapportsDetailles({ scoped, scopedAll, scopedSansPeriode, nature, period, equipes, villeDe }: Props) {
  const byVille = useMemo(() => statsByVille(scoped, equipes), [scoped, equipes]);
  const poteauxParVille = useMemo(() => {
    // datés par la mise à jour de la fiche (updated_at)
    const m = new Map<string, number>();
    poteauxDansPeriode(scopedSansPeriode, period, nature).forEach((s) => m.set(villeDe(s.equipe), (m.get(villeDe(s.equipe)) ?? 0) + poteauxDe(s)));
    return [...m.entries()]
      .filter(([, poteaux]) => poteaux > 0)
      .map(([ville, poteaux]) => ({ ville, poteaux }))
      .sort((a, b) => b.poteaux - a.poteaux);
  }, [scopedSansPeriode, period, nature, villeDe]);
  const motifsDrg = useMemo(() => statsMotifs(scopedAll.filter((s) => s.type === 'DRG')), [scopedAll]);
  const motifsIns = useMemo(() => statsMotifs(scopedAll.filter((s) => s.type !== 'DRG')), [scopedAll]);
  const lignesMotifs = (rows: LigneMotif[]) => {
    const total = rows.reduce((a, r) => a + r.total, 0);
    return rows.slice(0, 20).map((r) => ({
      key: r.motif,
      cells: [r.motif, <b>{r.total}</b>, <span className="text-slate-500">{total ? Math.round((r.total / total) * 100) : 0}%</span>, vert(r.faites), rouge(r.nonFaites), r.equipes],
    }));
  };
  const ENTETES_MOTIFS = ['Motif', 'Fiches', '%', 'Faites', 'Non faites', 'Équipes'];
  const typesInstall = useMemo(() => MERGED_TYPES.filter((t) => !['CST', 'RLR', 'ANS'].includes(t)), []);
  const installDetail = useMemo(() => statsDelaiDetailleParVilleEtType(scopedAll, equipes, typesInstall), [scopedAll, equipes, typesInstall]);
  const cstDetail = useMemo(() => statsDelaiDetailleParVilleEtType(scopedAll, equipes, ['CST']), [scopedAll, equipes]);
  const rlrDetail = useMemo(() => statsDelaiDetailleParVilleEtType(scopedAll, equipes, ['RLR']), [scopedAll, equipes]);
  const ansDetail = useMemo(() => statsDelaiDetailleParVilleEtType(scopedAll, equipes, ['ANS']), [scopedAll, equipes]);
  const drgVilleDetail = useMemo(() => statsByVille(scopedAll.filter((s) => s.type === 'DRG'), equipes), [scopedAll, equipes]);
  const backlogRows = useMemo(() => statsBacklogParAnciennete(scopedSansPeriode), [scopedSansPeriode]);
  const nonOkDetail = useMemo(() => statsNonOk(scopedAll, equipes), [scopedAll, equipes]);

  const parVilleType = (rows: typeof cstDetail) =>
    rows.map((r) => ({ key: r.ville, cells: [r.ville, r.total, bleu(r.moins24h), vert(r.dansDelai), rouge(r.horsDelai), <b>{r.pctDansDelai}%</b>] }));
  const ENTETES_TLID = ['Ville', 'Total', 'Moins 24 h', 'Dans délai', 'Hors délai', '% TLID'];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 [&>*]:min-w-0">
        <Tableau
          titre="Détail par ville"
          entetes={['Ville', 'Total', 'Dans délai', 'Hors délai', '% Conf.']}
          lignes={byVille.map((v) => ({ key: v.ville, cells: [v.ville, v.total, vert(v.dansDelai), rouge(v.horsDelai), `${v.pctConformite}%`] }))}
        />
        <Tableau
          titre="Poteaux posés — par ville"
          aide="Fiches OK avec poteaux et NON OK dont le motif contient « besoin poteau », datées par leur mise à jour."
          entetes={['Ville', 'Poteaux posés']}
          lignes={poteauxParVille.map((v) => ({ key: v.ville, cells: [v.ville, <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">{v.poteaux}</span>] }))}
          total={['Total', poteauxParVille.reduce((a, v) => a + v.poteaux, 0)]}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 [&>*]:min-w-0">
        <Tableau
          titre="Motifs des dérangements"
          aide="Motifs de clôture (faits et non faits) des DRG de la période, du plus fréquent au moins fréquent (20 premiers)."
          entetes={ENTETES_MOTIFS}
          lignes={lignesMotifs(motifsDrg)}
          total={['Total', motifsDrg.reduce((a, r) => a + r.total, 0), '100%', motifsDrg.reduce((a, r) => a + r.faites, 0), motifsDrg.reduce((a, r) => a + r.nonFaites, 0), '']}
          vide="Aucun dérangement clôturé sur cette période"
        />
        <Tableau
          titre="Motifs des installations"
          aide="Motifs de clôture des installations (tous types) de la période."
          entetes={ENTETES_MOTIFS}
          lignes={lignesMotifs(motifsIns)}
          total={['Total', motifsIns.reduce((a, r) => a + r.total, 0), '100%', motifsIns.reduce((a, r) => a + r.faites, 0), motifsIns.reduce((a, r) => a + r.nonFaites, 0), '']}
          vide="Aucune installation clôturée sur cette période"
        />
      </div>

      <Tableau
        titre="Backlog du jour — par ancienneté"
        aide="« Résolu aujourd'hui » = traité le jour même ; le reste est encore en attente. Instantané à date, indépendant de la période."
        entetes={['Nature', "Résolu aujourd'hui", 'Moins de 2 j', 'Moins de 7 j', 'Plus de 7 j', 'Somme instance', 'Somme totale', '% réalisation']}
        lignes={backlogRows.map((r) => ({
          key: r.nature,
          cells: [r.nature === 'installation' ? 'Installation' : 'DRG', vert(<b>{r.resoluAujourdhui}</b>), r.moins2j, r.moins7j, rouge(r.plus7j), r.sommeInstance, r.sommeTotal, <b>{r.pctRealisation}%</b>],
        }))}
      />

      <Tableau
        titre="Installation dans les délais — par ville et type"
        entetes={['Ville', 'Type', 'Total', 'Moins 24 h', 'Dans délai', 'Hors délai', '% TLID']}
        lignes={installDetail.map((r) => ({
          key: `${r.ville}-${r.type}`,
          fort: r.type === 'TOTAL',
          cells: [r.type === 'TOTAL' ? r.ville : '', r.type === 'TOTAL' ? <span className="text-blue-700">{r.type}</span> : <span className="text-slate-500 pl-3">{r.type}</span>, r.total, bleu(r.moins24h), vert(r.dansDelai), rouge(r.horsDelai), <b>{r.pctDansDelai}%</b>],
        }))}
      />

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 [&>*]:min-w-0">
        <Tableau titre="CST dans les délais — par ville" entetes={ENTETES_TLID} lignes={parVilleType(cstDetail)} />
        <Tableau titre="RLR dans les délais — par ville" entetes={ENTETES_TLID} lignes={parVilleType(rlrDetail)} />
        <Tableau titre="ANS dans les délais — par ville" entetes={ENTETES_TLID} lignes={parVilleType(ansDetail)} />
        <Tableau
          titre="DRG dans les délais — par ville"
          entetes={['Ville', 'Total', 'Dans délai', 'Hors délai', '% TLID']}
          lignes={drgVilleDetail.map((r) => ({ key: r.ville, cells: [r.ville, r.total, vert(r.dansDelai), rouge(r.horsDelai), <b>{r.pctConformite}%</b>] }))}
        />
      </div>

      <Tableau
        titre="NON OK — motivé vs sans motif"
        aide="Les NON OK ne comptent pas comme « hors délai » : ils sont détaillés ici (avec ou sans justification)."
        entetes={['Ville', 'Total NON OK', 'Motivé', 'Sans motif', '% motivé']}
        lignes={nonOkDetail.map((r) => ({ key: r.ville, cells: [r.ville, r.total, vert(r.motive), rouge(r.sansMotif), <b>{r.pctMotive}%</b>] }))}
        vide="Aucun NON OK sur cette période"
      />
    </div>
  );
}
