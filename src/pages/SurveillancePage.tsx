import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Download, Eye, FileText, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { usePerimetre } from '@/hooks/usePerimetre';
import { Button, Card, useToast } from '@/components/ui';
import {
  fetchPenalites,
  fetchReclamations,
  fetchSurveillance,
  rattraperControles,
  signalerFauxOk,
  subscribeProgramme,
  traiterReclamation,
  type ReclamationFauxOk,
  fetchHistoriquePeriode,
  fetchFichesParIds,
  fetchPhotosProgramme,
  reassign,
  redistribuer,
  type ClotureArchivee,
} from '@/lib/programmeService';
import { ProgrammeJourEquipes } from '@/components/programme/ProgrammeJourEquipes';
import { ReclamationsPanel } from '@/components/programme/Reclamation';
import { ETAT_DELAI, POINTS, delaiOT, doublonsCable, estPourPlusTard, fmtPts, fmtPtsSigne, jourCourt, jourOuvreSuivant } from '@/utils/points';
import { MOTIF_PENALITE, NATURE_CLASS, NATURE_LABEL, libelleFauxOk, ligneLabel, peutSignalerFauxOk, type MotifFauxOk } from '@/utils/programme';
import {
  NB_PERIODES,
  bilans,
  clePeriode,
  decaler,
  isoJour,
  libellePeriode,
  periode,
  periodesEvolution,
  programmeOuvert,
  somme,
  statsEquipes,
  type Bilan,
  type Granularite,
} from '@/utils/surveillance';
import { downloadWorkbookBuffer } from '@/utils/stats';
import { errMsg } from '@/utils';
import { Penalite, ProgrammeOT } from '@/types';

const GRANULARITES: { id: Granularite; label: string }[] = [
  { id: 'jour', label: 'Jour' },
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
];
type Mesure = 'points' | 'faites' | 'nonFaites';
const MESURES: { id: Mesure; label: string }[] = [
  { id: 'points', label: 'Points' },
  { id: 'faites', label: 'Faites' },
  { id: 'nonFaites', label: 'Non faites' },
];

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const couleurPoints = (n: number) => (n > 0 ? 'text-emerald-700' : n < 0 ? 'text-red-700' : 'text-slate-500');

function Kpi({ label, value, cls = 'text-slate-900', sub }: { label: string; value: string | number; cls?: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-3 sm:px-4 min-w-0">
      <p className="text-[11px] sm:text-xs text-slate-500 truncate">{label}</p>
      <p className={`text-xl sm:text-2xl font-black tabular-nums ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 truncate">{sub}</p>}
    </div>
  );
}

/**
 * Surveillance quotidienne des équipes (superviseur, admin, directeur) : programme en cours de
 * chaque équipe, fiches faites / non faites et points du jour, de la semaine ou du mois, et leur
 * évolution sur les dernières périodes.
 */
// ─── Filtre par type de fiche ────────────────────────────────────────────────
const INST_SANS_CST_ANS = '__inst';
const INST_TOUTES = '__inst_tout';
const TYPE_LABEL: Record<string, string> = {
  DRG: 'Dérangements (DRG)',
  [INST_SANS_CST_ANS]: 'Installations sauf CST / ANS',
  [INST_TOUTES]: 'Toutes les installations',
};
/** Type d'une fiche : CPL, TRL, CMI, CLS, RLR, CST, ANS, DRG */
const typeDe = (o: Pick<ProgrammeOT, 'typeOt' | 'nature'>) => (o.typeOt || (o.nature === 'derangement' ? 'DRG' : '')).trim().toUpperCase();
function typeOk(o: Pick<ProgrammeOT, 'typeOt' | 'nature'>, f: string): boolean {
  if (!f) return true;
  if (f === 'DRG') return o.nature === 'derangement';
  if (f === INST_TOUTES) return o.nature === 'installation';
  if (f === INST_SANS_CST_ANS) return o.nature === 'installation' && !['CST', 'ANS'].includes(typeDe(o));
  return o.nature === 'installation' && typeDe(o) === f;
}

export default function SurveillancePage() {
  // superviseur régional : seulement les équipes et fiches de sa ville
  const { equipes, ficheOk, equipeOk } = usePerimetre();
  const user = useAppStore((s) => s.user)!;
  const peutSignaler = peutSignalerFauxOk(user.role);
  const { showToast } = useToast();
  const aujourdhui = isoJour(new Date());
  const [g, setG] = useState<Granularite>('jour');
  // après le contrôle de 22 h, on prépare le programme du lendemain (fiches non traitées reportées)
  const demainOuvre = jourOuvreSuivant(aujourdhui);
  const [jour, setJour] = useState(() => (new Date().getUTCHours() >= 22 ? demainOuvre : aujourdhui));
  // filtres : équipe, zone, ville
  const [fEquipe, setFEquipe] = useState('');
  const [fZone, setFZone] = useState('');
  const [fVille, setFVille] = useState('');
  // type : DRG, une installation précise (CPL, TRL…), toutes les installations, ou toutes sauf CST / ANS
  const [fType, setFType] = useState('');
  const [mesure, setMesure] = useState<Mesure>('points');
  const [otsBruts, setOts] = useState<ProgrammeOT[]>([]);
  const [archives, setArchives] = useState<ClotureArchivee[]>([]);
  const [basesArchives, setBasesArchives] = useState<ProgrammeOT[]>([]);
  const [penalites, setPenalites] = useState<Penalite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [reclamations, setReclamations] = useState<ReclamationFauxOk[]>([]);
  const [version, setVersion] = useState(0); // recharger après une action

  const { debut, fin } = periode(jour, g);
  const cles = useMemo(() => periodesEvolution(jour, g), [jour, g]);
  // tableau d'évolution : la période choisie d'abord (visible sans faire défiler sur téléphone)
  const colonnes = useMemo(() => [...cles].reverse(), [cles]);
  // tout ce qu'il faut pour l'évolution : de la plus ancienne période à la fin de la période choisie
  const depuis = periode(cles[0], g).debut;
  // jour : en cours ou à venir (programme ouvert affiché) ; semaine / mois : contient aujourd'hui
  const enCours = g === 'jour' ? debut >= aujourdhui : debut <= aujourdhui && aujourdhui <= fin;
  const maxJour = g === 'jour' ? demainOuvre : aujourdhui;

  useEffect(() => {
    let vivant = true;
    const charger = () => {
      if (peutSignaler) fetchReclamations().then((r) => vivant && setReclamations(r), () => undefined);
      return Promise.all([fetchSurveillance(depuis, fin), fetchPenalites(depuis, fin), fetchHistoriquePeriode(depuis, fin)])
        .then(async ([o, p, h]) => {
          // fiches renvoyées puis refaites après la période : rechargées pour garder leur « non fait »
          const connues = new Set(o.map((x) => x.id));
          const manquantes = [...new Set(h.map((x) => x.situationId))].filter((id) => !connues.has(id));
          const autres = manquantes.length ? await fetchFichesParIds(manquantes) : [];
          return [o, p, h, autres] as const;
        })
        .then(
          ([o, p, h, autres]) =>
            vivant &&
            (setOts(o.filter(ficheOk)), setPenalites(p.filter((x) => equipeOk(x.equipe))), setArchives(h), setBasesArchives(autres.filter(ficheOk)), setError('')),
          (e) => vivant && setError(errMsg(e)),
        )
        .finally(() => vivant && setLoaded(true));
    };
    rattraperControles().finally(charger);
    const unsub = subscribeProgramme('surveillance', charger);
    return () => {
      vivant = false;
      unsub();
    };
  }, [depuis, fin, peutSignaler, version, ficheOk, equipeOk]);

  const fauxOk = async (o: ProgrammeOT, motif: MotifFauxOk, note: string) => {
    try {
      await signalerFauxOk(o.id, user, motif, note);
      showToast(`${ligneLabel(o)} : faux OK (${libelleFauxOk(motif, note)}) — ${fmtPts(POINTS.penalites.faux_ok)} pt pour ${o.equipe}, fiche rouverte`, 'warning');
      setVersion((v) => v + 1);
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };
  /** Fiches en cours (ou reportées après 22 h) confiées à une autre équipe */
  const reaffecter = async (ids: string[], equipe: string) => {
    try {
      const n = await reassign(ids, equipe, { par: user });
      showToast(`${n} fiche${n > 1 ? 's' : ''} réaffectée${n > 1 ? 's' : ''} à ${equipe}`, 'success');
      setVersion((v) => v + 1);
    } catch (e) {
      showToast(errMsg(e), 'error');
      throw e;
    }
  };
  /** Fiches « non faites » renvoyées (motif passé gardé) */
  const renvoyer = async (ids: string[], equipe: string, date: string) => {
    try {
      const n = await redistribuer(ids, equipe, date, user);
      showToast(`${n} fiche${n > 1 ? 's' : ''} renvoyée${n > 1 ? 's' : ''} à ${equipe} pour le ${jourCourt(date)} — motifs gardés`, 'success');
      setVersion((v) => v + 1);
    } catch (e) {
      showToast(errMsg(e), 'error');
      throw e;
    }
  };
  const traiter = async (r: ReclamationFauxOk, accepter: boolean, reponse: string) => {
    try {
      const res = await traiterReclamation(r.id, user, accepter, reponse);
      showToast(
        res === 'refusee'
          ? `${ligneLabel(r)} : réclamation refusée, faux OK maintenu`
          : `${ligneLabel(r)} : réclamation acceptée, faux OK annulé${res === 'acceptee_retablie' ? ' — la fiche redevient « Fait »' : ''}`,
        res === 'refusee' ? 'info' : 'success',
      );
      setVersion((v) => v + 1);
    } catch (e) {
      showToast(errMsg(e), 'error');
      throw e;
    }
  };

  // « non faites » puis renvoyées : elles comptent toujours comme non faites du jour où elles l'ont été
  const ots = useMemo(() => {
    const parId = new Map([...basesArchives, ...otsBruts].map((o) => [o.id, o]));
    const passees = archives
      .filter((h) => h.statut === 'non_ok')
      .flatMap((h) => {
        // la fiche telle qu'elle est aujourd'hui, avec le motif et le jour de ce « non fait »
        const base = parId.get(h.situationId);
        if (!base) return [];
        return {
          ...base,
          id: `h:${h.id}`,
          equipe: h.equipe,
          statut: 'non_fait' as const,
          motif: h.motif,
          traiteLe: h.traiteLe,
          isUrgent: false,
        };
      });
    const villeDe = (eq: string) => equipes.find((e) => e.name.toLowerCase() === eq.toLowerCase())?.ville ?? '';
    return ([...otsBruts, ...passees] as ProgrammeOT[]).filter(
      (o) =>
        (!fEquipe || o.equipe === fEquipe) &&
        (!fZone || (o.zone ?? '').trim() === fZone) &&
        (!fVille || villeDe(o.equipe) === fVille) &&
        typeOk(o, fType),
    );
  }, [otsBruts, archives, basesArchives, fEquipe, fZone, fVille, fType, equipes]);
  const typesConnus = useMemo(
    () => [...new Set(otsBruts.filter((o) => o.nature === 'installation').map(typeDe).filter(Boolean))].sort(),
    [otsBruts],
  );
  const zonesConnues = useMemo(() => [...new Set(otsBruts.map((o) => (o.zone ?? '').trim()).filter(Boolean))].sort(), [otsBruts]);
  const villes = useMemo(() => [...new Set(equipes.map((e) => e.ville).filter((v): v is NonNullable<typeof v> => !!v))].sort(), [equipes]);
  const penalitesFiltrees = useMemo(() => {
    const villeDe = (eq: string) => equipes.find((e) => e.name.toLowerCase() === eq.toLowerCase())?.ville ?? '';
    const zoneFiche = new Map(otsBruts.map((o) => [o.id, (o.zone ?? '').trim()]));
    const fiche = new Map(otsBruts.map((o) => [o.id, o]));
    return penalites.filter(
      (p) =>
        (!fEquipe || p.equipe === fEquipe) &&
        (!fVille || villeDe(p.equipe) === fVille) &&
        (!fZone || zoneFiche.get(p.situationId) === fZone) &&
        (!fType || (fiche.has(p.situationId) && typeOk(fiche.get(p.situationId)!, fType))),
    );
  }, [penalites, fEquipe, fZone, fVille, fType, equipes, otsBruts]);
  const parEquipe = useMemo(() => bilans(ots, penalitesFiltrees, g), [ots, penalitesFiltrees, g]);
  const ouvert = useMemo(() => programmeOuvert(ots), [ots]);
  const cle = clePeriode(debut, g);

  // équipes : celles de la base + celles qui apparaissent dans les données
  const noms = useMemo(() => {
    const s = new Set(equipes.map((e) => e.name));
    parEquipe.forEach((_, k) => s.add(k));
    ouvert.forEach((_, k) => s.add(k));
    return [...s];
  }, [equipes, parEquipe, ouvert]);
  const couleur = (n: string) => equipes.find((e) => e.name.toLowerCase() === n.toLowerCase())?.color ?? '#94A3B8';

  const lignes = useMemo(
    () =>
      noms
        .map((equipe) => ({ equipe, b: somme([parEquipe.get(equipe)?.get(cle)]), o: ouvert.get(equipe) }))
        .filter((l) => l.b.faites + l.b.nonFaites + l.b.penalites > 0 || (enCours && l.o))
        .sort((a, b) => b.b.points - a.b.points || b.b.faites - a.b.faites || a.equipe.localeCompare(b.equipe)),
    [noms, parEquipe, ouvert, cle, enCours],
  );
  const total = somme(lignes.map((l) => l.b));
  const totalOuvert = [...ouvert.values()].reduce(
    (a, o) => ({ aFaire: a.aFaire + o.aFaire, enRetard: a.enRetard + o.enRetard, demain: a.demain + o.demain }),
    { aFaire: 0, enRetard: 0, demain: 0 },
  );

  const valeur = (b: Bilan | undefined) => (!b ? 0 : mesure === 'points' ? b.points : mesure === 'faites' ? b.faites : b.nonFaites);
  const evolution = useMemo(
    () => noms.map((equipe) => ({ equipe, cellules: colonnes.map((k) => parEquipe.get(equipe)?.get(k)) })).filter((l) => l.cellules.some(Boolean)),
    [noms, colonnes, parEquipe],
  );

  /**
   * PDF du soir : en-tête GSS (comme le tableau de bord), chiffres clés, classement des équipes
   * (sans le détail des fiches) et, en bas, les règles des points.
   */
  const exporterPdf = async () => {
    const ots0 = ots;
    const enCours0 = enCours;
    try {
      const { outilsPdf, entete, piedDePage, sousTitre, reglesPoints, finY, t, STYLE, VERT, ROUGE } = await import('@/utils/rapportPdf');
      const { jsPDF, autoTable } = await outilsPdf();
      // période passée : ce qui était en cours vient de la photo du programme du dernier jour
      // photographié de la période (supabase_photo_programme.sql)
      let ots = ots0;
      let enCours = enCours0;
      let finPhotoMs = Date.now();
      let jourPhoto = '';
      if (!enCours0) {
        const photos = await fetchPhotosProgramme(debut, fin);
        jourPhoto = photos.reduce((m, p) => (p.jour > m ? p.jour : m), '');
        if (jourPhoto) {
          const villeDe = (eq: string) => equipes.find((e) => e.name.toLowerCase() === eq.toLowerCase())?.ville ?? '';
          const ouvertes = photos
            .filter((p) => p.jour === jourPhoto)
            .map((p) => ({ ...p.ot, id: `p:${p.ot.id}`, statut: 'a_faire' as const }))
            .filter(
              (o) =>
                ficheOk(o) &&
                !estPourPlusTard(o, jourPhoto) &&
                (!fEquipe || o.equipe === fEquipe) &&
                (!fZone || (o.zone ?? '').trim() === fZone) &&
                (!fVille || villeDe(o.equipe) === fVille) &&
                typeOk(o, fType),
            );
          ots = [...ots0.filter((o) => o.statut !== 'a_faire'), ...ouvertes];
          enCours = true;
          finPhotoMs = Date.parse(`${jourPhoto}T23:59:59Z`);
        }
      }
      const stats = statsEquipes(ots, debut, fin, enCours, jourPhoto ? finPhotoMs : undefined);
      const chefDe = (eq: string) => equipes.find((e) => e.name.toLowerCase() === eq.toLowerCase())?.leader || '-';
      const pts = (eq: string, base: number) => {
        const b = parEquipe.get(eq)?.get(cle);
        return b ? b.points : base;
      };
      const taux = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '-');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const filtres = [fVille && `Ville : ${fVille}`, fEquipe && `Équipe : ${fEquipe}`, fZone && `Zone : ${fZone}`, fType && `Type : ${TYPE_LABEL[fType] ?? fType}`].filter(Boolean).join(' - ');
      let y = entete(doc, `Surveillance des équipes - ${libellePeriode(debut, g, true)}`, [
        ...(filtres ? [filtres] : []),
        'Une fiche compte le jour de sa clôture. Points = points des fiches + pénalités.',
        ...(jourPhoto ? [`En cours : fiches encore ouvertes à la fin du ${jourPhoto.split('-').reverse().join('/')} (programme enregistré ce jour-là).`] : []),
        `Édité le ${new Date().toLocaleString('fr-FR')} par ${user.name}`,
      ]);

      const tot = stats.reduce(
        (a, s) => ({
          installations: a.installations + s.installations,
          installationsFaites: a.installationsFaites + s.installationsFaites,
          derangements: a.derangements + s.derangements,
          derangementsFaits: a.derangementsFaits + s.derangementsFaits,
          faites: a.faites + s.faites,
          nonFaites: a.nonFaites + s.nonFaites,
          dansDelai: a.dansDelai + s.dansDelai,
          horsDelai: a.horsDelai + s.horsDelai,
          enCours: a.enCours + s.enCours,
          points: a.points + pts(s.equipe, s.points),
        }),
        { installations: 0, installationsFaites: 0, derangements: 0, derangementsFaits: 0, faites: 0, nonFaites: 0, dansDelai: 0, horsDelai: 0, enCours: 0, points: 0 },
      );
      const cloturees = tot.faites + tot.nonFaites;

      // 1. Chiffres clés : une ligne de cases lisibles d'un coup d'œil
      y = sousTitre(doc, y, 'Chiffres clés');
      const cases: [string, string, [number, number, number]][] = [
        ['Fiches traitées', String(cloturees), [15, 23, 42]],
        ['Faites', `${tot.faites} (${taux(tot.faites, cloturees)})`, VERT],
        ['Non faites', `${tot.nonFaites} (${taux(tot.nonFaites, cloturees)})`, ROUGE],
        ['Dans le délai', `${tot.dansDelai} (${taux(tot.dansDelai, tot.faites)})`, VERT],
        ['Hors délai', String(tot.horsDelai), ROUGE],
        ['En cours', String(tot.enCours), [21, 101, 192]],
        ['Points', fmtPts(tot.points), tot.points < 0 ? ROUGE : VERT],
      ];
      const largeur = (doc.internal.pageSize.getWidth() - 24 - (cases.length - 1) * 3) / cases.length;
      y += 2;
      cases.forEach(([lib, val, c], i) => {
        const x = 12 + i * (largeur + 3);
        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, y, largeur, 17, 2, 2, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(90, 100, 115);
        doc.text(t(lib), x + largeur / 2, y + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...c);
        doc.text(t(val), x + largeur / 2, y + 13, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      });
      doc.setTextColor(15, 23, 42);
      y += 25;

      // 2. Installations et dérangements séparés : faites, non faites, délai, en cours
      const statsIns = statsEquipes(ots.filter((o) => o.nature !== 'derangement'), debut, fin, enCours);
      const statsDrg = statsEquipes(ots.filter((o) => o.nature === 'derangement'), debut, fin, enCours);
      const vide = { faites: 0, nonFaites: 0, dansDelai: 0, horsDelai: 0, enCours: 0 };
      const cumul = (l: typeof stats) =>
        l.reduce(
          (a, s) => ({ faites: a.faites + s.faites, nonFaites: a.nonFaites + s.nonFaites, dansDelai: a.dansDelai + s.dansDelai, horsDelai: a.horsDelai + s.horsDelai, enCours: a.enCours + s.enCours }),
          vide,
        );
      const totIns = cumul(statsIns);
      const totDrg = cumul(statsDrg);
      const cinq = (c: typeof vide) => [c.faites, c.nonFaites, `${c.dansDelai} (${taux(c.dansDelai, c.faites)})`, c.horsDelai, c.enCours];
      // couleurs des colonnes de nature : faites / dans le délai en vert, non faites / hors délai en rouge, en cours en bleu
      const couleurNature = (debutCol: number) => (d: { section: string; column: { index: number }; cell: { raw?: unknown; styles: { textColor: unknown; fontStyle?: unknown } } }) => {
        if (d.section !== 'body' || d.column.index < debutCol) return;
        const k = (d.column.index - debutCol) % 5;
        const v = String(d.cell.raw ?? '');
        if (v === '0' || v.startsWith('0 ')) d.cell.styles.textColor = [170, 178, 189];
        else d.cell.styles.textColor = k === 0 || k === 2 ? VERT : k === 4 ? [21, 101, 192] : ROUGE;
      };
      y = sousTitre(doc, y, 'Installations et dérangements');
      autoTable(doc, {
        ...STYLE,
        startY: y,
        head: [['Nature', 'Faites', 'Non faites', 'Dans le délai', 'Hors délai', 'En cours', 'Taux de réalisation'].map(t)],
        body: [
          ['Installations', ...cinq(totIns), taux(totIns.faites, totIns.faites + totIns.nonFaites)],
          ['Dérangements', ...cinq(totDrg), taux(totDrg.faites, totDrg.faites + totDrg.nonFaites)],
        ].map((r) => r.map(t)),
        foot: [['Total', ...cinq(cumul([...statsIns, ...statsDrg])), taux(tot.faites, cloturees)].map(t)],
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 60 }, 6: { fontStyle: 'bold' } },
        didParseCell: (d) => {
          if (d.column.index <= 5) couleurNature(1)(d);
        },
      });
      y = finY(doc) + 9;

      // 3. Classement des équipes (le plus de points en premier), installations et dérangements à part
      const parNom = (l: typeof stats) => new Map(l.map((s) => [s.equipe, s]));
      const ins = parNom(statsIns);
      const drg = parNom(statsDrg);
      const classees = [...stats].sort((a, b) => pts(b.equipe, b.points) - pts(a.equipe, a.points) || b.faites - a.faites || a.equipe.localeCompare(b.equipe));
      const cols = ['Faites', 'Non faites', 'Dans le délai', 'Hors délai', 'En cours'];
      y = sousTitre(doc, y, 'Classement des équipes');
      autoTable(doc, {
        ...STYLE,
        startY: y,
        pageBreak: 'auto',
        styles: { ...STYLE.styles, fontSize: 8, cellPadding: 1.5 },
        headStyles: { ...STYLE.headStyles, fontSize: 8 },
        head: [
          [
            ...['Rang', 'Équipe', "Chef d'équipe", 'Points'].map((x) => ({ content: t(x), rowSpan: 2 })),
            { content: 'Installations', colSpan: 5 },
            { content: t('Dérangements'), colSpan: 5 },
          ],
          [...cols, ...cols].map(t),
        ],
        body: classees.map((s, i) =>
          [i + 1, s.equipe, chefDe(s.equipe), fmtPts(pts(s.equipe, s.points)), ...cinq(ins.get(s.equipe) ?? vide), ...cinq(drg.get(s.equipe) ?? vide)].map(t),
        ),
        foot: [['', 'Total', '', fmtPts(tot.points), ...cinq(totIns), ...cinq(totDrg)].map(t)],
        columnStyles: { 0: { halign: 'center', fontStyle: 'bold', cellWidth: 11 }, 1: { halign: 'left', fontStyle: 'bold' }, 2: { halign: 'left' }, 3: { fontStyle: 'bold' } },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = String(d.cell.raw ?? '').startsWith('-') ? ROUGE : VERT;
          couleurNature(4)(d);
        },
      });
      y = finY(doc) + 10;

      // 4. Détail par équipe : chaque fiche avec son FGP, son type, son motif, son délai et ses points
      const doublons = doublonsCable(ots);
      const hautPage = doc.internal.pageSize.getHeight();
      const largeurPage = doc.internal.pageSize.getWidth();
      doc.addPage();
      y = sousTitre(doc, 16, 'Détail des fiches par équipe');
      doc.setFontSize(8);
      doc.setTextColor(90, 100, 115);
      doc.text(t('Chaque fiche avec ses points selon le barème (voir les règles des points à la fin). Les pénalités de la période sont ajoutées sous les fiches.'), 12, y + 2);
      doc.setTextColor(15, 23, 42);
      y += 8;
      for (const s of classees) {
        const fiches = ots
          .filter((o) => o.equipe === s.equipe)
          .filter((o) => {
            if (o.statut === 'a_faire') return enCours && !estPourPlusTard(o, fin);
            const j = o.traiteLe ? isoJour(new Date(o.traiteLe)) : '';
            return j >= debut && j <= fin;
          })
          .map((o) => ({ o, d: delaiOT({ ...o, doublonCable: doublons.has(o.id) }, o.statut === 'a_faire' && jourPhoto ? finPhotoMs : undefined) }))
          .sort(
            (a, b) =>
              Number(a.o.nature === 'derangement') - Number(b.o.nature === 'derangement') ||
              ['fait', 'non_fait', 'a_faire'].indexOf(a.o.statut) - ['fait', 'non_fait', 'a_faire'].indexOf(b.o.statut) ||
              (a.o.zone ?? '').localeCompare(b.o.zone ?? ''),
          );
        const pens = penalitesFiltrees.filter((x) => x.equipe === s.equipe && x.jour >= debut && x.jour <= fin);
        if (!fiches.length && !pens.length) continue;
        if (y > hautPage - 45) {
          doc.addPage();
          y = 16;
        }
        // bandeau de l'équipe
        const ptsFiches = fiches.reduce((a, f) => a + (f.o.statut === 'a_faire' ? 0 : f.d.points), 0);
        const ptsPen = pens.reduce((a, x) => a + x.points, 0);
        doc.setFillColor(30, 41, 59);
        doc.rect(12, y, largeurPage - 24, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(t(`${s.equipe}${chefDe(s.equipe) !== '-' ? `  -  chef : ${chefDe(s.equipe)}` : ''}`), 15, y + 5.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(
          t(`${fiches.length} fiche${fiches.length > 1 ? 's' : ''}  -  fiches ${fmtPts(ptsFiches)}  -  pénalités ${fmtPts(ptsPen)}  -  total ${fmtPts(ptsFiches + ptsPen)} pts`),
          largeurPage - 15,
          y + 5.5,
          { align: 'right' },
        );
        doc.setTextColor(15, 23, 42);
        const typeFiche = (o: ProgrammeOT) => (o.nature === 'derangement' ? 'DRG' : `INS - ${(o.typeOt || '').toUpperCase() || 'INST'}`);
        const etatFiche = (o: ProgrammeOT, d: ReturnType<typeof delaiOT>) =>
          o.statut === 'fait' ? (d.etat === 'dans' ? 'Dans le délai' : 'Hors délai') : o.statut === 'non_fait' ? 'Non fait' : d.etat === 'retard' ? 'En cours (en retard)' : 'En cours';
        autoTable(doc, {
          ...STYLE,
          startY: y + 8,
          pageBreak: 'auto',
          styles: { ...STYLE.styles, fontSize: 8, cellPadding: 1.3 },
          headStyles: { ...STYLE.headStyles, fontSize: 8 },
          head: [['N°', 'FGP', 'N° OT', 'Type', 'Zone', 'Motif', 'Délai', 'Points'].map(t)],
          body: [
            ...fiches.map(({ o, d }, i) =>
              [i + 1, ligneLabel(o), o.numeroOt || '-', typeFiche(o), o.zone || '-', o.statut === 'a_faire' ? '-' : o.motif || '-', etatFiche(o, d), o.statut === 'a_faire' ? '-' : fmtPtsSigne(d.points)].map(t),
            ),
            ...pens.map((x) =>
              ['', ligneLabel(x), x.numeroOt || '-', x.nature === 'derangement' ? 'DRG' : 'INS', '-', `Pénalité : ${MOTIF_PENALITE[x.motif]}${x.note ? ` (${x.note})` : ''}`, jourCourt(x.jour), fmtPtsSigne(x.points)].map(t),
            ),
          ],
          foot: [['', '', '', '', '', '', 'Total', fmtPts(ptsFiches + ptsPen)].map(t)],
          columnStyles: {
            0: { halign: 'center', cellWidth: 9, fontStyle: 'normal' },
            1: { halign: 'left', fontStyle: 'bold', cellWidth: 38 },
            2: { cellWidth: 30 },
            3: { cellWidth: 24 },
            4: { cellWidth: 28 },
            5: { halign: 'left' },
            6: { cellWidth: 34 },
            7: { cellWidth: 18, fontStyle: 'bold' },
          },
          didParseCell: (d) => {
            if (d.section !== 'body') return;
            const v = String(d.cell.raw ?? '');
            if (d.row.index >= fiches.length) {
              d.cell.styles.fillColor = [254, 242, 242];
              if (d.column.index === 5 || d.column.index === 7) d.cell.styles.textColor = ROUGE;
              return;
            }
            if (d.column.index === 6) d.cell.styles.textColor = v === 'Dans le délai' ? VERT : v.startsWith('En cours') ? [21, 101, 192] : ROUGE;
            if (d.column.index === 7) d.cell.styles.textColor = v.startsWith('+') ? VERT : v.startsWith('-') && v !== '-' ? ROUGE : [90, 100, 115];
          },
        });
        y = finY(doc) + 8;
      }

      // 5. Règles des points (barème en vigueur), à la fin du document
      doc.addPage();
      y = 16;

      reglesPoints(doc, autoTable, y);
      piedDePage(doc);
      doc.save(`surveillance_${g}_${debut}.pdf`);
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };

  const exporter = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Bilan');
      ws.addRow([`Surveillance des équipes — ${libellePeriode(debut, g, true)}`]).font = { bold: true, size: 13 };
      ws.addRow([]);
      ws.addRow(['Équipe', 'Faites', 'Dans le délai', 'Non faites', 'Points des fiches', 'Pénalités', 'Points des pénalités', 'Points', ...(enCours ? ['À faire (maintenant)', 'En retard'] : [])]).font = { bold: true };
      lignes.forEach((l) =>
        ws.addRow([l.equipe, l.b.faites, l.b.dans, l.b.nonFaites, l.b.pointsFiches, l.b.penalites, l.b.pointsPenalites, l.b.points, ...(enCours ? [l.o?.aFaire ?? 0, l.o?.enRetard ?? 0] : [])]),
      );
      ws.columns.forEach((c, i) => (c.width = i === 0 ? 20 : 14));
      const we = wb.addWorksheet('Évolution');
      we.addRow(['Période', 'Équipe', 'Faites', 'Dans le délai', 'Non faites', 'Pénalités', 'Points']).font = { bold: true };
      cles.forEach((k) =>
        noms.forEach((equipe) => {
          const b = parEquipe.get(equipe)?.get(k);
          if (b) we.addRow([libellePeriode(k, g, true), equipe, b.faites, b.dans, b.nonFaites, b.penalites, b.points]);
        }),
      );
      we.columns.forEach((c, i) => (c.width = i < 2 ? 24 : 12));
      downloadWorkbookBuffer(await wb.xlsx.writeBuffer(), `surveillance_${g}_${debut}.xlsx`);
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };

  // fiches de l'équipe ouverte en détail : clôturées dans la période + ouvertes (si période en cours)
  const ficheDetail = useMemo(() => {
    if (!detail) return [];
    return ots
      .filter((o) => o.equipe === detail)
      .filter((o) => (o.statut === 'a_faire' ? enCours : !!o.traiteLe && isoJour(new Date(o.traiteLe)) >= debut && isoJour(new Date(o.traiteLe)) <= fin))
      .map((o) => ({ o, d: delaiOT(o) }))
      .sort((a, b) => Number(a.o.statut !== 'a_faire') - Number(b.o.statut !== 'a_faire') || a.d.echeance.localeCompare(b.d.echeance));
  }, [detail, ots, enCours, debut, fin]);
  const pensDetail = penalites.filter((p) => p.equipe === detail && p.jour >= debut && p.jour <= fin);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Choix de la période */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            {GRANULARITES.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setG(x.id)}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold ${g === x.id ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto sm:ml-0">
            <button type="button" aria-label="Période précédente" onClick={() => setJour(decaler(debut, g, -1))} className="p-2 rounded-lg hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label className="relative inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 min-w-0">
              <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">{libellePeriode(debut, g, true)}</span>
              <input
                type="date"
                aria-label="Choisir une date"
                value={jour}
                max={maxJour}
                onChange={(e) => e.target.value && setJour(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
            <button
              type="button"
              aria-label="Période suivante"
              disabled={fin >= maxJour}
              onClick={() => setJour(decaler(debut, g, 1) > maxJour ? maxJour : decaler(debut, g, 1))}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {!enCours && (
            <button type="button" onClick={() => setJour(aujourdhui)} className="text-xs font-semibold text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50">
              Aujourd’hui
            </button>
          )}
          <span className="flex gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" icon={<FileText className="w-3.5 h-3.5" />} onClick={exporterPdf} disabled={!loaded}>
              PDF
            </Button>
            <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={exporter} disabled={!loaded}>
              Excel
            </Button>
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Ville', value: fVille, set: setFVille, options: villes as string[] },
            { label: 'Équipe', value: fEquipe, set: setFEquipe, options: equipes.filter((e) => !fVille || e.ville === fVille).map((e) => e.name) },
            { label: 'Zone', value: fZone, set: setFZone, options: zonesConnues },
          ].map((f) => (
            <select
              key={f.label}
              aria-label={`Filtrer par ${f.label.toLowerCase()}`}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className={`min-w-0 border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white ${f.value ? 'border-blue-400 text-blue-900 font-semibold' : 'border-slate-200 text-slate-600'}`}
            >
              <option value="">{f.label} : toutes</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ))}
          <select
            aria-label="Filtrer par type"
            value={fType}
            onChange={(e) => setFType(e.target.value)}
            className={`min-w-0 border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white ${fType ? 'border-blue-400 text-blue-900 font-semibold' : 'border-slate-200 text-slate-600'}`}
          >
            <option value="">Type : tous</option>
            <option value="DRG">{TYPE_LABEL.DRG}</option>
            <option value={INST_SANS_CST_ANS}>{TYPE_LABEL[INST_SANS_CST_ANS]}</option>
            <option value={INST_TOUTES}>{TYPE_LABEL[INST_TOUTES]}</option>
            {typesConnus.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-2">
          Une fiche compte le jour où elle a été clôturée (« Fait » ou « Non fait »), avec les points du barème ; une pénalité, le jour où elle a été donnée.
          {enCours && ' « À faire » et « en retard » : le programme ouvert, maintenant.'}
        </p>
      </Card>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {peutSignaler && <ReclamationsPanel reclamations={reclamations} onTraiter={traiter} />}

      {/* Chiffres de la période */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <Kpi label="Faites" value={total.faites} cls="text-emerald-700" sub={`${pct(total.dans, total.faites)} % dans le délai`} />
        <Kpi label="Non faites" value={total.nonFaites} cls="text-slate-700" />
        <Kpi label="Pénalités" value={total.penalites} cls="text-red-700" sub={total.penalites ? `${fmtPts(total.pointsPenalites)} pt` : undefined} />
        <Kpi label="Points" value={fmtPtsSigne(total.points)} cls={couleurPoints(total.points)} />
        {enCours ? (
          <>
            <Kpi label="À faire (maintenant)" value={totalOuvert.aFaire} cls="text-sky-700" sub={totalOuvert.demain ? `+ ${totalOuvert.demain} pour demain` : undefined} />
            <Kpi label="En retard" value={totalOuvert.enRetard} cls={totalOuvert.enRetard ? 'text-red-700' : 'text-slate-400'} />
          </>
        ) : (
          <Kpi label="Équipes actives" value={lignes.length} />
        )}
      </div>

      {/* Équipes : programme détaillé du jour, ou bilan de la semaine / du mois */}
      {!loaded ? (
        <p className="py-10 text-center text-sm text-slate-400">Chargement…</p>
      ) : g === 'jour' ? (
        <ProgrammeJourEquipes
          ots={ots}
          jour={debut}
          enCours={enCours}
          couleur={couleur}
          peutSignaler={peutSignaler}
          onFauxOk={fauxOk}
          equipeNames={equipes.map((e) => e.name)}
          onReaffecter={reaffecter}
          onRenvoyer={renvoyer}
        />
      ) : lignes.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Aucune activité pour cette période.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lignes.map(({ equipe, b, o }, i) => {
            const clos = b.faites + b.nonFaites;
            return (
              <button
                key={equipe}
                type="button"
                onClick={() => setDetail(equipe)}
                className="text-left bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 hover:shadow-md hover:border-slate-300 transition min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: couleur(equipe) }} />
                  <span className="font-bold text-slate-900 truncate flex-1">{equipe}</span>
                  <span className={`text-xl font-black tabular-nums ${couleurPoints(b.points)}`}>{fmtPtsSigne(b.points)}</span>
                  <span className="text-[10px] text-slate-400 -ml-1">pt</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="bg-emerald-500" style={{ width: `${pct(b.faites, clos)}%` }} />
                  <div className="bg-slate-400" style={{ width: `${pct(b.nonFaites, clos)}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                  <div>
                    <p className="text-base font-black text-emerald-700 tabular-nums">{b.faites}</p>
                    <p className="text-[10px] text-slate-500">faites</p>
                  </div>
                  <div>
                    <p className="text-base font-black text-slate-700 tabular-nums">{b.nonFaites}</p>
                    <p className="text-[10px] text-slate-500">non faites</p>
                  </div>
                  <div>
                    <p className={`text-base font-black tabular-nums ${b.penalites ? 'text-red-700' : 'text-slate-300'}`}>{b.penalites}</p>
                    <p className="text-[10px] text-slate-500">pénalités</p>
                  </div>
                  <div>
                    <p className={`text-base font-black tabular-nums ${enCours ? 'text-sky-700' : 'text-slate-300'}`}>{enCours ? (o?.aFaire ?? 0) : '—'}</p>
                    <p className="text-[10px] text-slate-500">à faire</p>
                  </div>
                </div>
                {enCours && o && (o.enRetard > 0 || o.urgents > 0) && (
                  <p className="mt-2 text-[11px] font-semibold text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {o.enRetard > 0 && `${o.enRetard} en retard`}
                    {o.enRetard > 0 && o.urgents > 0 && ' · '}
                    {o.urgents > 0 && `${o.urgents} urgente${o.urgents > 1 ? 's' : ''}`}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {b.faites ? `${pct(b.dans, b.faites)} % dans le délai · ` : ''}voir les fiches
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Évolution */}
      {evolution.length > 0 && (
        <Card>
          <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-800 text-sm sm:text-base">
              Évolution — {NB_PERIODES[g]} derni{g === 'mois' ? 'ers mois' : g === 'semaine' ? 'ères semaines' : 'ers jours'}
            </h2>
            <div className="inline-flex rounded-full bg-slate-100 p-0.5 ml-auto">
              {MESURES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMesure(m.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold ${mesure === m.id ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs sm:text-sm w-full border-collapse">
              <thead>
                <tr className="text-slate-500">
                  <th className="sticky left-0 bg-white text-left font-semibold px-3 py-2 min-w-[7rem]">Équipe</th>
                  {colonnes.map((k) => (
                    <th key={k} className={`px-2 py-2 font-semibold whitespace-nowrap text-center ${k === cle ? 'text-blue-700 bg-blue-50/60' : ''}`}>
                      {g === 'jour' ? jourCourt(k) : libellePeriode(k, g)}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {evolution.map((l) => {
                  const t = somme(l.cellules);
                  return (
                    <tr key={l.equipe} className="border-t border-slate-100">
                      <td className="sticky left-0 bg-white px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: couleur(l.equipe) }} />
                        {l.equipe}
                      </td>
                      {l.cellules.map((b, j) => {
                        const v = valeur(b);
                        return (
                          <td
                            key={colonnes[j]}
                            title={b ? `${b.faites} faites · ${b.nonFaites} non faites · ${b.penalites} pénalités · ${fmtPts(b.points)} pt` : undefined}
                            className={`px-2 py-2 text-center tabular-nums ${colonnes[j] === cle ? 'bg-blue-50/60' : ''} ${!b ? 'text-slate-200' : mesure === 'points' ? `font-bold ${couleurPoints(v)}` : 'text-slate-700'
                              }`}
                          >
                            {!b ? '·' : mesure === 'points' ? fmtPts(v) : v}
                          </td>
                        );
                      })}
                      <td className={`px-3 py-2 text-right font-black tabular-nums ${mesure === 'points' ? couleurPoints(valeur(t)) : 'text-slate-900'}`}>
                        {mesure === 'points' ? fmtPts(valeur(t)) : valeur(t)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Détail d'une équipe */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50" onClick={() => setDetail(null)}>
          <div
            role="dialog"
            aria-label={`Fiches de ${detail}`}
            className="bg-white w-full sm:max-w-2xl max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: couleur(detail) }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 truncate">{detail}</p>
                <p className="text-xs text-slate-500">{libellePeriode(debut, g, true)}</p>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => setDetail(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {ficheDetail.length === 0 && pensDetail.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Aucune fiche.</p>}
              {ficheDetail.map(({ o, d }) => (
                <div key={o.id} className="px-4 py-2.5 flex items-start gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${NATURE_CLASS[o.nature]}`}>{NATURE_LABEL[o.nature].slice(0, 3).toUpperCase()}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {ligneLabel(o)} · {o.clientNom}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {o.statut === 'a_faire'
                        ? `échéance ${jourCourt(d.echeance)} 22 h${d.prioritaire ? ' · prioritaire' : ''}`
                        : `${o.statut === 'fait' ? 'fait' : 'non fait'} le ${o.traiteLe ? new Date(o.traiteLe).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}${o.motif ? ` · ${o.motif}` : ''}`}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${ETAT_DELAI[d.etat].cls}`}>{ETAT_DELAI[d.etat].label}</span>
                  <span className={`w-10 text-right text-sm font-bold tabular-nums shrink-0 ${couleurPoints(d.points)}`}>{o.statut === 'a_faire' ? '' : fmtPtsSigne(d.points)}</span>
                </div>
              ))}
              {pensDetail.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-start gap-2 bg-red-50/40">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 bg-red-50 text-red-700 border-red-200">PÉN</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{ligneLabel(p)}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {MOTIF_PENALITE[p.motif]} · {jourCourt(p.jour)}
                    </p>
                  </div>
                  <span className="w-10 text-right text-sm font-bold tabular-nums text-red-700 shrink-0">{fmtPts(p.points)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
