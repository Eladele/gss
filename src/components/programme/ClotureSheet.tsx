import { useState } from 'react';
import { Check, ExternalLink, Minus, Plus } from 'lucide-react';
import type { ProgrammeOT } from '@/types';
import type { Cloture } from '@/lib/programmeService';
import { DECHARGE_URL, MOTIFS_FAIT, MOTIFS_NON_FAIT, ligneLabel, poteauxDuMotif } from '@/utils/programme';

const AUTRE = 'Autre';

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${
        on ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'
      }`}
    >
      <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${on ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`}>
        {on && <Check className="w-3.5 h-3.5 text-white" />}
      </span>
      {label}
      <span className="ml-auto text-xs font-bold">{on ? 'Oui' : 'Non'}</span>
    </button>
  );
}

/** Fenêtre de clôture d'une fiche : motif, décharge, scan, changement de constitution, poteaux */
export function ClotureSheet({
  ot,
  mode,
  onClose,
  onConfirm,
}: {
  ot: ProgrammeOT;
  mode: 'fait' | 'non_fait';
  onClose: () => void;
  onConfirm: (c: Cloture) => void;
}) {
  const fait = mode === 'fait';
  const liste = fait ? MOTIFS_FAIT : MOTIFS_NON_FAIT;
  const [motif, setMotif] = useState('');
  const [autre, setAutre] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [decharge, setDecharge] = useState(false);
  const [scanne, setScanne] = useState(false);
  const [cstChange, setCstChange] = useState(false);
  const [nouveauDis, setNouveauDis] = useState(ot.dis);
  const [nouvelOnt, setNouvelOnt] = useState(ot.ontSerials[0] ?? '');
  const [poteaux, setPoteaux] = useState(0);

  const choisir = (m: string) => {
    setMotif(m);
    // « Besoin poteau » / « Besoin 2 poteaux » : le nombre de poteaux se remplit tout seul
    const p = poteauxDuMotif(m, liste);
    if (p || !fait) setPoteaux(p);
  };

  const motifFinal = motif === AUTRE ? autre.trim() : motif;
  // Motif obligatoire pour un « non fait » et pour un dérangement réglé
  const motifRequis = !fait || ot.nature === 'derangement';
  const erreur =
    motifRequis && !motifFinal
      ? fait
        ? 'Choisissez la cause du dérangement.'
        : 'Choisissez le motif.'
      : motif === AUTRE && autre.trim().length < 3
        ? 'Précisez le motif.'
        : cstChange && !nouveauDis.trim()
          ? 'Saisissez le nouveau DIS.'
          : '';

  const confirmer = () => {
    if (erreur) return;
    onConfirm({
      statut: mode,
      motif: motifFinal,
      commentaire: commentaire.trim(),
      decharge: fait ? decharge : null,
      scanne: fait ? scanne : null,
      cstChange: fait && cstChange,
      nouveauDis: cstChange ? nouveauDis.trim().toUpperCase() : '',
      nouvelOnt: cstChange ? nouvelOnt.trim().toUpperCase() : '',
      poteaux,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[92vh] overflow-y-auto">
        <div className="p-5 space-y-4 max-w-lg mx-auto">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
          <div>
            <p className={`font-black text-lg ${fait ? 'text-green-700' : 'text-red-700'}`}>
              {fait ? 'Fait' : 'Non fait'} — {ligneLabel(ot)}
            </p>
            <p className="text-sm text-slate-500 truncate">{ot.clientNom}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">
              {fait ? (ot.nature === 'derangement' ? 'Cause du dérangement' : 'Motif (facultatif)') : 'Motif'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...liste.map((m) => m.label), AUTRE].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => choisir(m)}
                  className={`px-3 py-2 rounded-full text-xs font-semibold border transition ${
                    motif === m
                      ? fait
                        ? 'bg-green-700 border-green-700 text-white'
                        : 'bg-red-700 border-red-700 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {motif === AUTRE && (
              <input
                id="cloture-autre"
                autoFocus
                value={autre}
                onChange={(e) => setAutre(e.target.value)}
                placeholder="Précisez le motif"
                className="mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            )}
          </div>

          {fait && (
            <>
              <div className="flex gap-2">
                <Toggle on={decharge} set={setDecharge} label="Décharge" />
                <Toggle on={scanne} set={setScanne} label="Scanné" />
              </div>
              <a
                href={DECHARGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="-mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ouvrir l’application décharge
              </a>

              <div className={`rounded-xl border p-3 space-y-2 ${cstChange ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={cstChange} onChange={(e) => setCstChange(e.target.checked)} />
                  Changement de constitution (CST)
                </label>
                {cstChange && (
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label htmlFor="cst-dis" className="text-[11px] font-semibold text-slate-500">
                        Nouveau DIS <span className="font-normal">(ancien : {ot.dis || '—'})</span>
                      </label>
                      <input
                        id="cst-dis"
                        value={nouveauDis}
                        onChange={(e) => setNouveauDis(e.target.value)}
                        placeholder="ex. CA1Z042611/1-4"
                        className="w-full font-mono border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="cst-ont" className="text-[11px] font-semibold text-slate-500">
                        Nouvel ONT <span className="font-normal">(ancien : {ot.ontSerials[0] || '—'})</span>
                      </label>
                      <input
                        id="cst-ont"
                        value={nouvelOnt}
                        onChange={(e) => setNouvelOnt(e.target.value)}
                        placeholder="ex. 48575443B2FCC9AE"
                        className="w-full font-mono border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">{fait ? 'Poteaux posés' : 'Poteaux nécessaires'}</p>
              <p className="text-[11px] text-slate-400">Ajoutés aux poteaux des statistiques</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Moins"
                onClick={() => setPoteaux((p) => Math.max(0, p - 1))}
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-6 text-center text-lg font-black tabular-nums">{poteaux}</span>
              <button
                type="button"
                aria-label="Plus"
                onClick={() => setPoteaux((p) => Math.min(9, p + 1))}
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <textarea
            id="cloture-commentaire"
            rows={2}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Commentaire (facultatif)"
            className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500 bg-slate-50"
          />

          {erreur && motif !== '' && <p className="text-sm text-red-700">{erreur}</p>}
          <div className="flex gap-3 pb-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 font-semibold text-slate-700">
              Annuler
            </button>
            <button
              type="button"
              onClick={confirmer}
              disabled={!!erreur}
              className={`flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-40 ${fait ? 'bg-green-600' : 'bg-red-600'}`}
            >
              {fait ? 'Confirmer fait' : 'Confirmer non fait'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
