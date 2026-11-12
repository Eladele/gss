import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Download, Eye, FileText, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
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
  reassign,
  redistribuer,
  type ClotureArchivee,
} from '@/lib/programmeService';
import { ProgrammeJourEquipes } from '@/components/programme/ProgrammeJourEquipes';
import { ReclamationsPanel } from '@/components/programme/Reclamation';
import { ETAT_DELAI, POINTS, delaiOT, fmtPts, fmtPtsSigne, jourCourt, jourOuvreSuivant } from '@/utils/points';
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
import type { Penalite, ProgrammeOT } from '@/types';
import { errMsg } from '@/utils';

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
export default function SurveillancePage() {
  const equipes = useAppStore((s) => s.equipes);
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
          ([o, p, h, autres]) => vivant && (setOts(o), setPenalites(p), setArchives(h), setBasesArchives(autres), setError('')),
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
  }, [depuis, fin, peutSignaler, version]);

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
      (o) => (!fEquipe || o.equipe === fEquipe) && (!fZone || (o.zone ?? '').trim() === fZone) && (!fVille || villeDe(o.equipe) === fVille),
    );
  }, [otsBruts, archives, basesArchives, fEquipe, fZone, fVille, equipes]);
  const zonesConnues = useMemo(() => [...new Set(otsBruts.map((o) => (o.zone ?? '').trim()).filter(Boolean))].sort(), [otsBruts]);
  const villes = useMemo(() => [...new Set(equipes.map((e) => e.ville).filter((v): v is NonNullable<typeof v> => !!v))].sort(), [equipes]);
  const penalitesFiltrees = useMemo(() => {
    const villeDe = (eq: string) => equipes.find((e) => e.name.toLowerCase() === eq.toLowerCase())?.ville ?? '';
    const zoneFiche = new Map(otsBruts.map((o) => [o.id, (o.zone ?? '').trim()]));
    return penalites.filter(
      (p) =>
        (!fEquipe || p.equipe === fEquipe) &&
        (!fVille || villeDe(p.equipe) === fVille) &&
        (!fZone || zoneFiche.get(p.situationId) === fZone),
    );
  }, [penalites, fEquipe, fZone, fVille, equipes, otsBruts]);
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

  /** PDF du soir : statistiques par équipe (chef, installations / dérangements, faites, délai) */
  const exporterPdf = async () => {
    try {
      const [{ jsPDF }, modTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      // selon le bundler, la fonction est l'export par défaut ou « autoTable »
      const mt = modTable as unknown as { default?: unknown; autoTable?: unknown };
      const autoTable = (typeof mt.default === 'function' ? mt.default : (mt.autoTable ?? (mt.default as { default?: unknown })?.default)) as typeof import('jspdf-autotable').default;
      const pdfTxt = (s: string) => s.replace(/\u2212/g, '-').replace(/[\u2019]/g, "'");
      const stats = statsEquipes(ots, debut, fin, enCours);
      const chefDe = (eq: string) => equipes.find((e) => e.name.toLowerCase() === eq.toLowerCase())?.leader || '-';
      const pts = (eq: string, base: number) => {
        const b = parEquipe.get(eq)?.get(cle);
        return b ? b.points : base;
      };
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(15);
      doc.text(pdfTxt(`Surveillance des équipes - ${libellePeriode(debut, g, true)}`), 14, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      const filtres = [fVille && `ville ${fVille}`, fEquipe && `équipe ${fEquipe}`, fZone && `zone ${fZone}`].filter(Boolean).join(' · ');
      doc.text(
        pdfTxt(`Édité le ${new Date().toLocaleString('fr-FR')} par ${user.name}${filtres ? ` · ${filtres}` : ''} · une fiche compte le jour de sa clôture`),
        14,
        21,
      );
      const total = stats.reduce(
        (t, s) => ({
          installations: t.installations + s.installations,
          installationsFaites: t.installationsFaites + s.installationsFaites,
          derangements: t.derangements + s.derangements,
          derangementsFaits: t.derangementsFaits + s.derangementsFaits,
          faites: t.faites + s.faites,
          nonFaites: t.nonFaites + s.nonFaites,
          dansDelai: t.dansDelai + s.dansDelai,
          horsDelai: t.horsDelai + s.horsDelai,
          enCours: t.enCours + s.enCours,
          points: t.points + pts(s.equipe, s.points),
        }),
        { installations: 0, installationsFaites: 0, derangements: 0, derangementsFaits: 0, faites: 0, nonFaites: 0, dansDelai: 0, horsDelai: 0, enCours: 0, points: 0 },
      );
      const taux = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '-');
      autoTable(doc, {
        startY: 26,
        head: [['Équipe', "Chef d'équipe", 'Installations', 'dont faites', 'Dérangements', 'dont faits', 'Faites', 'Non faites', 'Dans le délai', 'Hors délai', ...(enCours ? ['En cours'] : []), 'Points']].map(
          (r) => r.map(pdfTxt),
        ),
        body: stats.map((s) =>
          [
            s.equipe,
            chefDe(s.equipe),
            s.installations,
            s.installationsFaites,
            s.derangements,
            s.derangementsFaits,
            s.faites,
            s.nonFaites,
            `${s.dansDelai} (${taux(s.dansDelai, s.faites)})`,
            s.horsDelai,
            ...(enCours ? [s.enCours] : []),
            fmtPts(pts(s.equipe, s.points)),
          ].map((v) => pdfTxt(String(v))),
        ),
        foot: [
          [
            'Total',
            '',
            total.installations,
            total.installationsFaites,
            total.derangements,
            total.derangementsFaits,
            total.faites,
            total.nonFaites,
            `${total.dansDelai} (${taux(total.dansDelai, total.faites)})`,
            total.horsDelai,
            ...(enCours ? [total.enCours] : []),
            fmtPts(total.points),
          ].map((v) => pdfTxt(String(v))),
        ],
        styles: { fontSize: 9, cellPadding: 1.8 },
        headStyles: { fillColor: [30, 41, 59] },
        footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold' } },
      });
      // détail de chaque équipe : FGP, nature, état, motif
      if (g === 'jour') {
        for (const s of stats) {
          const fiches = ots
            .filter((o) => o.equipe === s.equipe)
            .filter((o) => (o.statut === 'a_faire' ? enCours : !!o.traiteLe && isoJour(new Date(o.traiteLe)) === debut));
          if (!fiches.length) continue;
          autoTable(doc, {
            head: [[`${s.equipe}${chefDe(s.equipe) !== '-' ? ` - chef : ${chefDe(s.equipe)}` : ''}`, 'Zone', 'Nature', 'État', 'Motif'].map(pdfTxt)],
            body: fiches
              .sort((a, b) => (a.zone ?? '').localeCompare(b.zone ?? '') || a.statut.localeCompare(b.statut))
              .map((o) => {
                const d = delaiOT(o);
                const etat = o.statut === 'fait' ? (d.etat === 'dans' ? 'Fait (dans le délai)' : 'Fait (hors délai)') : o.statut === 'non_fait' ? 'Non fait' : d.etat === 'retard' ? 'En retard' : 'En cours';
                return [ligneLabel(o), o.zone ?? '', o.nature === 'derangement' ? 'Dérangement' : 'Installation', etat, o.statut === 'a_faire' ? '' : o.motif].map((v) => pdfTxt(String(v ?? '')));
              }),
            startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
            styles: { fontSize: 8, cellPadding: 1.2 },
            headStyles: { fillColor: [71, 85, 105] },
            margin: { top: 12 },
          });
        }
      }
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
        <div className="mt-3 grid grid-cols-3 gap-2">
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
                            className={`px-2 py-2 text-center tabular-nums ${colonnes[j] === cle ? 'bg-blue-50/60' : ''} ${
                              !b ? 'text-slate-200' : mesure === 'points' ? `font-bold ${couleurPoints(v)}` : 'text-slate-700'
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
