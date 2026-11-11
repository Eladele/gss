import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, History, RotateCcw, Save, ShieldAlert, Trophy } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useParametresStore } from '@/store/useParametresStore';
import { Button, Card, Input, useToast } from '@/components/ui';
import {
  BAREME_DEFAUT,
  ENTETE_DEFAUT,
  baremeDepuisBase,
  baremeVersBase,
  enteteDepuisBase,
  fetchHistoriqueParametres,
  type Bareme,
  type EnteteVirement,
  type ModifParametre,
} from '@/lib/parametresService';
import { fmtPts, fmtPtsSigne } from '@/utils/points';
import { MOTIFS_FAUX_OK } from '@/utils/programme';
import { errMsg } from '@/utils';

// ─── Barème ──────────────────────────────────────────────────────────────────
type LigneBareme = { cle: keyof Bareme; label: string; aide: string; min: number; max: number; pas: number };

const FICHES: LigneBareme[] = [
  { cle: 'faitDansDelai', label: 'Fiche faite dans le délai', aide: 'Marquée « Fait » avant son échéance de 22 h.', min: -10, max: 10, pas: 0.5 },
  { cle: 'faitHorsDelai', label: 'Fiche faite hors délai', aide: 'Marquée « Fait » après son échéance.', min: -10, max: 10, pas: 0.5 },
  { cle: 'nonFait', label: 'Fiche « non faite »', aide: 'Clôturée « Non fait » avec un motif.', min: -10, max: 10, pas: 0.5 },
  {
    cle: 'coefReseau',
    label: 'Coefficient panne réseau',
    aide: 'Fiche faite avec motif câble distribution / transport coupé, HUB-BOX ou SUB-BOX défectueux : ses points sont multipliés par ce coefficient (0,5 = moitié).',
    min: 0,
    max: 1,
    pas: 0.05,
  },
  {
    cle: 'sansIntervention',
    label: 'Fait sans intervention',
    aide: 'Fiche faite dans le délai avec motif « Modem défectueux » ou « Problème électricité » : ces points au lieu du point entier.',
    min: 0,
    max: 10,
    pas: 0.05,
  },
  { cle: 'bonusDecharge', label: '… + bonus décharge', aide: 'Ajouté à une fiche « sans intervention » si la décharge est faite.', min: 0, max: 10, pas: 0.05 },
  { cle: 'bonusScan', label: '… + bonus scanné', aide: 'Ajouté à une fiche « sans intervention » si l’ONT est scanné.', min: 0, max: 10, pas: 0.05 },
  {
    cle: 'faitSansPoint',
    label: 'Fait sans point',
    aide: 'Fiche faite avec motif « Installé par quelqu’un », « Confirmé par client » ou « Erreur de signalisation » (0 = aucun point).',
    min: 0,
    max: 10,
    pas: 0.05,
  },
];

const PENALITES: LigneBareme[] = [
  { cle: 'penaliteNonTraitee', label: 'Non traitée à 22 h', aide: 'Fiche ni faite ni « non faite » au contrôle du soir, une fois son échéance arrivée (à chaque contrôle).', min: -10, max: 0, pas: 0.5 },
  { cle: 'penaliteRetardee', label: 'Fiche retardée', aide: 'Fiche ouverte reprogrammée à une date plus tard (case « pénaliser » cochée).', min: -10, max: 0, pas: 0.5 },
  { cle: 'penaliteReaffectee', label: 'Fiche réaffectée', aide: 'Seulement si la case « pénaliser l’équipe » est cochée au moment de la réaffectation.', min: -10, max: 0, pas: 0.5 },
  { cle: 'penaliteFauxOk', label: 'Faux OK', aide: 'Fiche marquée « Fait » à tort : la fiche perd ses points et l’équipe prend cette pénalité.', min: -10, max: 0, pas: 0.5 },
];

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
  const hors = valeur === '' || Number.isNaN(valeur) || valeur < l.min || valeur > l.max;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm">{l.label}</p>
        <p className="text-xs text-slate-500">{l.aide}</p>
      </div>
      <div className="w-28 shrink-0">
        <Input
          type="number"
          inputMode="decimal"
          step={l.pas}
          min={l.min}
          max={l.max}
          aria-label={l.label}
          value={valeur}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={`text-right font-bold tabular-nums ${hors ? 'border-red-400 text-red-700' : ''}`}
        />
        <p className="text-[10px] text-slate-400 text-right mt-0.5">
          {l.min} à {l.max}
        </p>
      </div>
    </div>
  );
}

// ─── En-tête du virement ─────────────────────────────────────────────────────
const BANQUES = ['BPM', 'BII', 'Caisse'];
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
  return m.cle;
};

export default function ParametresPage() {
  const user = useAppStore((s) => s.user)!;
  const { bareme, entete, sauverBareme, sauverEntete } = useParametresStore();
  const { showToast } = useToast();

  const [b, setB] = useState<Record<keyof Bareme, number | ''>>(bareme);
  const [e, setE] = useState<EnteteVirement>(entete);
  const [banque, setBanque] = useState('BPM');
  const [busy, setBusy] = useState<'' | 'bareme' | 'entete'>('');
  const [historique, setHistorique] = useState<ModifParametre[]>([]);

  const chargerHistorique = () => fetchHistoriqueParametres().then(setHistorique);
  useEffect(() => {
    chargerHistorique();
  }, []);

  const lignes = [...FICHES, ...PENALITES];
  const baremeValide = lignes.every((l) => {
    const v = b[l.cle];
    return v !== '' && !Number.isNaN(v) && v >= l.min && v <= l.max;
  });
  const baremeModifie = lignes.some((l) => b[l.cle] !== bareme[l.cle]);
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
      await sauverBareme(user.id, b as Bareme);
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
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-3">Fiches</p>
            {FICHES.map((l) => (
              <ChampBareme key={l.cle} l={l} valeur={b[l.cle]} onChange={(v) => setB((cur) => ({ ...cur, [l.cle]: v }))} />
            ))}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-400 pt-3">Pénalités</p>
            {PENALITES.map((l) => (
              <ChampBareme key={l.cle} l={l} valeur={b[l.cle]} onChange={(v) => setB((cur) => ({ ...cur, [l.cle]: v }))} />
            ))}
          </div>
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
              <Input value={e[c.cle]} maxLength={300} onChange={(ev) => setE((cur) => ({ ...cur, [c.cle]: ev.target.value }))} />
            </label>
          ))}
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-slate-600 mb-1">Destinataire et compte débité</p>
          <div className="flex gap-1.5 mb-2">
            {BANQUES.map((bq) => (
              <button
                key={bq}
                type="button"
                onClick={() => setBanque(bq)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${banque === bq ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                {bq}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBanque('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${banque === '' ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              Par défaut
            </button>
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
              <p className="text-[11px] text-slate-500">Laissez vide pour reprendre le destinataire / compte par défaut.</p>
            </div>
          )}
        </div>

        {/* Aperçu */}
        <div className="mx-4 mb-3 border border-slate-200 rounded-lg p-4 text-[13px] text-slate-800 bg-white" style={{ fontFamily: '"Times New Roman", serif' }}>
          <div className="py-1 px-3 mb-2 bg-teal-50/60 border-l-[3px] border-teal-800">
            <p>{e.siege}</p>
            <p>{e.rc}</p>
            <p className="font-bold">{e.nif}</p>
          </div>
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
          <Button variant="outline" size="sm" disabled={!enteteModifie} onClick={() => setE(entete)}>
            Annuler
          </Button>
          <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} disabled={!enteteModifie || busy !== ''} onClick={enregistrerEntete}>
            {busy === 'entete' ? 'Enregistrement…' : 'Enregistrer l’en-tête'}
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
