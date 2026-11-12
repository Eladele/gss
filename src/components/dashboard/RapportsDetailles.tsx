// Tableau de bord — onglet « Rapports détaillés » (relevés par ville et type, backlog, NON OK)
import { useMemo, type ReactNode } from 'react';
import { statsByVille, statsDelaiDetailleParVilleEtType, statsBacklogParAnciennete, statsNonOk, MERGED_TYPES } from '@/utils/stats';
import { Card, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { Equipe, Situation } from '@/types';
import { poteauxDe } from './commun';

interface Props {
  scoped: Situation[];
  scopedAll: Situation[];
  scopedSansPeriode: Situation[];
  equipes: Equipe[];
  villeDe: (equipe?: string) => string;
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

export default function RapportsDetailles({ scoped, scopedAll, scopedSansPeriode, equipes, villeDe }: Props) {
  const byVille = useMemo(() => statsByVille(scoped, equipes), [scoped, equipes]);
  const poteauxParVille = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((s) => m.set(villeDe(s.equipe), (m.get(villeDe(s.equipe)) ?? 0) + poteauxDe(s)));
    return [...m.entries()].map(([ville, poteaux]) => ({ ville, poteaux })).sort((a, b) => b.poteaux - a.poteaux);
  }, [scoped, villeDe]);
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
          entetes={['Ville', 'Poteaux posés']}
          lignes={poteauxParVille.map((v) => ({ key: v.ville, cells: [v.ville, <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">{v.poteaux}</span>] }))}
          total={['Total', poteauxParVille.reduce((a, v) => a + v.poteaux, 0)]}
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
