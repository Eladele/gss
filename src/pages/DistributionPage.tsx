import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarDays, ChevronDown, Clock, Copy, FileUp, Flame, MapPin, MessageCircle, Pin, RotateCcw, Search, Send, Trash2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, Select, useToast } from '@/components/ui';
import { ZONE_EQUIPE_MAP } from '@/data';
import { parseOtPdf, programmeWhatsApp, type ParsedOT } from '@/utils/otPdf';
import {
  attribuerZone,
  deleteOts,
  distribuer,
  existingNumeros,
  fetchDernierControle,
  fetchFichesOuvertes,
  fetchProgramme,
  marquerUrgent,
  rattraperControles,
  reassign,
  redistribuer,
  retarder,
  fetchHistoriqueClotures,
  fetchNonFaitesARenvoyer,
  rechercherProgramme,
  ajouterContact,
  fetchMotifsPrecedents,
  modifierZoneDis,
  type ClotureArchivee,
  type MotifPrecedent,
  signalerFauxOk,
  situationsOuvertes,
  subscribeProgramme,
} from '@/lib/programmeService';
import { HistoriqueMotifs, MotifsPrecedents } from '@/components/programme/Historique';
import { AffecterUrgentModal } from '@/components/programme/AffecterUrgentModal';
import {
  NATURE_CLASS,
  NATURE_LABEL,
  STATUT_OT,
  fmtTel,
  hubDe,
  hubLabel,
  libelleFauxOk,
  ligneLabel,
  peutAjouterContact,
  peutModifierZoneDis,
  peutSignalerFauxOk,
  zoneDuDis,
  type MotifFauxOk,
} from '@/utils/programme';
import { POINTS, REGLAGES_PROGRAMME, delaiOT, estPrioritaire, estSoir, fmtPts, jourCourt, jourOuvreSuivant, jourRemise, motPoint, ptsTexte } from '@/utils/points';
import { usePerimetre } from '@/hooks/usePerimetre';
import { ClotureResume } from '@/components/programme/OtCard';
import { FauxOkButton } from '@/components/programme/FauxOk';
import { AjoutContact } from '@/components/programme/AjoutContact';
import type { ProgrammeOT } from '@/types';
import { errMsg } from '@/utils';

type Item = ParsedOT & {
  key: string;
  equipe: string;
  sourceFichier: string;
  deja?: { equipe: string; date: string };
  existante?: { equipe: string; type: string }; // situation Excel ouverte que l'OT va compléter
  /** OT déjà distribué et rendu « non fait » (RV demain…) : renvoyé, son motif passé est gardé */
  renvoi?: { id: string; equipe: string; motif: string; traiteLe: string | null };
  /** fiches déjà clôturées de la même ligne (dérangements, installation…) : leurs motifs */
  precedents?: MotifPrecedent[];
  include: boolean;
};
type Row = Pick<ParsedOT, 'nature' | 'fgp' | 'clientCode' | 'clientNom' | 'telephones' | 'zone' | 'pco' | 'port' | 'ontSerials' | 'dis' | 'adresse' | 'sousType' | 'cableFibreM' | 'typeOt' | 'typeLigne'>;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const frDate = (iso: string) => iso.split('-').reverse().join('/');
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Affectation des fiches lues, zone par zone (ex. CA3Z05 → DÉPLOIEMENT) */
function ParZone({
  items,
  equipeNames,
  zoneEquipe,
  colorOf,
  onChoose,
  onRemember,
}: {
  items: { zone: string; equipe: string; nature: ParsedOT['nature']; include: boolean; deja?: unknown }[];
  equipeNames: string[];
  zoneEquipe: Record<string, string>;
  colorOf: (n: string) => string;
  onChoose: (zone: string, equipe: string) => void;
  onRemember: (zone: string, equipe: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const zones = useMemo(() => {
    const m = new Map<string, { zone: string; der: number; inst: number; equipes: Set<string> }>();
    items
      .filter((i) => i.include && !i.deja)
      .forEach((i) => {
        const z = i.zone || '';
        const r = m.get(z) ?? { zone: z, der: 0, inst: 0, equipes: new Set<string>() };
        if (i.nature === 'derangement') r.der++;
        else r.inst++;
        r.equipes.add(i.equipe);
        m.set(z, r);
      });
    // zones sans équipe d'abord, puis par code
    return [...m.values()].sort((a, b) => Number(!a.equipes.has('')) - Number(!b.equipes.has('')) || a.zone.localeCompare(b.zone));
  }, [items]);
  if (!zones.length) return null;
  return (
    <Card>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-blue-700" />
        <span className="font-bold text-slate-800">Par zone</span>
        <span className="text-xs text-slate-500">choisir l’équipe d’une zone l’applique à toutes ses fiches</span>
      </div>
      <div className="grid sm:grid-cols-2 2xl:grid-cols-3">
        {zones.map((z) => {
          const une = z.equipes.size === 1 ? [...z.equipes][0] : null;
          const memorisee = zoneEquipe[z.zone] ?? '';
          const manque = z.equipes.has('');
          return (
            <div key={z.zone || 'sans'} className={`px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 ${manque ? 'bg-amber-50/60' : ''}`}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: une ? colorOf(une) : '#F59E0B' }} />
              <div className="min-w-0 flex-1">
                <p className="font-mono font-bold text-sm text-slate-800">{z.zone || 'Zone inconnue'}</p>
                <p className="text-[11px] text-slate-500">
                  {z.der ? `${z.der} dér.` : ''}
                  {z.der && z.inst ? ' · ' : ''}
                  {z.inst ? `${z.inst} inst.` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Select
                  aria-label={`Équipe de la zone ${z.zone}`}
                  className="!py-1 !text-xs"
                  value={une ?? '__plusieurs'}
                  onChange={(e) => onChoose(z.zone, e.target.value)}
                >
                  {!une && <option value="__plusieurs">Plusieurs équipes</option>}
                  <option value="">— Équipe —</option>
                  {equipeNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
                {z.zone && une && une !== memorisee && (
                  <button
                    type="button"
                    disabled={saving === z.zone}
                    onClick={async () => {
                      setSaving(z.zone);
                      await onRemember(z.zone, une).finally(() => setSaving(null));
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50"
                    title={memorisee ? `Aujourd’hui : ${memorisee}` : 'Zone attribuée à aucune équipe'}
                  >
                    <Pin className="w-3 h-3" /> {saving === z.zone ? 'Enregistrement…' : 'Retenir pour les prochains programmes'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

async function shareWhatsApp(text: string, showToast: (m: string, t?: 'success' | 'error' | 'info') => void) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Programme copié : collez-le dans le groupe WhatsApp de l’équipe', 'success');
  } catch {
    showToast('Copie impossible sur cet appareil', 'error');
  }
}

/** Une info de la fiche avec son libellé (« Compte client », « Contact », « DIS »…) */
function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-xs text-slate-800 truncate">{children}</dd>
    </div>
  );
}

/** Fiche OT : FGP, nom, compte client, contact, DIS (avec son hub), zone / PCO */
function RowCells({ o, prioritaire, isUrgent }: { o: Row; prioritaire?: boolean; isUrgent?: boolean }) {
  const hub = hubDe(o);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        {isUrgent && (
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-600 text-white flex items-center gap-1 shadow-sm" title="Cas urgent à traiter en priorité absolue">
            <Flame className="w-3 h-3 text-yellow-300" /> URGENT
          </span>
        )}
        {prioritaire && !isUrgent && (
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-600 text-white" title="Délai officiel (depuis « OT reçu le ») déjà dépassé : à faire le jour même avant 22 h">
            PRIORITAIRE
          </span>
        )}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${NATURE_CLASS[o.nature]}`}>{NATURE_LABEL[o.nature]}</span>
        {o.typeOt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{o.typeOt}</span>}
        <span className="font-mono text-sm font-black text-slate-900">{ligneLabel(o)}</span>
        <span className="text-sm font-semibold text-slate-700 truncate">{o.clientNom || '—'}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
        <Info label="Compte client">
          <span className="font-mono font-semibold">{o.clientCode || '—'}</span>
        </Info>
        <Info label="Contact">
          <span className="tabular-nums">{o.telephones.length ? o.telephones.map(fmtTel).join(' / ') : '—'}</span>
        </Info>
        <Info label="DIS">
          <span className="font-mono">{o.dis || '—'}</span>
          {hub && <span className="ml-1.5 text-[10px] font-black px-1 rounded bg-sky-600 text-white">{hubLabel(hub)}</span>}
        </Info>
        <Info label="Zone · PCO">
          <span className="font-mono">
            {o.zone || '?'}
            {o.pco ? ` · ${o.pco}${o.port ? `-${o.port}` : ''}` : ''}
          </span>
        </Info>
      </dl>
      {(o.ontSerials[0] || (o.nature === 'installation' && o.cableFibreM)) && (
        <p className="mt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3">
          {o.ontSerials[0] && <span className="font-mono">ONT {o.ontSerials.join(' / ')}</span>}
          {o.nature === 'installation' && o.cableFibreM ? <span className="text-violet-700 font-semibold">Câble {o.cableFibreM} m</span> : null}
        </p>
      )}
    </div>
  );
}

export default function DistributionPage() {
  const user = useAppStore((s) => s.user)!;
  // superviseur régional : seulement les équipes (et fiches) de sa ville
  const { equipes, toutes: toutesEquipes, ville, equipeOk, ficheOk } = usePerimetre();
  const loadAll = useAppStore((s) => s.loadAll);
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const zoneEquipe = useMemo(() => {
    const map: Record<string, string> = { ...ZONE_EQUIPE_MAP };
    toutesEquipes.forEach((eq) => (eq.zones ?? []).forEach((z) => z && (map[z.trim().toUpperCase()] = eq.name)));
    return map;
  }, [toutesEquipes]);
  const equipeNames = useMemo(() => equipes.map((e) => e.name).sort((a, b) => a.localeCompare(b)), [equipes]);
  const colorOf = (name: string) => toutesEquipes.find((e) => e.name.toLowerCase() === name.toLowerCase())?.color ?? '#94A3B8';

  // ─── Import ────────────────────────────────────────────────────────────
  // le soir (à partir de 16 h), on prépare le programme du lendemain (jour ouvré suivant)
  const [dateProgramme, setDateProgramme] = useState(() => (estSoir() ? jourOuvreSuivant(todayISO()) : todayISO()));
  const demain = jourOuvreSuivant(todayISO());
  const soir = estSoir();
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const readFiles = async (files: FileList | File[]) => {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return showToast('Choisissez des fichiers PDF (OT dérangement ou installation)', 'error');
    setReading(true);
    try {
      const parsed: Item[] = [];
      for (const f of pdfs) {
        const ots = await parseOtPdf(f);
        ots.forEach((o, i) =>
          parsed.push({ ...o, key: `${f.name}-${i}-${o.numeroOt}`, sourceFichier: f.name, equipe: zoneEquipe[o.zone] ?? '', include: true }),
        );
      }
      // Même OT présent deux fois (deux PDF qui se recoupent) → une seule fiche
      const seen = new Set(items.map((i) => i.numeroOt));
      // superviseur régional : seulement les fiches des zones de sa ville (ou sans équipe connue)
      const horsVille = parsed.filter((p) => p.equipe && !equipeOk(p.equipe)).length;
      const fresh = parsed.filter((p) => p.numeroOt && (!p.equipe || equipeOk(p.equipe)) && !seen.has(p.numeroOt) && (seen.add(p.numeroOt), true));
      if (horsVille) showToast(`${horsVille} fiche${horsVille > 1 ? 's' : ''} hors de ${ville} ignorée${horsVille > 1 ? 's' : ''}`, 'info');
      const [deja, ouvertes, precedents] = await Promise.all([
        existingNumeros(fresh.map((p) => p.numeroOt)),
        situationsOuvertes(fresh.map((p) => p.fgp)),
        // motifs passés de la ligne : sans bloquer la lecture si la requête échoue
        fetchMotifsPrecedents(fresh.map((p) => p.fgp)).catch(() => new Map<string, MotifPrecedent[]>()),
      ]);
      fresh.forEach((p) => {
        const prec = precedents.get(p.fgp.trim());
        if (prec?.length) p.precedents = prec;
        const d = deja.get(p.numeroOt);
        // déjà « non faite » (RV demain, local fermé…) : on peut la renvoyer, son motif reste dans l'historique
        if (d && d.status === 'non_ok') Object.assign(p, { renvoi: { id: d.id, equipe: d.equipe, motif: d.motif, traiteLe: d.traiteLe }, equipe: p.equipe || d.equipe, include: true });
        else if (d) Object.assign(p, { deja: { equipe: d.equipe, date: d.date }, include: false });
        const ex = ouvertes.get(`${p.fgp}|${p.nature}`);
        if (ex && !d) Object.assign(p, { existante: { equipe: ex.equipe ?? '', type: ex.type }, equipe: p.equipe || ex.equipe || '' });
      });
      setItems((cur) => [...cur, ...fresh]);
      const nbDeja = fresh.filter((p) => p.deja).length;
      if (!parsed.length) showToast('Aucune fiche OT reconnue dans ce PDF', 'error');
      else showToast(`${fresh.length} fiche${fresh.length > 1 ? 's' : ''} lue${fresh.length > 1 ? 's' : ''}${nbDeja ? ` · ${nbDeja} déjà distribuée${nbDeja > 1 ? 's' : ''}` : ''}`, 'success');
    } catch (e) {
      showToast('Lecture du PDF impossible — ' + errMsg(e), 'error');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const update = (key: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const choisirZone = (zone: string, equipe: string) => {
    if (equipe === '__plusieurs') return;
    setItems((cur) => cur.map((i) => ((i.zone || '') === zone && !i.deja ? { ...i, equipe } : i)));
  };
  const retenirZone = async (zone: string, equipe: string) => {
    try {
      await attribuerZone(zone, equipe);
      await loadAll();
      showToast(`Zone ${zone} → ${equipe} : retenue pour les prochains programmes`, 'success');
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };
  const toSend = items.filter((i) => i.include && !i.deja);
  const missingTeam = toSend.filter((i) => !i.equipe);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((i) => m.set(i.equipe, [...(m.get(i.equipe) ?? []), i]));
    return [...m.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  }, [items]);

  const send = async () => {
    if (missingTeam.length) return showToast(`Choisissez une équipe pour ${missingTeam.length} fiche${missingTeam.length > 1 ? 's' : ''}`, 'error');
    setSending(true);
    try {
      const nouvelles = toSend.filter((i) => !i.renvoi);
      const aRenvoyer = toSend.filter((i) => i.renvoi);
      const { crees, completees } = nouvelles.length ? await distribuer(nouvelles, dateProgramme, user) : { crees: 0, completees: 0 };
      // fiches déjà « non faites » : renvoyées équipe par équipe, motif passé gardé
      let renvoyees = 0;
      // la date « OT reçu le » du nouvel OT remplace l'ancienne (sinon le jour du renvoi)
      const datesOt = Object.fromEntries(aRenvoyer.map((i) => [i.renvoi!.id, i.dateRecu]));
      for (const eq of new Set(aRenvoyer.map((i) => i.equipe)))
        renvoyees += await redistribuer(
          aRenvoyer.filter((i) => i.equipe === eq).map((i) => i.renvoi!.id),
          eq,
          dateProgramme,
          user,
          datesOt,
        );
      const n = crees + completees + renvoyees;
      showToast(
        `${n} fiche${n > 1 ? 's' : ''} distribuée${n > 1 ? 's' : ''}${completees ? ` (dont ${completees} situation${completees > 1 ? 's' : ''} existante${completees > 1 ? 's' : ''} complétée${completees > 1 ? 's' : ''})` : ''}${renvoyees ? ` · ${renvoyees} déjà non faite${renvoyees > 1 ? 's' : ''} renvoyée${renvoyees > 1 ? 's' : ''} (motifs gardés)` : ''} : les chefs d’équipe sont prévenus`,
        'success',
      );
      setItems([]);
      setHistDate(dateProgramme);
    } catch (e) {
      showToast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  };

  // ─── Programme déjà distribué ──────────────────────────────────────────
  // après le contrôle de 22 h : suivi du programme de demain, avec les fiches non traitées reportées
  const [histDate, setHistDate] = useState(() => (new Date().getUTCHours() >= 22 ? jourOuvreSuivant(todayISO()) : todayISO()));
  const [hist, setHist] = useState<ProgrammeOT[]>([]);
  const [histError, setHistError] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  // toutes les fiches en cours (ouvertes), épinglées en haut du suivi quel que soit le jour choisi
  const [ouvertes, setOuvertes] = useState<ProgrammeOT[]>([]);
  const [penaliser, setPenaliser] = useState(true);
  const [retardId, setRetardId] = useState<string | null>(null);
  const [retardDate, setRetardDate] = useState(() => addDays(todayISO(), 1));
  const [controle, setControle] = useState<{ jour: string; nbFiches: number } | null>(null);
  const [urgentModalOpen, setUrgentModalOpen] = useState(false);
  // motifs passés des fiches renvoyées, et renvoi en cours (une fiche ou toutes les non faites d'une équipe)
  const [historique, setHistorique] = useState<Map<string, ClotureArchivee[]>>(new Map());
  // fiche seule : le superviseur peut aussi corriger sa zone et son DIS
  const [renvoi, setRenvoi] = useState<{
    cle: string;
    ids: string[];
    equipe: string;
    date: string;
    fiche?: ProgrammeOT;
    nouvelleZone?: string;
    nouveauDis?: string;
  } | null>(null);
  const peutRenvoyer = user.role === 'admin' || user.role === 'superviseur' || user.role === 'directeur';
  const peutContact = peutAjouterContact(user.role);
  const peutZoneDis = peutModifierZoneDis(user.role);
  // non faites encore à renvoyer (N derniers jours, Paramètres) : en bas du suivi, sans changer de jour
  const [nonFaites, setNonFaites] = useState<ProgrammeOT[]>([]);
  // filtre du suivi et équipes repliées (mémorisées sur cet appareil)
  const [filtreSuivi, setFiltreSuivi] = useState<'tout' | 'a_faire' | 'fait' | 'non_fait'>('tout');
  const [fermees, setFermees] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('gss.distribution.fermees') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const changerFermees = (n: Set<string>) => {
    setFermees(n);
    try {
      localStorage.setItem('gss.distribution.fermees', JSON.stringify([...n]));
    } catch {
      /* stockage indisponible */
    }
  };
  const basculerEquipe = (cle: string) => {
    const n = new Set(fermees);
    if (n.has(cle)) n.delete(cle);
    else n.add(cle);
    changerFermees(n);
  };
  // recherche FGP / compte client / nom dans tout le programme
  const [rq, setRq] = useState('');
  const [resultatsBruts, setResultats] = useState<ProgrammeOT[] | null>(null);
  const resultats = rq.trim().length >= 2 ? resultatsBruts : null;
  const [version, setVersion] = useState(0);
  const refreshRef = useRef<() => void>(() => undefined);
  /** Recharge tout de suite (en plus du temps réel) après une action */
  const rafraichir = () => refreshRef.current();
  /** Mise à jour immédiate à l'écran (avant la réponse de la base) ; null retire la fiche */
  const modifierLocal = (ids: string[], f: (o: ProgrammeOT) => ProgrammeOT | null) => {
    const maj = (l: ProgrammeOT[]) => l.flatMap((o) => (ids.includes(o.id) ? (f(o) ?? []) : [o]));
    setHist(maj);
    setOuvertes(maj);
    setNonFaites(maj);
  };

  // Contrôle de 22 h : rattrape un contrôle manqué (tâche automatique arrêtée), puis l'affiche
  useEffect(() => {
    let alive = true;
    rattraperControles()
      .then(() => fetchDernierControle())
      .then((c) => alive && setControle(c));
    return () => {
      alive = false;
    };
  }, []);

  // Temps réel : tout changement (cas urgent, suppression, réaffectation, clôture d'un chef…)
  // recharge le suivi ; on recharge aussi en revenant sur l'onglet et après chaque action ici
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      Promise.all([
        fetchProgramme({ from: histDate, to: histDate }),
        fetchFichesOuvertes(),
        fetchNonFaitesARenvoyer(addDays(todayISO(), -REGLAGES_PROGRAMME.joursNonFaites)),
      ]).then(
        ([rows, ouv, nf]) => {
          if (!alive) return;
          setHist(rows.filter(ficheOk));
          setOuvertes(ouv.filter(ficheOk));
          setNonFaites(nf.filter(ficheOk));
          setHistError('');
          setVersion((v) => v + 1);
          fetchHistoriqueClotures([...rows, ...ouv, ...nf].filter(ficheOk).map((o) => o.id)).then((h) => alive && setHistorique(h));
        },
        (e) => alive && setHistError(errMsg(e)),
      );
    refreshRef.current = refresh;
    refresh();
    const unsub = subscribeProgramme('distribution', refresh);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [histDate, ficheOk]);

  // recherche (300 ms après la frappe), relancée à chaque rechargement pour garder statut / motif à jour
  useEffect(() => {
    const t = rq.trim();
    if (t.length < 2) return;
    let alive = true;
    const id = setTimeout(
      () =>
        rechercherProgramme(t).then(
          (r) => alive && setResultats(r.filter(ficheOk)),
          (e) => alive && showToast(errMsg(e), 'error'),
        ),
      300,
    );
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rq, version]);

  const histGroups = useMemo(() => {
    const m = new Map<string, ProgrammeOT[]>();
    hist.forEach((o) => m.set(o.equipe, [...(m.get(o.equipe) ?? []), o]));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [hist]);
  const nonFaitesGroups = useMemo(() => {
    const m = new Map<string, ProgrammeOT[]>();
    nonFaites.forEach((o) => m.set(o.equipe, [...(m.get(o.equipe) ?? []), o]));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [nonFaites]);
  // fiches en cours, épinglées : par équipe, les urgentes et en retard d'abord, puis par échéance
  const ouvertesIds = useMemo(() => new Set(ouvertes.map((o) => o.id)), [ouvertes]);
  const nonFaitesIds = useMemo(() => new Set(nonFaites.map((o) => o.id)), [nonFaites]);
  const nbRetard = useMemo(() => ouvertes.filter((o) => delaiOT(o).etat === 'retard').length, [ouvertes]);
  const ouvertesGroups = useMemo(() => {
    const rang = (o: ProgrammeOT) => {
      const d = delaiOT(o);
      return o.isUrgent ? 0 : d.etat === 'retard' ? 1 : d.prioritaire ? 2 : 3;
    };
    const m = new Map<string, ProgrammeOT[]>();
    ouvertes.forEach((o) => m.set(o.equipe, [...(m.get(o.equipe) ?? []), o]));
    return [...m.entries()]
      .map(([e, l]) => [e, [...l].sort((a, b) => rang(a) - rang(b) || delaiOT(a).echeance.localeCompare(delaiOT(b).echeance))] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [ouvertes]);
  // le jour choisi : seulement ce qui n'est ni épinglé en haut (en cours) ni en bas (non faites à renvoyer)
  const faitesDuJour = useMemo(() => hist.filter((o) => !ouvertesIds.has(o.id) && !nonFaitesIds.has(o.id)), [hist, ouvertesIds, nonFaitesIds]);

  const pen = (n: number, motif: 'retardee' | 'reaffectee' = 'retardee') =>
    n ? ` · ${n} pénalité${n > 1 ? 's' : ''} (${fmtPts(n * POINTS.penalites[motif])} pt)` : '';
  const doReassign = async (o: ProgrammeOT, equipe: string) => {
    try {
      modifierLocal([o.id], (x) => ({ ...x, equipe }));
      const n = await reassign([o.id], equipe, { par: user });
      showToast(`${ligneLabel(o)} envoyé à ${equipe}${pen(n, 'reaffectee')}`, 'success');
      rafraichir();
    } catch (err) {
      rafraichir();
      showToast(errMsg(err), 'error');
    }
  };
  // toutes les fiches en retard d'une équipe d'un coup
  const toutReaffecter = async (list: ProgrammeOT[], equipe: string) => {
    try {
      modifierLocal(
        list.map((o) => o.id),
        (x) => ({ ...x, equipe }),
      );
      const n = await reassign(list.map((o) => o.id), equipe, { par: user });
      rafraichir();
      showToast(`${list.length} fiche${list.length > 1 ? 's' : ''} envoyée${list.length > 1 ? 's' : ''} à ${equipe}${pen(n, 'reaffectee')}`, 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };
  const toutRetarder = async (list: ProgrammeOT[]) => {
    try {
      const n = await retarder(list.map((o) => o.id), retardDate, { par: user, penaliser });
      setRetardId(null);
      rafraichir();
      showToast(`${list.length} fiche${list.length > 1 ? 's' : ''} reportée${list.length > 1 ? 's' : ''} au ${frDate(retardDate)}${pen(n)}`, 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };
  const peutSignaler = peutSignalerFauxOk(user.role);
  const doFauxOk = async (o: ProgrammeOT, motif: MotifFauxOk, note: string) => {
    try {
      await signalerFauxOk(o.id, user, motif, note);
      rafraichir();
      showToast(`${ligneLabel(o)} : faux OK (${libelleFauxOk(motif, note)}) — ${fmtPts(POINTS.penalites.faux_ok)} pt pour ${o.equipe}, fiche rouverte`, 'warning');
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };
  const doRetarder = async (o: ProgrammeOT) => {
    try {
      const n = await retarder([o.id], retardDate, { par: user, penaliser });
      setRetardId(null);
      rafraichir();
      showToast(`${ligneLabel(o)} reporté au ${frDate(retardDate)}${pen(n)}`, 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  /** Contact ajouté après la distribution : sur la ligne, donc sur toutes ses fiches */
  const doAjouterContact = async (o: ProgrammeOT, tel: string) => {
    try {
      const telephones = await ajouterContact(o.fgp, tel);
      const maj = (l: ProgrammeOT[]) => l.map((x) => (x.fgp === o.fgp ? { ...x, telephones } : x));
      setHist(maj);
      setOuvertes(maj);
      setNonFaites(maj);
      showToast(`${ligneLabel(o)} : contact ${tel} ajouté — le chef le voit sur sa fiche`, 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
      throw err;
    }
  };

  /** Renvoyer des fiches « non faites » (motif passé gardé) */
  const ouvrirRenvoi = (cle: string, ids: string[], equipe: string, fiche?: ProgrammeOT) =>
    setRenvoi(
      renvoi?.cle === cle
        ? null
        : {
            cle,
            ids,
            equipe,
            date: estSoir() ? jourOuvreSuivant(todayISO()) : todayISO(),
            fiche,
            nouvelleZone: fiche?.zone ?? '',
            nouveauDis: fiche?.dis ?? '',
          },
    );
  /** Zone / DIS changés par le superviseur sur une fiche : enregistrés sur la ligne avant l'envoi */
  const appliquerZoneDis = async (fiche: ProgrammeOT | undefined, zone?: string, dis?: string) => {
    if (!fiche?.fgp || !peutZoneDis) return '';
    const z = (zone ?? '').replace(/\s+/g, '').toUpperCase();
    const d = (dis ?? '').replace(/\s+/g, '').toUpperCase();
    const nz = z && z !== fiche.zone.toUpperCase() ? z : '';
    const nd = d && d !== fiche.dis.toUpperCase() ? d : '';
    if (!nz && !nd) return '';
    await modifierZoneDis(fiche.fgp, { zone: nz, dis: nd });
    return ` · ${[nz && `zone ${nz}`, nd && `DIS ${nd}`].filter(Boolean).join(', ')}`;
  };
  /** Nouveau DIS saisi : la zone suit (6 premiers caractères) et l'équipe de cette zone est proposée */
  const changerDisRenvoi = (dis: string) => {
    if (!renvoi) return;
    const z = zoneDuDis(dis);
    const eq = z ? zoneEquipe[z] : undefined;
    setRenvoi({ ...renvoi, nouveauDis: dis, ...(z ? { nouvelleZone: z } : {}), ...(eq && equipeNames.includes(eq) ? { equipe: eq } : {}) });
  };
  const changerZoneRenvoi = (zone: string) => {
    if (!renvoi) return;
    const eq = zoneEquipe[zone.trim().toUpperCase()];
    setRenvoi({ ...renvoi, nouvelleZone: zone, ...(eq && equipeNames.includes(eq) ? { equipe: eq } : {}) });
  };
  const doRenvoyer = async () => {
    if (!renvoi) return;
    try {
      const zd = await appliquerZoneDis(renvoi.fiche, renvoi.nouvelleZone, renvoi.nouveauDis);
      const n = await redistribuer(renvoi.ids, renvoi.equipe, renvoi.date, user);
      showToast(
        `${n} fiche${n > 1 ? 's' : ''} renvoyée${n > 1 ? 's' : ''} à ${renvoi.equipe} pour le ${jourCourt(renvoi.date)}${zd} — motif${n > 1 ? 's' : ''} précédent${n > 1 ? 's' : ''} gardé${n > 1 ? 's' : ''}`,
        'success',
      );
      setRenvoi(null);
      rafraichir();
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };
  const panneauRenvoi = (cle: string) =>
    renvoi?.cle === cle && (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2">
        <span className="text-xs font-semibold text-blue-900">Renvoyer {renvoi.ids.length > 1 ? `les ${renvoi.ids.length} fiches` : ''} à</span>
        <Select aria-label="Équipe du renvoi" className="!py-1 !text-xs" value={renvoi.equipe} onChange={(e) => setRenvoi({ ...renvoi, equipe: e.target.value })}>
          {!equipeNames.includes(renvoi.equipe) && <option value={renvoi.equipe}>{renvoi.equipe || '— Équipe —'}</option>}
          {equipeNames.map((nm) => (
            <option key={nm} value={nm}>
              {nm}
            </option>
          ))}
        </Select>
        <span className="text-xs text-blue-900">pour</span>
        {[todayISO(), jourOuvreSuivant(todayISO())].map((d, k) => (
          <button
            key={d}
            type="button"
            onClick={() => setRenvoi({ ...renvoi, date: d })}
            className={`px-2 py-1 rounded-md text-xs font-semibold border ${renvoi.date === d ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
          >
            {k === 0 ? 'Aujourd’hui' : `Demain · ${jourCourt(d)}`}
          </button>
        ))}
        <input
          type="date"
          aria-label="Date du renvoi"
          min={todayISO()}
          value={renvoi.date}
          onChange={(e) => e.target.value && setRenvoi({ ...renvoi, date: e.target.value })}
          className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white"
        />
        {renvoi.fiche && peutZoneDis && (
          <span className="basis-full flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-blue-900">Nouvelle zone</span>
            <input
              aria-label="Nouvelle zone"
              value={renvoi.nouvelleZone ?? ''}
              onChange={(e) => changerZoneRenvoi(e.target.value)}
              placeholder="CA1Z04"
              className="w-24 border border-slate-200 rounded-md px-2 py-1 text-xs bg-white font-mono uppercase"
            />
            <span className="text-xs font-semibold text-blue-900">nouveau DIS</span>
            <input
              aria-label="Nouveau DIS"
              value={renvoi.nouveauDis ?? ''}
              onChange={(e) => changerDisRenvoi(e.target.value)}
              placeholder="CA1Z042611/1-4"
              className="w-40 border border-slate-200 rounded-md px-2 py-1 text-xs bg-white font-mono uppercase"
            />
          </span>
        )}
        <Button size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={doRenvoyer} disabled={!renvoi.equipe}>
          Renvoyer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRenvoi(null)}>
          Annuler
        </Button>
        <p className="basis-full text-[11px] text-blue-800">
          La fiche redevient « à faire » avec une nouvelle échéance ; le motif « non fait » reste dans son historique.
          {renvoi.fiche && peutZoneDis && ' Zone et DIS changés : enregistrés sur la ligne (toutes ses fiches).'}
        </p>
      </div>
    );

  /** Une fiche du suivi avec ses actions (réaffecter, retarder, retirer) */
  const ficheSuivi = (o: ProgrammeOT, showDate = false) => {
    const d = delaiOT(o);
    return (
    <div key={o.id} className={`flex items-start gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 ${o.isUrgent ? 'bg-orange-50/25' : ''}`}>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex">
          <RowCells o={o} prioritaire={o.statut === 'a_faire' && d.prioritaire} isUrgent={o.isUrgent} />
        </div>
        {o.statut === 'a_faire' && o.isUrgent && o.motif && (
          <p className="text-[11px] font-semibold text-orange-800 flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-600 flex-shrink-0" />
            Urgence : {o.motif}
          </p>
        )}
        {(o.statut === 'a_faire' || o.nbPenalites > 0 || showDate) && (
          <p className="text-[11px] text-slate-500">
            {showDate && <>Prévue le {jourCourt(o.dateProgramme)} · </>}
            {o.statut === 'a_faire' && <>échéance {jourCourt(d.echeance)} 22 h</>}
            {o.statut === 'a_faire' && o.nbPenalites > 0 && ' · '}
            {o.nbPenalites > 0 && (
              <b className="text-red-700">
                non traitée · {o.nbPenalites} pénalité{o.nbPenalites > 1 ? 's' : ''} pour {o.equipe}
              </b>
            )}
          </p>
        )}
        {o.fgp && peutContact && (
          <div className="self-start">
            <AjoutContact compact onAjouter={(tel) => doAjouterContact(o, tel)} />
          </div>
        )}
        {o.statut !== 'a_faire' && <ClotureResume ot={o} />}
        <HistoriqueMotifs liste={historique.get(o.id)} />
        {o.statut === 'non_fait' && peutRenvoyer && renvoi?.cle !== o.id && (
          <button
            type="button"
            onClick={() => ouvrirRenvoi(o.id, [o.id], o.equipe, o)}
            className="self-start inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded-md px-1.5 py-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Renvoyer pour refaire
          </button>
        )}
        {panneauRenvoi(o.id)}
        {o.statut === 'fait' && peutSignaler && <FauxOkButton onConfirm={(motif, note) => doFauxOk(o, motif, note)} />}
        {retardId === o.id && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              aria-label="Nouvelle date"
              min={todayISO()}
              value={retardDate}
              onChange={(e) => setRetardDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
            />
            <Button size="sm" onClick={() => doRetarder(o)} disabled={!retardDate}>
              Reporter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRetardId(null)}>
              Annuler
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${o.statut === 'a_faire' && o.nbPenalites > 0 ? 'bg-red-50 text-red-700 border-red-200' : STATUT_OT[o.statut].cls}`}>
          {o.statut === 'a_faire' && o.nbPenalites > 0 ? 'En cours' : STATUT_OT[o.statut].label}
        </span>
        {o.statut === 'a_faire' && (
          <div className="flex items-center gap-1">
            <button
              aria-label={o.isUrgent ? 'Retirer le statut urgent' : 'Passer en cas urgent'}
              title={o.isUrgent ? 'Cas urgent activé : cliquer pour désactiver' : 'Marquer comme cas urgent'}
              onClick={async () => {
                try {
                  modifierLocal([o.id], (x) => ({ ...x, isUrgent: !o.isUrgent }));
                  await marquerUrgent(o.id, !o.isUrgent);
                  rafraichir();
                  showToast(
                    `${ligneLabel(o)} : ${!o.isUrgent ? 'marqué en cas urgent 🔥' : 'statut urgent retiré'}`,
                    !o.isUrgent ? 'warning' : 'info',
                  );
                } catch (err) {
                  rafraichir();
                  showToast(errMsg(err), 'error');
                }
              }}
              className={`p-1.5 rounded-md transition-all ${
                o.isUrgent
                  ? 'bg-orange-600 text-white shadow-sm ring-2 ring-orange-300'
                  : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
            </button>
            <Select aria-label="Réaffecter" className="!py-1 !text-xs" value={o.equipe} onChange={(e) => doReassign(o, e.target.value)}>
              {!equipeNames.includes(o.equipe) && <option value={o.equipe}>{o.equipe || '—'}</option>}
              {equipeNames.map((nm) => (
                <option key={nm} value={nm}>
                  {nm}
                </option>
              ))}
            </Select>
            <button
              aria-label="Retarder"
              title="Reporter à un autre jour"
              onClick={() => {
                setRetardDate(addDays(todayISO(), 1));
                setRetardId(retardId === o.id ? null : o.id);
              }}
              className={`p-1.5 rounded-md ${retardId === o.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-700 hover:bg-blue-50'}`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
            </button>
            <button
              aria-label="Retirer du programme"
              title={armed === o.id ? 'Cliquer encore pour confirmer' : 'Retirer du programme'}
              onClick={async () => {
                if (armed !== o.id) return setArmed(o.id);
                try {
                  modifierLocal([o.id], () => null);
                  await deleteOts([o.id]);
                  setArmed(null);
                  rafraichir();
                  showToast('Fiche retirée du programme', 'info');
                } catch (err) {
                  rafraichir();
                  showToast(errMsg(err), 'error');
                }
              }}
              className={`p-1.5 rounded-md ${armed === o.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-red-700 hover:bg-red-50'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 md:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Raccordement · fiches OT Mauritel</p>
          <h1 className="text-2xl font-black text-slate-900">Distribuer le programme</h1>
          <p className="text-sm text-slate-500 mt-1">
            Importez les PDF « OT Dérangement » et « OT Réseau ». Chaque fiche part à l’équipe de sa zone avec le client, ses numéros, le DIS et l’ONT.
          </p>
        </div>
        <Button
          variant="danger"
          size="md"
          icon={<Flame className="w-4 h-4 text-yellow-300 animate-pulse" />}
          onClick={() => setUrgentModalOpen(true)}
          className="shadow-md shadow-orange-600/20 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold"
        >
          Affecter cas urgent
        </Button>
      </div>

      {/* Zone d'import */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="prog-date" className="block text-xs font-semibold text-slate-500 mb-1.5">
              Programme du
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { d: todayISO(), label: 'Aujourd’hui' },
                { d: demain, label: `Demain · ${jourCourt(demain)}` },
              ].map((x) => (
                <button
                  key={x.d}
                  type="button"
                  onClick={() => setDateProgramme(x.d)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                    dateProgramme === x.d ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {x.label}
                </button>
              ))}
              <input
                id="prog-date"
                type="date"
                value={dateProgramme}
                min={todayISO()}
                onChange={(e) => e.target.value && setDateProgramme(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setItems([])}>
              Tout effacer
            </Button>
          )}
        </div>
        {dateProgramme > todayISO() ? (
          <p className="text-xs rounded-lg px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-start gap-2">
            <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <b>Programme du {jourCourt(dateProgramme)}</b> distribué d’avance : les chefs le reçoivent maintenant dans leur programme, avec ses échéances. Rien ne
              compte ce soir (pas de pénalité au contrôle de 22 h) : les échéances partent du {jourCourt(dateProgramme)} (dérangement ce jour-là avant 22 h,
              installation le jour ouvré suivant, prioritaire le jour même).
            </span>
          </p>
        ) : (
          soir &&
          dateProgramme === todayISO() && (
            <p className="text-xs rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Distribution du soir <b>pour aujourd’hui</b> : les dérangements et les fiches prioritaires sont à faire avant 22 h ce soir. Pour le programme de
                demain, choisissez « Demain ».
              </span>
            </p>
          )
        )}
        <label
          htmlFor="prog-files"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            readFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          }`}
        >
          <FileUp className="w-8 h-8 text-blue-600" />
          <span className="font-semibold text-slate-800">{reading ? 'Lecture des fiches…' : 'Choisir ou déposer les PDF'}</span>
          <span className="text-xs text-slate-500">Plusieurs fichiers possibles : dérangements et installations ensemble</span>
          <input
            ref={fileRef}
            id="prog-files"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            disabled={reading}
            onChange={(e) => e.target.files && readFiles(e.target.files)}
          />
        </label>
      </Card>

      {/* Aperçu par équipe */}
      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-900 text-white font-semibold">{items.length} fiches lues</span>
            <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-800 border border-orange-200 font-semibold">
              {items.filter((i) => i.nature === 'derangement').length} dérangements
            </span>
            <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
              {items.filter((i) => i.nature === 'installation').length} installations
            </span>
            {items.some((i) => i.deja) && (
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                {items.filter((i) => i.deja).length} déjà distribuées (ignorées)
              </span>
            )}
          </div>

          <ParZone items={items} equipeNames={equipeNames} zoneEquipe={zoneEquipe} colorOf={colorOf} onChoose={choisirZone} onRemember={retenirZone} />

          {groups.map(([equipe, list]) => {
            const active = list.filter((i) => i.include && !i.deja);
            return (
              <Card key={equipe || 'none'} className={equipe ? '' : 'border-amber-300'}>
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: equipe ? colorOf(equipe) : '#F59E0B' }} />
                    <span className="font-bold text-slate-800">{equipe || 'Sans équipe — zone non attribuée'}</span>
                    <span className="text-xs text-slate-500">
                      {active.filter((i) => i.nature === 'derangement').length} dér. · {active.filter((i) => i.nature === 'installation').length} inst.
                    </span>
                  </div>
                  {equipe && active.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<MessageCircle className="w-4 h-4" />}
                      onClick={() => shareWhatsApp(programmeWhatsApp(equipe, dateProgramme, active), showToast)}
                    >
                      Copier pour WhatsApp
                    </Button>
                  )}
                </div>
                {list.map((i) => (
                  <div key={i.key} className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 ${!i.include || i.deja ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      aria-label={`Inclure FGP ${i.fgp}`}
                      checked={i.include && !i.deja}
                      disabled={!!i.deja}
                      onChange={(e) => update(i.key, { include: e.target.checked })}
                    />
                    <div className="min-w-0 flex-1">
                      <RowCells o={i} prioritaire={!!i.dateRecu && estPrioritaire(i.dateRecu, i.nature, jourRemise(null, dateProgramme))} />
                      <MotifsPrecedents liste={i.precedents} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {i.deja ? (
                        <span className="text-[11px] text-slate-500">
                          Déjà envoyé à {i.deja.equipe || '?'} le {frDate(i.deja.date)}
                        </span>
                      ) : (
                        <Select aria-label="Équipe" className="!py-1 !text-xs" value={i.equipe} onChange={(e) => update(i.key, { equipe: e.target.value })}>
                          <option value="">— Équipe —</option>
                          {equipeNames.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      )}
                      {i.renvoi && (
                        <span
                          className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-right"
                          title="Fiche déjà rendue « non faite » : elle sera renvoyée, son motif passé reste dans l’historique"
                        >
                          Déjà non fait{i.renvoi.traiteLe ? ` le ${jourCourt(i.renvoi.traiteLe.slice(0, 10))}` : ''}
                          {i.renvoi.equipe ? ` (${i.renvoi.equipe})` : ''}
                          {i.renvoi.motif ? ` : ${i.renvoi.motif}` : ''} — renvoyée
                        </span>
                      )}
                      {i.existante && !i.deja && (
                        <span className="text-[11px] text-blue-700" title="Une situation ouverte de ce FGP existe déjà (import Excel) : l’OT la complète au lieu d’en créer une nouvelle">
                          Complète la situation existante{i.existante.equipe ? ` (${i.existante.equipe})` : ''}
                        </span>
                      )}
                      {i.warnings.length > 0 && !i.deja && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title={i.warnings.join(', ')}>
                          <AlertTriangle className="w-3 h-3" /> {i.warnings[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}

          <div className="sticky bottom-16 md:bottom-4 z-10 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {missingTeam.length > 0 ? (
                <span className="text-amber-700 font-semibold">
                  {missingTeam.length} fiche{missingTeam.length > 1 ? 's' : ''} sans équipe : choisissez-la avant d’envoyer.
                </span>
              ) : (
                <>
                  <b>{toSend.length}</b> fiche{toSend.length > 1 ? 's' : ''} pour le <b>{frDate(dateProgramme)}</b> · chaque chef sera notifié
                </>
              )}
            </p>
            <Button icon={<Send className="w-4 h-4" />} disabled={!toSend.length || sending || missingTeam.length > 0} onClick={send}>
              {sending ? 'Envoi…' : `Distribuer ${toSend.length} fiche${toSend.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Suivi du programme distribué */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-slate-900">Suivi du programme</h2>
            <Button
              variant="outline"
              size="sm"
              icon={<Flame className="w-3.5 h-3.5 text-orange-600 animate-pulse" />}
              onClick={() => setUrgentModalOpen(true)}
              className="text-orange-700 border-orange-300 hover:bg-orange-50 font-bold"
            >
              + Cas urgent
            </Button>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <CalendarDays className="w-4 h-4" />
            <input
              id="hist-date"
              type="date"
              value={histDate}
              onChange={(e) => setHistDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-500"
            />
          </label>
        </div>
        {/* Recherche : FGP, compte client ou nom → statut et motif */}
        <Card className="p-3 space-y-2">
          <label className="relative block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={rq}
              onChange={(e) => setRq(e.target.value)}
              placeholder="Rechercher par FGP, compte client ou nom du client…"
              aria-label="Rechercher une fiche"
              className="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
            />
            {rq && (
              <button
                type="button"
                onClick={() => setRq('')}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </label>
          {resultats && resultats.length === 0 && <p className="text-xs text-slate-400 px-1">Aucune fiche trouvée.</p>}
          {resultats && resultats.length > 0 && (
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {resultats.map((o) => (
                <div key={o.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono font-black text-slate-900">{ligneLabel(o)}</span>
                  <span className="font-mono text-xs text-slate-500">{o.clientCode || '—'}</span>
                  <span className="text-slate-700 truncate max-w-[14rem]">{o.clientNom || '—'}</span>
                  <span className="text-xs text-slate-500">
                    {o.equipe || 'Sans équipe'} · {jourCourt(o.dateProgramme)}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUT_OT[o.statut].cls}`}>{STATUT_OT[o.statut].label}</span>
                  <span className="basis-full sm:basis-auto sm:flex-1 text-xs text-slate-700 min-w-0">
                    <span className="text-slate-400">Motif : </span>
                    {o.motif || <span className="text-slate-300">—</span>}
                  </span>
                  {o.dateProgramme !== histDate && (
                    <button type="button" onClick={() => setHistDate(o.dateProgramme)} className="text-[11px] font-semibold text-blue-700 hover:underline">
                      Voir le jour
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Filtre par bloc + replier / déplier les équipes */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-0.5 overflow-x-auto max-w-full">
            {(
              [
                ['tout', 'Tout', ouvertes.length + faitesDuJour.length + nonFaites.length],
                ['a_faire', 'En cours', ouvertes.length],
                ['fait', `Faites · ${jourCourt(histDate)}`, faitesDuJour.length],
                ['non_fait', 'Non faites', nonFaites.length],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltreSuivi(id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${filtreSuivi === id ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                {label} <span className="tabular-nums text-slate-400">{n}</span>
              </button>
            ))}
          </div>
          {(histGroups.length > 0 || ouvertesGroups.length > 0 || nonFaitesGroups.length > 0) && (
            <span className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  changerFermees(
                    new Set([
                      ...histGroups.map(([e]) => e || 'none'),
                      ...ouvertesGroups.map(([e]) => `ec:${e}`),
                      ...nonFaitesGroups.map(([e]) => `nf:${e}`),
                    ]),
                  )
                }
              >
                Tout cacher
              </Button>
              <Button variant="ghost" size="sm" onClick={() => changerFermees(new Set())}>
                Tout afficher
              </Button>
            </span>
          )}
        </div>

        <Card className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
          <span className="flex items-start gap-1.5">
            <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>
              Échéance à <b>22 h</b> : dérangement le jour de la remise, installation le lendemain, fiche <b>prioritaire</b> (déjà hors délai) le jour même.
              Non traitée à l’échéance : <b>{fmtPts(POINTS.penalites.non_traitee)} {motPoint(POINTS.penalites.non_traitee)}</b> par contrôle de 22 h, elle reste en cours. Réaffecter avant l’échéance ne pénalise pas
              {controle ? ` · dernier contrôle ${jourCourt(controle.jour)} (${controle.nbFiches} fiche${controle.nbFiches > 1 ? 's' : ''})` : ''}.
            </span>
          </span>
          <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <input type="checkbox" checked={penaliser} onChange={(e) => setPenaliser(e.target.checked)} />
            Retarder une fiche ouverte coûte {ptsTexte(POINTS.penalites.retardee)} à son équipe
          </label>
        </Card>

        {histError && <Card className="p-4 text-sm text-red-700">{histError}</Card>}

        {/* 1. En haut, épinglées : toutes les fiches en cours, quel que soit le jour choisi */}
        {(filtreSuivi === 'tout' || filtreSuivi === 'a_faire') && ouvertesGroups.length > 0 && (
          <Card className="border-sky-300">
            <div className="px-4 py-3 border-b border-sky-100 bg-sky-50/70">
              <p className="font-bold text-sky-900 flex items-center gap-1.5">
                <Pin className="w-4 h-4 text-sky-700" />
                {ouvertes.length} fiche{ouvertes.length > 1 ? 's' : ''} en cours
                {nbRetard > 0 && (
                  <span className="text-red-700">
                    {' '}
                    · {nbRetard} en retard
                  </span>
                )}
              </p>
              <p className="text-xs text-sky-800/80">
                Épinglées ici quel que soit le jour affiché : urgentes et en retard d’abord. Réaffectez-les, retardez-les ou laissez-les à l’équipe (
                {fmtPts(POINTS.penalites.non_traitee)} {motPoint(POINTS.penalites.non_traitee)} à chaque contrôle de 22 h après l’échéance).
              </p>
            </div>
            {ouvertesGroups.map(([equipe, list]) => {
              const cle = `ec:${equipe}`;
              const ouvert = !fermees.has(cle);
              const retard = list.filter((o) => delaiOT(o).etat === 'retard').length;
              return (
                <div key={cle}>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2 text-sm">
                    <button type="button" onClick={() => basculerEquipe(cle)} aria-expanded={ouvert} className="flex items-center gap-2 text-left">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(equipe) }} />
                      <b className="text-slate-800">{equipe || 'Sans équipe'}</b>
                      <span className="text-xs text-slate-500">
                        {list.length} en cours
                        {retard > 0 && <b className="text-red-700"> · {retard} en retard</b>}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition ${ouvert ? 'rotate-180' : ''}`} />
                    </button>
                    {list.length > 1 && (
                      <span className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Select
                          aria-label={`Tout réaffecter (${equipe})`}
                          className="!py-1 !text-xs"
                          value=""
                          onChange={(e) => e.target.value && toutReaffecter(list, e.target.value)}
                        >
                          <option value="">Tout réaffecter à…</option>
                          {equipeNames
                            .filter((nm) => nm !== equipe)
                            .map((nm) => (
                              <option key={nm} value={nm}>
                                {nm}
                              </option>
                            ))}
                        </Select>
                        {retardId === `grp:${equipe}` ? (
                          <>
                            <input
                              type="date"
                              aria-label="Nouvelle date pour toutes"
                              min={todayISO()}
                              value={retardDate}
                              onChange={(e) => setRetardDate(e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                            />
                            <Button size="sm" onClick={() => toutRetarder(list)} disabled={!retardDate}>
                              Tout reporter
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<CalendarClock className="w-3.5 h-3.5" />}
                            onClick={() => {
                              setRetardDate(addDays(todayISO(), 1));
                              setRetardId(`grp:${equipe}`);
                            }}
                          >
                            Tout retarder
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Copy className="w-4 h-4" />}
                          onClick={() => shareWhatsApp(programmeWhatsApp(equipe, todayISO(), list), showToast)}
                        >
                          WhatsApp
                        </Button>
                      </span>
                    )}
                  </div>
                  {ouvert && list.map((o) => ficheSuivi(o, true))}
                </div>
              );
            })}
          </Card>
        )}

        {/* 2. Le jour choisi : fiches faites (et clôturées) de ce programme */}
        {(filtreSuivi === 'tout' || filtreSuivi === 'fait') && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 pt-1">
              Programme du {jourCourt(histDate)} — fiches traitées
            </p>
            {!histError && hist.length === 0 && (
              <Card className="py-8 text-center text-sm text-slate-400">Aucune fiche distribuée pour le {frDate(histDate)}.</Card>
            )}
            {histGroups.map(([equipe, list]) => {
              const n = (st: ProgrammeOT['statut']) => list.filter((o) => o.statut === st).length;
              const pct = Math.round((n('fait') / list.length) * 100);
              const visibles = list.filter((o) => !ouvertesIds.has(o.id) && !nonFaitesIds.has(o.id));
              const cle = equipe || 'none';
              const ouvert = !fermees.has(cle);
              return (
                <Card key={cle}>
                  <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => basculerEquipe(cle)}
                      aria-expanded={ouvert}
                      className="flex items-center gap-2 flex-wrap text-left min-w-0"
                      title={ouvert ? 'Cacher le programme de l’équipe' : 'Afficher le programme de l’équipe'}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ background: colorOf(equipe) }} />
                      <span className="font-bold text-slate-800">{equipe || 'Sans équipe'}</span>
                      <span className="text-xs text-slate-500">
                        <b className="text-emerald-700">{n('fait')}</b>/{list.length} faites ({pct}%) · <b className="text-red-700">{n('non_fait')}</b> non faites ·{' '}
                        <b className="text-sky-700">{n('a_faire')}</b> en cours
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition ${ouvert ? 'rotate-180' : ''}`} />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Copy className="w-4 h-4" />}
                      onClick={() => shareWhatsApp(programmeWhatsApp(equipe, histDate, list.filter((o) => o.statut === 'a_faire')), showToast)}
                    >
                      WhatsApp (à faire)
                    </Button>
                  </div>
                  <div className="h-1 bg-slate-100">
                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  {ouvert && visibles.map((o) => ficheSuivi(o))}
                  {ouvert && visibles.length < list.length && (
                    <p className="px-4 py-2 text-[11px] text-slate-400">
                      {list.length - visibles.length} fiche{list.length - visibles.length > 1 ? 's' : ''} en cours ou non faite
                      {list.length - visibles.length > 1 ? 's' : ''} : épinglée{list.length - visibles.length > 1 ? 's' : ''} en haut / à renvoyer en bas.
                    </p>
                  )}
                </Card>
              );
            })}
          </>
        )}

        {/* 3. En bas : les non faites à renvoyer, sans changer le jour du programme */}
        {(filtreSuivi === 'tout' || filtreSuivi === 'non_fait') && nonFaites.length > 0 && (
          <Card className="border-amber-300">
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70">
              <p className="font-bold text-amber-900">
                {nonFaites.length} fiche{nonFaites.length > 1 ? 's' : ''} non faite{nonFaites.length > 1 ? 's' : ''} — à renvoyer
              </p>
              <p className="text-xs text-amber-800/80">
                Toutes les non faites des {REGLAGES_PROGRAMME.joursNonFaites} derniers jours, quel que soit le jour affiché. Renvoyez-les à une équipe (aujourd’hui
                par défaut{soir ? ', demain le soir' : ''}) : elles redeviennent « en cours », le motif passé reste dans l’historique.
              </p>
            </div>
            {nonFaitesGroups.map(([equipe, list]) => {
              const cle = `nf:${equipe}`;
              const ouvert = !fermees.has(cle);
              return (
                <div key={cle}>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2 text-sm">
                    <button type="button" onClick={() => basculerEquipe(cle)} aria-expanded={ouvert} className="flex items-center gap-2 text-left">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(equipe) }} />
                      <b className="text-slate-800">{equipe || 'Sans équipe'}</b>
                      <span className="text-xs text-slate-500">
                        {list.length} non faite{list.length > 1 ? 's' : ''}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition ${ouvert ? 'rotate-180' : ''}`} />
                    </button>
                    {peutRenvoyer && renvoi?.cle !== cle && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                        onClick={() =>
                          ouvrirRenvoi(
                            cle,
                            list.map((o) => o.id),
                            equipe,
                          )
                        }
                      >
                        Renvoyer les {list.length}
                      </Button>
                    )}
                  </div>
                  {renvoi?.cle === cle && <div className="px-4 py-2 border-b border-slate-100">{panneauRenvoi(cle)}</div>}
                  {ouvert && list.map((o) => ficheSuivi(o, true))}
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {urgentModalOpen && (
        <AffecterUrgentModal
          open={urgentModalOpen}
          onClose={() => setUrgentModalOpen(false)}
          equipeNames={equipeNames}
          zoneEquipe={zoneEquipe}
          user={user}
          peutModifierZoneDis={peutZoneDis}
          fichesActuelles={[...hist, ...ouvertes]}
          onSuccess={(msg) => {
            showToast(msg, 'success');
            rafraichir();
          }}
        />
      )}
    </div>
  );
}
