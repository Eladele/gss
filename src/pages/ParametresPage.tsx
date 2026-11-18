import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileSpreadsheet, History, MapPin, Plus, RotateCcw, Save, Settings2, ShieldAlert, Trash2, Trophy, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useParametresStore } from '@/store/useParametresStore';
import { Button, Card, Input, useToast } from '@/components/ui';
import {
  BAREME_DEFAUT,
  ENTETE_DEFAUT,
  REGLAGES_DEFAUT,
  baremeDepuisBase,
  baremeVersBase,
  enteteDepuisBase,
  fetchHistoriqueParametres,
  type Bareme,
  type EnteteVirement,
  type ModifParametre,
  type Reglages,
} from '@/lib/parametresService';
import { PUBLIC_HOLIDAYS } from '@/utils/stats';
import { estEquipeSupervision, villeDeSupervision, villeEquipe } from '@/hooks/usePerimetre';
import { fmtPts, fmtPtsSigne } from '@/utils/points';
import { MOTIFS_FAUX_OK } from '@/utils/programme';
import { errMsg } from '@/utils';

// ─── Barème ──────────────────────────────────────────────────────────────────
// Trois familles normalisées, mêmes bornes et même pas pour toute la famille :
//   • points d'une fiche : −10 à +10 par 0,25 ;
//   • coefficient : 0 à 1 par 0,05 ;
//   • pénalités : toujours négatives, −10 à 0 par 0,25 (« 1 » saisi devient « −1 »).
type Famille = 'points' | 'coef' | 'penalite';
const FAMILLES: Record<Famille, { min: number; max: number; pas: number; unite: string }> = {
  points: { min: -10, max: 10, pas: 0.25, unite: 'pt' },
  coef: { min: 0, max: 1, pas: 0.05, unite: '×' },
  penalite: { min: -10, max: 0, pas: 0.25, unite: 'pt' },
};
type LigneBareme = { cle: keyof Bareme; label: string; aide: string; famille: Famille };

const FICHES: LigneBareme[] = [
  { cle: 'faitDansDelai', label: 'Faite dans le délai', aide: 'Marquée « Fait » avant son échéance de 22 h.', famille: 'points' },
  { cle: 'faitHorsDelai', label: 'Faite hors délai', aide: 'Marquée « Fait » après son échéance.', famille: 'points' },
  { cle: 'nonFait', label: 'Non faite', aide: 'Clôturée « Non fait » avec un motif.', famille: 'points' },
  {
    cle: 'faitSansPoint',
    label: 'Faite sans point',
    aide: 'Motif « Installé par quelqu’un », « Confirmé par client » ou « Erreur de signalisation » (0 = aucun point).',
    famille: 'points',
  },
];
const AJUSTEMENTS: LigneBareme[] = [
  {
    cle: 'coefReseau',
    label: 'Coefficient panne réseau',
    aide: 'Motif câble distribution / transport coupé, HUB-BOX ou SUB-BOX défectueux : les points de la fiche sont multipliés par ce coefficient (0,5 = moitié).',
    famille: 'coef',
  },
  {
    cle: 'sansIntervention',
    label: 'Faite sans intervention',
    aide: 'Dans le délai, motif « Modem défectueux » ou « Problème électricité » : ces points au lieu de « faite dans le délai ».',
    famille: 'points',
  },
  { cle: 'bonusDecharge', label: '+ bonus décharge', aide: 'Ajouté à une fiche « sans intervention » si la décharge est faite.', famille: 'points' },
  { cle: 'bonusScan', label: '+ bonus scanné', aide: 'Ajouté à une fiche « sans intervention » si l’ONT est scanné.', famille: 'points' },
];
const PENALITES: LigneBareme[] = [
  { cle: 'penaliteNonTraitee', label: 'Non traitée à 22 h', aide: 'Ni faite ni « non faite » au contrôle du soir, une fois l’échéance arrivée (à chaque contrôle).', famille: 'penalite' },
  { cle: 'penaliteRetardee', label: 'Retardée', aide: 'Fiche ouverte reprogrammée à une date plus tard (case « pénaliser » cochée).', famille: 'penalite' },
  { cle: 'penaliteReaffectee', label: 'Réaffectée', aide: 'Seulement si « pénaliser l’équipe » est coché lors de la réaffectation.', famille: 'penalite' },
  { cle: 'penaliteFauxOk', label: 'Faux OK', aide: 'Fiche marquée « Fait » à tort : elle perd ses points et l’équipe prend cette pénalité.', famille: 'penalite' },
];
const LIGNES_BAREME = [...FICHES, ...AJUSTEMENTS, ...PENALITES];

/** Valeur normalisée : signe d'une pénalité, arrondi au pas, bornes de la famille */
function normaliser(l: LigneBareme, v: number): number {
  const f = FAMILLES[l.famille];
  let x = l.famille === 'penalite' ? -Math.abs(v) : v;
  x = Math.round(x / f.pas) * f.pas;
  x = Math.min(f.max, Math.max(f.min, x));
  return Math.round(x * 100) / 100 || 0;
}

const LIBELLE_BAREME: Record<string, string> = {
  fait_dans_delai: 'Faite dans le délai',
  fait_hors_delai: 'Faite hors délai',
  non_fait: 'Non faite',
  coef_reseau: 'Coef. panne réseau',
  sans_intervention: 'Sans intervention',
  bonus_decharge: 'Bonus décharge',
  bonus_scan: 'Bonus scanné',
  fait_sans_point: 'Fait sans point',
  penalite_non_traitee: 'Non traitée à 22 h',
  penalite_retardee: 'Retardée',
  penalite_reaffectee: 'Réaffectée',
  penalite_faux_ok: 'Faux OK',
};

function ChampBareme({ l, valeur, onChange }: { l: LigneBareme; valeur: number | ''; onChange: (v: number | '') => void }) {
  const f = FAMILLES[l.famille];
  const vide = valeur === '' || Number.isNaN(valeur);
  const corrige = !vide && normaliser(l, valeur as number) !== valeur;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm">{l.label}</p>
        <p className="text-xs text-slate-500">{l.aide}</p>
      </div>
      <div className="w-28 shrink-0">
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            step={f.pas}
            min={f.min}
            max={f.max}
            aria-label={l.label}
            value={valeur}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            // à la sortie du champ : signe, pas et bornes corrigés
            onBlur={() => !vide && onChange(normaliser(l, valeur as number))}
            className={`text-right font-bold tabular-nums pr-8 ${vide ? 'border-red-400' : corrige ? 'border-amber-400 text-amber-700' : ''}`}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{f.unite}</span>
        </div>
        <p className="text-[10px] text-slate-400 text-right mt-0.5">
          {fmtPts(f.min)} à {fmtPts(f.max)} · pas {fmtPts(f.pas)}
        </p>
      </div>
    </div>
  );
}

// ─── En-tête du virement ─────────────────────────────────────────────────────
const BANQUES_FIXES = ['BPM', 'BII', 'Caisse'];
type ChampTexte = Exclude<keyof EnteteVirement, 'banques'>;
const CHAMPS_ENTETE: { cle: ChampTexte; label: string }[] = [
  { cle: 'siege', label: 'Siège social' },
  { cle: 'rc', label: 'Registre de commerce (RC)' },
  { cle: 'nif', label: 'NIF' },
  { cle: 'ville', label: 'Ville (« …, le 08/11/2026 »)' },
  { cle: 'motif', label: 'Motif (suivi du mois)' },
  { cle: 'faveur', label: 'Phrase avant le tableau' },
  { cle: 'signataire', label: 'Signataire' },
];

const resume = (m: ModifParametre): string => {
  if (m.cle === 'bareme_points') {
    // valeurs manquantes avant la première modification = barème par défaut
    const avant = baremeVersBase(baremeDepuisBase(m.avant ?? {}));
    const apres = baremeVersBase(baremeDepuisBase(m.apres));
    const diffs = Object.keys(LIBELLE_BAREME)
      .filter((k) => avant[k] !== apres[k])
      .map((k) => `${LIBELLE_BAREME[k]} ${fmtPtsSigne(avant[k])} → ${fmtPtsSigne(apres[k])}`);
    return diffs.join(' · ') || 'Barème enregistré';
  }
  if (m.cle === 'entete_virement') {
    const a = enteteDepuisBase(m.avant ?? {});
    const b = enteteDepuisBase(m.apres);
    const champs = CHAMPS_ENTETE.filter((c) => a[c.cle] !== b[c.cle]).map((c) => c.label);
    if (a.destinataire !== b.destinataire || a.compte !== b.compte) champs.push('destinataire / compte');
    for (const bq of new Set([...Object.keys(a.banques), ...Object.keys(b.banques)]))
      if (JSON.stringify(a.banques[bq] ?? {}) !== JSON.stringify(b.banques[bq] ?? {})) champs.push(`banque ${bq}`);
    return `En-tête du virement : ${champs.join(', ') || 'enregistré'}`;
  }
  if (m.cle === 'parametres_generaux') return 'Réglages généraux';
  return m.cle;
};

export default function ParametresPage() {
  const user = useAppStore((s) => s.user)!;
  const { bareme, entete, reglages, sauverBareme, sauverEntete, sauverReglages } = useParametresStore();
  const { showToast } = useToast();

  const [b, setB] = useState<Record<keyof Bareme, number | ''>>(bareme);
  const [e, setE] = useState<EnteteVirement>(entete);
  const [banque, setBanque] = useState('BPM');
  const [busy, setBusy] = useState<'' | 'bareme' | 'entete' | 'reglages'>('');
  const [nouvelleBanque, setNouvelleBanque] = useState('');
  const [r, setR] = useState<Reglages>(reglages);
  const [nouveauFerie, setNouveauFerie] = useState('');
  // équipes « SUPERVISION … » : ville gérée et équipes de terrain de cette ville
  const toutesEquipes = useAppStore((st) => st.equipes);
  const supervisions = useMemo(
    () =>
      toutesEquipes
        .filter((eq) => estEquipeSupervision(eq.name))
        .map((eq) => {
          const ville = villeDeSupervision({ teamId: eq.id, teamName: eq.name }, toutesEquipes);
          const geres = ville ? toutesEquipes.filter((x) => villeEquipe(x) === ville && !estEquipeSupervision(x.name)) : [];
          return { eq, ville, geres };
        }),
    [toutesEquipes],
  );
  const banques = useMemo(() => [...new Set([...BANQUES_FIXES, ...Object.keys(e.banques)])], [e.banques]);
  const [historique, setHistorique] = useState<ModifParametre[]>([]);

  const chargerHistorique = () => fetchHistoriqueParametres().then(setHistorique);
  useEffect(() => {
    chargerHistorique();
  }, []);

  const lignes = LIGNES_BAREME;
  const baremeValide = lignes.every((l) => {
    const v = b[l.cle];
    return v !== '' && !Number.isNaN(v);
  });
  const baremeModifie = lignes.some((l) => b[l.cle] !== bareme[l.cle]);
  const reglagesModifies = JSON.stringify(r) !== JSON.stringify(reglages);
  const enteteModifie = JSON.stringify(e) !== JSON.stringify(entete);
  const exemple = useMemo(() => {
    const n = (k: keyof Bareme) => (typeof b[k] === 'number' ? (b[k] as number) : 0);
    return {
      reseau: n('faitDansDelai') * n('coefReseau'),
      dans: n('faitDansDelai'),
      pen: n('penaliteNonTraitee'),
      leger: n('sansIntervention'),
      legerComplet: n('sansIntervention') + n('bonusDecharge') + n('bonusScan'),
    };
  }, [b]);

  const enregistrerBareme = async () => {
    setBusy('bareme');
    try {
      // valeurs normalisées (signe des pénalités, pas, bornes) avant l'enregistrement
      const propre = Object.fromEntries(lignes.map((l) => [l.cle, normaliser(l, b[l.cle] as number)])) as unknown as Bareme;
      setB(propre);
      await sauverBareme(user.id, propre);
      setB(useParametresStore.getState().bareme); // valeurs arrondies par la base
      showToast('Barème enregistré : appliqué aux points et aux prochaines pénalités', 'success');
      chargerHistorique();
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy('');
    }
  };
  const enregistrerEntete = async () => {
    setBusy('entete');
    try {
      await sauverEntete(user.id, e);
      setE(useParametresStore.getState().entete); // espaces retirés par la base
      showToast('En-tête de l’ordre de virement enregistré', 'success');
      chargerHistorique();
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const enregistrerReglages = async () => {
    setBusy('reglages');
    try {
      await sauverReglages(r);
      setR(useParametresStore.getState().reglages);
      showToast('Réglages enregistrés', 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy('');
    }
  };
  /** Supprime le paramétrage propre d'une banque (elle reprend le destinataire / compte par défaut) */
  const supprimerBanque = (bq: string) => {
    setE((cur) => {
      const banquesRestantes = { ...cur.banques };
      delete banquesRestantes[bq];
      return { ...cur, banques: banquesRestantes };
    });
    if (!BANQUES_FIXES.includes(bq)) setBanque('');
  };
  const ajouterBanque = () => {
    const nom = nouvelleBanque.trim();
    if (!nom) return;
    setE((cur) => (cur.banques[nom] ? cur : { ...cur, banques: { ...cur.banques, [nom]: {} } }));
    setBanque(nom);
    setNouvelleBanque('');
  };

  const champBanque = (k: 'destinataire' | 'compte', v: string) =>
    setE((cur) => {
      const bq = { ...(cur.banques[banque] ?? {}), [k]: v };
      if (!v) delete bq[k];
      return { ...cur, banques: { ...cur.banques, [banque]: bq } };
    });
  const dest = e.banques[banque]?.destinataire || e.destinataire;
  const compte = e.banques[banque]?.compte || e.compte;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Barème des points */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-600" />
          <h2 className="font-bold text-slate-800">Barème des points des équipes</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-x-8 px-4">
          {(
            [
              ['Points d’une fiche', 'text-slate-400', FICHES],
              ['Sans intervention, panne réseau et bonus', 'text-slate-400', AJUSTEMENTS],
              ['Pénalités (toujours négatives)', 'text-red-400', PENALITES],
            ] as const
          ).map(([titre, cls, liste]) => (
            <div key={titre}>
              <p className={`text-[11px] font-bold uppercase tracking-wide pt-3 ${cls}`}>{titre}</p>
              {liste.map((l) => (
                <ChampBareme key={l.cle} l={l} valeur={b[l.cle]} onChange={(v) => setB((cur) => ({ ...cur, [l.cle]: v }))} />
              ))}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 text-xs text-slate-600 space-y-1">
          <p>
            Exemple : dérangement fait dans le délai <b>{fmtPtsSigne(exemple.dans)}</b> · même fiche avec panne réseau <b>{fmtPtsSigne(exemple.reseau)}</b> ·
            « modem défectueux » sans décharge ni scan <b>{fmtPtsSigne(exemple.leger)}</b>, avec décharge et scan <b>{fmtPtsSigne(exemple.legerComplet)}</b> · fiche oubliée
            deux soirs <b className="text-red-700">{fmtPts(exemple.pen * 2)}</b>.
          </p>
          <p>
            Les points des fiches sont recalculés avec le nouveau barème, y compris sur les périodes passées. Les pénalités déjà enregistrées gardent leur
            valeur ; les nouvelles prennent celle-ci.
          </p>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setB(BAREME_DEFAUT)}>
            Valeurs par défaut
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!baremeValide}
            onClick={() => setB((cur) => Object.fromEntries(lignes.map((l) => [l.cle, normaliser(l, cur[l.cle] as number)])) as Record<keyof Bareme, number>)}
            title="Pénalités en négatif, valeurs arrondies au pas, dans les bornes"
          >
            Normaliser
          </Button>
          <Button variant="outline" size="sm" disabled={!baremeModifie} onClick={() => setB(bareme)}>
            Annuler
          </Button>
          <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} disabled={!baremeModifie || !baremeValide || busy !== ''} onClick={enregistrerBareme}>
            {busy === 'bareme' ? 'Enregistrement…' : 'Enregistrer le barème'}
          </Button>
        </div>
      </Card>

      {/* Motifs du faux OK */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600" />
          <h2 className="font-bold text-slate-800">Motifs du faux OK</h2>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MOTIFS_FAUX_OK.map((m) => (
              <span key={m.code} className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-red-50 text-red-800 border-red-200">
                {m.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Liste fixe, la même partout (suivi du programme, Points équipes, base de données). « Autre » demande une précision courte. Bouton réservé à
            l’administrateur et au superviseur, sur une fiche marquée « Fait » : pénalité <b className="text-red-700">{fmtPts(bareme.penaliteFauxOk)}</b>, la
            fiche perd ses points et elle est rouverte chez l’équipe.
          </p>
        </div>
      </Card>

      {/* En-tête du virement */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-teal-700" />
          <h2 className="font-bold text-slate-800">En-tête de l’ordre de virement (Export Salaires)</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-3 px-4 py-3">
          {CHAMPS_ENTETE.map((c) => (
            <label key={c.cle} className="block">
              <span className="text-xs font-semibold text-slate-600">{c.label}</span>
              <span className="relative block">
                <Input
                  value={e[c.cle]}
                  maxLength={300}
                  placeholder="Vide : ligne retirée de l’export"
                  onChange={(ev) => setE((cur) => ({ ...cur, [c.cle]: ev.target.value }))}
                  className="pr-8"
                />
                {e[c.cle] && (
                  <button
                    type="button"
                    onClick={() => setE((cur) => ({ ...cur, [c.cle]: '' }))}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Supprimer ${c.label}`}
                    title="Supprimer cette ligne de l’en-tête"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-slate-600 mb-1">Destinataire et compte débité</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {banques.map((bq) => (
              <button
                key={bq}
                type="button"
                onClick={() => setBanque(bq)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${banque === bq ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                {bq}
                {e.banques[bq] && (e.banques[bq].destinataire || e.banques[bq].compte) ? ' •' : ''}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBanque('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${banque === '' ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              Par défaut
            </button>
            <span className="inline-flex items-center gap-1">
              <Input
                aria-label="Nouvelle banque"
                placeholder="Autre banque…"
                value={nouvelleBanque}
                maxLength={40}
                onChange={(ev) => setNouvelleBanque(ev.target.value)}
                onKeyDown={(ev) => ev.key === 'Enter' && ajouterBanque()}
                className="!py-1 !text-xs w-32"
              />
              <button
                type="button"
                onClick={ajouterBanque}
                disabled={!nouvelleBanque.trim()}
                className="p-1.5 rounded-full text-teal-700 hover:bg-teal-50 disabled:opacity-40"
                aria-label="Ajouter la banque"
              >
                <Plus className="w-4 h-4" />
              </button>
            </span>
          </div>
          {banque === '' ? (
            <div className="grid gap-2">
              <Input aria-label="Destinataire par défaut" value={e.destinataire} maxLength={300} onChange={(ev) => setE((cur) => ({ ...cur, destinataire: ev.target.value }))} />
              <Input aria-label="Compte par défaut" value={e.compte} maxLength={300} onChange={(ev) => setE((cur) => ({ ...cur, compte: ev.target.value }))} />
              <p className="text-[11px] text-slate-500">Utilisés pour toute banque qui n’a pas les siens.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Input
                aria-label={`Destinataire ${banque}`}
                placeholder={`Par défaut : ${e.destinataire}`}
                value={e.banques[banque]?.destinataire ?? ''}
                maxLength={300}
                onChange={(ev) => champBanque('destinataire', ev.target.value)}
              />
              <Input
                aria-label={`Compte ${banque}`}
                placeholder={`Par défaut : ${e.compte}`}
                value={e.banques[banque]?.compte ?? ''}
                maxLength={300}
                onChange={(ev) => champBanque('compte', ev.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-slate-500 flex-1">Laissez vide pour reprendre le destinataire / compte par défaut.</p>
                {(e.banques[banque] || !BANQUES_FIXES.includes(banque)) && (
                  <Button variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => supprimerBanque(banque)} className="text-red-700">
                    {BANQUES_FIXES.includes(banque) ? `Supprimer le paramétrage ${banque}` : `Supprimer la banque ${banque}`}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Aperçu */}
        <div className="mx-4 mb-3 border border-slate-200 rounded-lg p-4 text-[13px] text-slate-800 bg-white" style={{ fontFamily: '"Times New Roman", serif' }}>
          {(e.siege || e.rc || e.nif) && (
            <div className="py-1 px-3 mb-2 bg-teal-50/60 border-l-[3px] border-teal-800">
              {e.siege && <p>{e.siege}</p>}
              {e.rc && <p>{e.rc}</p>}
              {e.nif && <p className="font-bold">{e.nif}</p>}
            </div>
          )}
          <p className="text-right italic">
            {e.ville}, le {new Date().toLocaleDateString('fr-FR')}
          </p>
          <p className="text-center font-bold text-teal-900 text-base py-1 border-b-2 border-teal-600 mb-2">ORDRE DE VIREMENT N° 001/DG/GSS/{new Date().getFullYear()}</p>
          <p className="text-center font-bold">A</p>
          <p className="text-center font-bold mb-1">{dest}</p>
          <p>
            {compte} <b className="text-teal-900">1 250 000,00 MRU</b>
          </p>
          <p className="font-bold underline mt-1">
            Motif : {e.motif} {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </p>
          <p>{e.faveur}</p>
          <p className="text-center font-bold underline mt-3 text-teal-900">{e.signataire}</p>
          <p className="text-[10px] text-slate-400 mt-2 font-sans">Aperçu {banque || 'par défaut'} · montant d’exemple.</p>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setE({ ...ENTETE_DEFAUT, banques: {} })}>
            Valeurs par défaut
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            className="text-red-700"
            onClick={() => setE({ siege: '', rc: '', nif: '', ville: '', destinataire: '', compte: '', motif: '', faveur: '', signataire: '', banques: {} })}
            title="Vider tout l’en-tête (toutes les lignes et toutes les banques) — à enregistrer ensuite"
          >
            Tout supprimer
          </Button>
          <Button variant="outline" size="sm" disabled={!enteteModifie} onClick={() => setE(entete)}>
            Annuler
          </Button>
          <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} disabled={!enteteModifie || busy !== ''} onClick={enregistrerEntete}>
            {busy === 'entete' ? 'Enregistrement…' : 'Enregistrer l’en-tête'}
          </Button>
        </div>
      </Card>

      {/* Réglages généraux */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-blue-700" />
          <h2 className="font-bold text-slate-800">Réglages généraux</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4 px-4 py-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Programme du soir à partir de</span>
            <span className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                value={r.heureProgrammeSoir}
                onChange={(ev) => setR((cur) => ({ ...cur, heureProgrammeSoir: Math.min(23, Math.max(0, Math.round(Number(ev.target.value) || 0))) }))}
                className="w-20 text-right font-bold"
              />
              <span className="text-sm text-slate-600">h</span>
            </span>
            <span className="text-[11px] text-slate-500">Après cette heure, « Distribuer » propose le programme du lendemain et le renvoi des non faites se fait pour demain.</span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Non faites à renvoyer : les derniers</span>
            <span className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={r.joursNonFaites}
                onChange={(ev) => setR((cur) => ({ ...cur, joursNonFaites: Math.min(365, Math.max(1, Math.round(Number(ev.target.value) || 1))) }))}
                className="w-20 text-right font-bold"
              />
              <span className="text-sm text-slate-600">jours</span>
            </span>
            <span className="text-[11px] text-slate-500">Fiches « non faites » affichées en bas du suivi du programme pour être renvoyées.</span>
          </label>
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Jours fériés supplémentaires
          </p>
          <p className="text-[11px] text-slate-500 mb-2">
            Ajoutés aux {PUBLIC_HOLIDAYS.length} jours déjà connus de l’application (fêtes fixes et musulmanes estimées) : pas de délai ces jours-là dans les
            statistiques et les échéances calculées par l’application.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {r.joursFeries.map((j) => (
              <span key={j} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
                {j.split('-').reverse().join('/')}
                <button
                  type="button"
                  onClick={() => setR((cur) => ({ ...cur, joursFeries: cur.joursFeries.filter((x) => x !== j) }))}
                  aria-label={`Supprimer le ${j}`}
                  className="text-indigo-500 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <Input type="date" aria-label="Jour férié" value={nouveauFerie} onChange={(ev) => setNouveauFerie(ev.target.value)} className="!py-1 !text-xs w-40" />
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="w-3.5 h-3.5" />}
              disabled={!nouveauFerie || r.joursFeries.includes(nouveauFerie)}
              onClick={() => {
                setR((cur) => ({ ...cur, joursFeries: [...cur.joursFeries, nouveauFerie].sort() }));
                setNouveauFerie('');
              }}
            >
              Ajouter
            </Button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Superviseurs régionaux
          </p>
          <p className="text-[11px] text-slate-500 mb-2">
            Un compte superviseur rattaché à une équipe « SUPERVISION … » d’une autre ville que Nouakchott ne voit et ne gère que les équipes et les zones de
            cette ville (programme, surveillance, points, situations, équipes, zones, scans, chantiers). Le tableau de bord général reste consultable.
          </p>
          {supervisions.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aucune équipe « SUPERVISION … ».</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {supervisions.map(({ eq, ville, geres }) => (
                <div key={eq.id} className="px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{eq.name}</span>
                  <span className="text-slate-500"> · {ville ?? 'toutes les villes'}</span>
                  {ville && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Gère {geres.map((g) => `${g.name} (${(g.zones ?? []).length} zone${(g.zones ?? []).length > 1 ? 's' : ''})`).join(', ') || 'aucune équipe'}
                      {geres.some((g) => (g.zones ?? []).length) && ` : ${geres.flatMap((g) => g.zones ?? []).join(', ')}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setR({ ...REGLAGES_DEFAUT, villesSuperviseurs: r.villesSuperviseurs })}>
            Valeurs par défaut
          </Button>
          <Button variant="outline" size="sm" disabled={!reglagesModifies} onClick={() => setR(reglages)}>
            Annuler
          </Button>
          <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} disabled={!reglagesModifies || busy !== ''} onClick={enregistrerReglages}>
            {busy === 'reglages' ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </Button>
        </div>
      </Card>

      {/* Historique */}
      {historique.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-slate-800">Dernières modifications</h2>
          </div>
          {historique.map((m) => (
            <div key={m.id} className="px-4 py-2 border-b border-slate-100 last:border-0 text-sm flex flex-wrap gap-x-3">
              <span className="text-slate-500 tabular-nums">
                {new Date(m.le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="font-semibold text-slate-700">{m.parNom ?? '—'}</span>
              <span className="text-slate-600 flex-1 min-w-0">{resume(m)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
