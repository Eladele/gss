// Page Paramètres → Motifs : listes des motifs de clôture « fait » et « non fait » proposées aux
// chefs d'équipe. Modifier, ajouter, supprimer, réordonner, puis enregistrer (app_settings).
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Plus, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import { useParametresStore } from '@/store/useParametresStore';
import { Button, Card, Input, useToast } from '@/components/ui';
import { MOTIFS_DEFAUT, type MotifsProgramme } from '@/lib/parametresService';
import type { MotifDef } from '@/utils/programme';
import { errMsg } from '@/utils';

type Liste = 'nonFait' | 'fait';

/** Options de chaque liste : case à cocher (ou nombre pour les poteaux) */
const OPTIONS: Record<Liste, { cle: keyof MotifDef; label: string; aide: string }[]> = {
  fait: [
    {
      cle: 'reseau',
      label: 'Panne réseau',
      aide: 'Points × coefficient panne réseau (câble, HUB-BOX, SUB-BOX)',
    },
    {
      cle: 'leger',
      label: 'Sans intervention',
      aide: 'Points « sans intervention » + bonus décharge / scanné',
    },
    {
      cle: 'sansPoint',
      label: 'Sans point',
      aide: 'La fiche faite ne rapporte aucun point',
    },
  ],
  nonFait: [
    {
      cle: 'installation',
      label: 'Installation seulement',
      aide: 'Proposé seulement pour une installation',
    },
  ],
};

const egal = (a: MotifsProgramme, b: MotifsProgramme) => JSON.stringify(a) === JSON.stringify(b);

export function MotifsEditeur() {
  const motifs = useParametresStore((s) => s.motifs);
  const sauverMotifs = useParametresStore((s) => s.sauverMotifs);
  const { showToast } = useToast();
  const [m, setM] = useState<MotifsProgramme>(motifs);
  const [nouveau, setNouveau] = useState<Record<Liste, string>>({
    nonFait: '',
    fait: '',
  });
  const [busy, setBusy] = useState(false);
  const modifie = !egal(m, motifs);

  const changer = (liste: Liste, i: number, patch: Partial<MotifDef>) =>
    setM((cur) => ({
      ...cur,
      [liste]: cur[liste].map((x, k) => (k === i ? nettoyer({ ...x, ...patch }) : x)),
    }));
  const deplacer = (liste: Liste, i: number, d: -1 | 1) =>
    setM((cur) => {
      const l = [...cur[liste]];
      const j = i + d;
      if (j < 0 || j >= l.length) return cur;
      [l[i], l[j]] = [l[j], l[i]];
      return { ...cur, [liste]: l };
    });
  const supprimer = (liste: Liste, i: number) => setM((cur) => ({ ...cur, [liste]: cur[liste].filter((_, k) => k !== i) }));
  const existe = (liste: Liste, label: string) => m[liste].some((x) => x.label.trim().toLowerCase() === label.trim().toLowerCase());
  const ajouter = (liste: Liste) => {
    const label = nouveau[liste].replace(/\s+/g, ' ').trim();
    if (!label || existe(liste, label)) return;
    setM((cur) => ({ ...cur, [liste]: [...cur[liste], { label }] }));
    setNouveau((cur) => ({ ...cur, [liste]: '' }));
  };

  const vides = [...m.nonFait, ...m.fait].some((x) => !x.label.trim());
  const enregistrer = async () => {
    setBusy(true);
    try {
      await sauverMotifs(m);
      setM(useParametresStore.getState().motifs);
      showToast('Motifs enregistrés : proposés aux chefs dès maintenant', 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const bloc = (liste: Liste, titre: string, icone: ReactNode, aide: string) => (
    <Card>
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        {icone}
        <h2 className="font-bold text-slate-800">{titre}</h2>
        <span className="text-xs text-slate-400">{m[liste].length} motifs</span>
      </div>
      <p className="px-4 pt-2 text-[11px] text-slate-500">{aide}</p>
      <div className="divide-y divide-slate-100">
        {m[liste].map((x, i) => (
          <div key={i} className="px-4 py-2 flex flex-wrap items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Monter"
                disabled={i === 0}
                onClick={() => deplacer(liste, i, -1)}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Descendre"
                disabled={i === m[liste].length - 1}
                onClick={() => deplacer(liste, i, 1)}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input
              aria-label="Motif"
              value={x.label}
              maxLength={120}
              onChange={(e) => changer(liste, i, { label: e.target.value })}
              className={`!py-1.5 !text-sm flex-1 min-w-[12rem] ${!x.label.trim() ? '!border-red-400' : ''}`}
            />
            {OPTIONS[liste].map((o) => (
              <label key={o.cle} title={o.aide} className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={!!x[o.cle]}
                  onChange={(e) =>
                    changer(liste, i, {
                      [o.cle]: e.target.checked || undefined,
                    })
                  }
                />
                {o.label}
              </label>
            ))}
            {liste === 'nonFait' && (
              <label
                title="Poteaux comptés dans les statistiques quand ce motif est choisi"
                className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap"
              >
                Poteaux
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={x.poteaux ?? 0}
                  onChange={(e) =>
                    changer(liste, i, {
                      poteaux: Math.min(5, Math.max(0, Math.round(Number(e.target.value) || 0))) || undefined,
                    })
                  }
                  className="!py-1 !text-xs w-14 text-right"
                />
              </label>
            )}
            <button
              type="button"
              aria-label={`Supprimer ${x.label}`}
              onClick={() => supprimer(liste, i)}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <Input
          aria-label="Nouveau motif"
          placeholder="Nouveau motif…"
          value={nouveau[liste]}
          maxLength={120}
          onChange={(e) => setNouveau((cur) => ({ ...cur, [liste]: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && ajouter(liste)}
          className="!py-1.5 !text-sm flex-1 min-w-[12rem]"
        />
        <Button
          size="sm"
          variant="outline"
          icon={<Plus className="w-3.5 h-3.5" />}
          disabled={!nouveau[liste].trim() || existe(liste, nouveau[liste])}
          onClick={() => ajouter(liste)}
        >
          Ajouter
        </Button>
        {nouveau[liste].trim() && existe(liste, nouveau[liste]) && <span className="text-xs text-red-600">Ce motif existe déjà</span>}
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      {bloc(
        'nonFait',
        'Motifs « non fait »',
        <XCircle className="w-4 h-4 text-red-600" />,
        'Proposés quand le chef clôture une fiche « non faite ». « Installation seulement » : n’apparaît pas pour un dérangement. Poteaux : nombre de poteaux nécessaires comptés dans les statistiques.',
      )}
      {bloc(
        'fait',
        'Motifs « fait »',
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        'Proposés quand le chef clôture une fiche « faite ». Les cases changent les points de la fiche (barème de l’onglet Points). Un motif contenant « câble distribution » ou « MPO » reçoit les points du câble.',
      )}
      <Card>
        <div className="px-4 py-3 text-xs text-slate-500">
          Renommer ou supprimer un motif ne change pas les fiches déjà clôturées : elles gardent le texte choisi à l’époque (les points des cases ne
          s’appliquent qu’au nom exact du motif).
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() =>
              setM({
                nonFait: MOTIFS_DEFAUT.nonFait.map((x) => ({ ...x })),
                fait: MOTIFS_DEFAUT.fait.map((x) => ({ ...x })),
              })
            }
          >
            Valeurs par défaut
          </Button>
          <Button variant="outline" size="sm" disabled={!modifie} onClick={() => setM(motifs)}>
            Annuler
          </Button>
          <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} disabled={!modifie || vides || busy} onClick={enregistrer}>
            {busy ? 'Enregistrement…' : 'Enregistrer les motifs'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Retire les options décochées (undefined) pour garder des motifs comparables */
function nettoyer(m: MotifDef): MotifDef {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== false)) as unknown as MotifDef;
}
