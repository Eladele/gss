// Tableau de bord — onglet « Progression équipes ».
// Les fiches d'une équipe ne sont dessinées qu'à l'ouverture de sa ligne (et 120 au plus) :
// l'ancien Dashboard dessinait toutes les situations de toutes les équipes, d'où sa lenteur.
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { isHorsDelai } from '@/utils/stats';
import { StatCard, Card, CardHeader, CardTitle, StatusBadge, ZoneChip, TypeBadge, EquipeTag, ProgressBar, Button, EmptyState } from '@/components/ui';
import type { Equipe, Situation } from '@/types';

const MAX_FICHES = 120;
const ouverte = (s: Situation) => s.status === 'pending' || s.status === 'in_progress' || s.status === 'urgent';

export default function ProgressionEquipes({ scoped, equipes, onActualiser, chargement }: { scoped: Situation[]; equipes: Equipe[]; onActualiser: () => void; chargement: boolean }) {
  const [ouvert, setOuvert] = useState<string | null>(null);

  const total = scoped.length;
  const ok = scoped.filter((s) => s.status === 'ok').length;
  const nok = scoped.filter((s) => s.status === 'non_ok').length;
  const enAttente = scoped.filter(ouverte).length;
  const horsDelai = scoped.filter((s) => ouverte(s) && isHorsDelai(s)).length;

  // une passe sur les situations, regroupées par équipe
  const parEquipe = useMemo(() => {
    const m = new Map<string, Situation[]>();
    scoped.forEach((s) => {
      const k = (s.equipe ?? '').toLowerCase();
      const l = m.get(k);
      if (l) l.push(s);
      else m.set(k, [s]);
    });
    return m;
  }, [scoped]);

  const lignes = useMemo(
    () =>
      equipes
        .map((eq) => {
          const sits = parEquipe.get(eq.name.toLowerCase()) ?? [];
          const nOk = sits.filter((s) => s.status === 'ok').length;
          return {
            eq,
            sits,
            ok: nOk,
            nok: sits.filter((s) => s.status === 'non_ok').length,
            restant: sits.filter(ouverte).length,
            retard: sits.filter((s) => ouverte(s) && isHorsDelai(s)).length,
            pct: sits.length ? Math.round((nOk / sits.length) * 100) : 0,
          };
        })
        .sort((a, b) => b.sits.length - a.sits.length || a.eq.name.localeCompare(b.eq.name)),
    [equipes, parEquipe],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard value={total} label="Total" icon="" accent="#1565C0" />
        <StatCard value={ok} label="OK" icon="" accent="#2E7D32" />
        <StatCard value={nok} label="NON OK" icon="" accent="#C62828" />
        <StatCard value={enAttente} label="En attente" icon="" accent="#546E7A" />
        <StatCard value={horsDelai} label="En attente hors délai" icon="" accent="#E65100" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progression par équipe</CardTitle>
          <Button variant="outline" size="sm" onClick={onActualiser} disabled={chargement}>
            {chargement ? 'Chargement…' : 'Actualiser'}
          </Button>
        </CardHeader>
        <div className="p-3 sm:p-5 space-y-3">
          {lignes.length === 0 && <EmptyState icon="" text="Aucune équipe" />}
          {lignes.map(({ eq, sits, ok: nOk, nok: nNok, restant, retard, pct }) => {
            const estOuvert = ouvert === eq.id;
            // les fiches encore ouvertes d'abord, puis les plus récentes
            const fiches = estOuvert ? [...sits].sort((a, b) => Number(ouverte(b)) - Number(ouverte(a))).slice(0, MAX_FICHES) : [];
            return (
              <div key={eq.id} className="rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden">
                <button type="button" onClick={() => setOuvert(estOuvert ? null : eq.id)} className="w-full text-left p-3 hover:bg-slate-50 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <EquipeTag name={eq.name} color={eq.color} />
                      {eq.leader && <span className="text-xs font-medium text-slate-600 truncate">{eq.leader}</span>}
                      <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {nOk}/{sits.length} OK
                      </span>
                      {nNok > 0 && <span className="text-xs text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">{nNok} NOK</span>}
                      {restant > 0 && <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{restant} restant</span>}
                      {retard > 0 && <span className="text-xs text-orange-700 font-medium bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{retard} hors délai</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold" style={{ color: eq.color }}>
                        {pct}%
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${estOuvert ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <ProgressBar value={pct} color={eq.color} />
                </button>
                {estOuvert && (
                  <div className="p-3 border-t border-slate-100 bg-white">
                    {fiches.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center">Aucune situation sur la période</p>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {fiches.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-slate-700">{s.fgp}</span>
                                <TypeBadge type={s.type} />
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <ZoneChip zone={s.zone} />
                                <StatusBadge status={s.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                        {sits.length > MAX_FICHES && (
                          <p className="text-[11px] text-slate-400 mt-2">
                            {MAX_FICHES} fiches affichées sur {sits.length} (les ouvertes d'abord) — la page Situations les montre toutes.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
