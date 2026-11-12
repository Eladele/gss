import { useState } from 'react';
import { Cable, Check, ClipboardCopy, Copy, Flame, MapPin, Phone, RotateCcw, X } from 'lucide-react';
import type { ProgrammeOT } from '@/types';
import { NATURE_CLASS, NATURE_LABEL, STATUT_OT, TYPE_OT_LABEL, fmtTel, ligneLabel } from '@/utils/programme';
import { TypeBadge } from '@/components/ui';
import { ETAT_DELAI, POINTS, delaiOT, fmtPts, jourCourt, motPoint, ptsTexte } from '@/utils/points';
import type { SituationType } from '@/types';
import type { ClotureArchivee, IpsOT, ReclamationFauxOk, ScanOT } from '@/lib/programmeService';
import { HistoriqueMotifs } from '@/components/programme/Historique';
import { ReclamerFauxOk } from '@/components/programme/Reclamation';

/** Copie dans le presse-papiers ; `done` passe à vrai 1,5 s pour confirmer à l'écran */
function useCopy(value: string) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // presse-papiers refusé : la valeur reste sélectionnable à l'écran
    }
  };
  return { done, copy };
}

export function CopyChip({ value, label }: { value: string; label?: string }) {
  const { done, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={copy}
      title="Copier"
      className="inline-flex items-center gap-1.5 font-mono text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 select-all"
    >
      {label && <span className="font-sans font-semibold text-slate-400">{label}</span>}
      {value}
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
    </button>
  );
}

/** Fiche OT telle que le chef d'équipe la voit sur le terrain */
export function OtCard({
  ot,
  onFait,
  onNonFait,
  onReset,
  busy,
  scan,
  reclamation,
  onReclamer,
  historique,
  ip,
}: {
  /** OT Réseau (ANS…) : adresses IPS / IPM de la constitution */
  ip?: IpsOT;
  /** motifs passés (fiche déjà « non faite » puis renvoyée) */
  historique?: ClotureArchivee[];
  ot: ProgrammeOT;
  /** réclamation du chef sur le faux OK de cette fiche (s'il y en a une) */
  reclamation?: ReclamationFauxOk;
  /** chef : contester le faux OK qui a rouvert la fiche */
  onReclamer?: (message: string) => Promise<void>;
  onFait?: () => void;
  onNonFait?: () => void;
  onReset?: () => void;
  busy?: boolean;
  scan?: ScanOT;
}) {
  const st = STATUT_OT[ot.statut];
  const delai = delaiOT(ot);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className={`bg-white rounded-xl border ${ot.isUrgent ? 'border-orange-400 bg-orange-50/15 ring-2 ring-orange-300/40' : 'border-slate-200'} border-l-4 ${ot.isUrgent ? 'border-l-orange-600' : st.border} shadow-sm overflow-hidden`}>
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {ot.isUrgent && (
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-orange-600 text-white flex items-center gap-1 shadow-sm animate-pulse" title="Cas urgent à traiter en priorité absolue">
                <Flame className="w-3 h-3 text-yellow-300" /> CAS URGENT
              </span>
            )}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${NATURE_CLASS[ot.nature]}`}>{NATURE_LABEL[ot.nature]}</span>
            {ot.statut === 'a_faire' && delai.prioritaire && (
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white" title="Délai officiel déjà dépassé : à faire aujourd’hui avant 22 h">
                PRIORITAIRE
              </span>
            )}
            {ot.typeOt && (
              <span title={TYPE_OT_LABEL[ot.typeOt] ?? ot.sousType}>
                <TypeBadge type={ot.typeOt as SituationType} />
              </span>
            )}
            {ot.fgp ? (
              <CopyText value={ot.fgp} className="text-base font-black text-slate-900" prefix={`${ot.typeLigne || 'FGP'} `} />
            ) : (
              <span className="text-base font-black">{ligneLabel(ot)}</span>
            )}
            <DelaiBadge d={delai} today={today} />
            {ot.nbPenalites > 0 && (
              <span
                title="Fiche ni faite ni « non faite » au contrôle de 22 h (ou retardée) : nombre de pénalités"
                className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-red-600 text-white border-red-600"
              >
                {ot.statut === 'a_faire' ? 'En cours · ' : ''}
                {ot.nbPenalites} pénalité{ot.nbPenalites > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {ot.clientNom ? (
            <CopyText value={ot.clientNom} className="mt-1 font-semibold text-slate-800" />
          ) : (
            <p className="mt-1 font-semibold text-slate-400">Client sans nom</p>
          )}
          {ot.clientInfo && <p className="text-xs text-slate-400 truncate">{ot.clientInfo}</p>}
        </div>
        <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
      </div>

      {/* Appeler le client */}
      {ot.telephones.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {ot.telephones.map((t) => (
            <PhoneChip key={t} tel={t} />
          ))}
        </div>
      )}

      {/* Réseau */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {ot.zone && <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200">{ot.zone}</span>}
          {ot.pco && (
            <span className="text-xs px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
              PCO <b className="font-mono">{ot.pco}</b>
              {ot.port && (
                <>
                  {' '}
                  · port <b className="font-mono">{ot.port}</b>
                </>
              )}
            </span>
          )}
          {ot.dis && <CopyChip value={ot.dis} label="DIS" />}
        </div>
        {(ot.ontSerials.length > 0 || ip?.ips || ip?.ipm) && (
          <div className="flex flex-wrap gap-1.5">
            {ot.ontSerials.map((s) => (
              <CopyChip key={s} value={s} label="ONT" />
            ))}
            {ip?.ips && <CopyChip value={ip.ips} label="IPS" />}
            {ip?.ipm && <CopyChip value={ip.ipm} label="IPM" />}
          </div>
        )}
        {ot.nature === 'installation' && ot.cableFibreM ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md bg-violet-50 text-violet-800 border border-violet-200">
            <Cable className="w-3.5 h-3.5" /> Câble fibre : {ot.cableFibreM} m
          </p>
        ) : null}
        {ot.ancienDis && <p className="text-xs text-amber-700">Ancien DIS : {ot.ancienDis}</p>}
        {ot.adresse && (
          <p className="text-xs text-slate-500 flex items-start gap-1">
            <MapPin className="w-3.5 h-3.5 mt-px flex-shrink-0" />
            {ot.adresse}
          </p>
        )}
        <p className="text-xs text-slate-500">
          {ot.nature === 'derangement' ? `Défaut : ${ot.defaut || ot.sousType || '—'}` : `${ot.sousType}${ot.abonnement ? ' · ' + ot.abonnement : ''}`}
          <span className="text-slate-300"> · OT {ot.numeroOt}</span>
        </p>
        {ot.statut === 'a_faire' && ot.isUrgent && ot.motif && (
          <p className="text-[11px] font-bold rounded-md px-2.5 py-1 bg-orange-100 text-orange-900 border border-orange-200 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
            <span>Urgence : {ot.motif}</span>
          </p>
        )}
        {ot.statut === 'a_faire' && ot.commentaire.startsWith('Faux OK') && (
          <p className="text-[11px] font-bold rounded-md px-2 py-1 bg-red-600 text-white">
            Rouverte : {ot.commentaire} — la fiche avait été marquée « Fait » à tort ({fmtPts(POINTS.penalites.faux_ok)} {motPoint(POINTS.penalites.faux_ok)}). À refaire.
          </p>
        )}
        <HistoriqueMotifs liste={historique} compact />
        {ot.statut === 'a_faire' && ot.commentaire.startsWith('Faux OK') && onReclamer && (
          <ReclamerFauxOk reclamation={reclamation} onReclamer={onReclamer} />
        )}
        {ot.statut === 'a_faire' && (
          <p className={`text-[11px] rounded-md px-2 py-1 ${delai.prioritaire || delai.etat === 'retard' ? 'bg-red-50 text-red-800 font-semibold' : 'text-slate-500'}`}>
            OT reçu le {jourCourt(delai.recuLe)} (délai officiel {jourCourt(delai.echeanceOfficielle)})
            {delai.confieLe ? ` · reçu par l’équipe le ${jourCourt(delai.confieLe)}` : ''} ·{' '}
            {delai.etat === 'retard'
              ? `échéance dépassée (${jourCourt(delai.echeance)} 22 h) : ${fmtPts(POINTS.penalites.non_traitee)} ${motPoint(POINTS.penalites.non_traitee)} à chaque contrôle de 22 h tant qu’elle n’est pas traitée.`
              : delai.prioritaire
                ? `déjà hors délai : prioritaire, à faire le ${jourCourt(delai.echeance)} avant 22 h, sinon ${ptsTexte(POINTS.penalites.non_traitee)} de moins.`
                : `à faire avant le ${jourCourt(delai.echeance)} 22 h, sinon ${ptsTexte(POINTS.penalites.non_traitee)} de moins.`}
          </p>
        )}
        <ScanInfo ot={ot} scan={scan} />
        {ot.statut !== 'a_faire' && <ClotureResume ot={ot} />}
        {ot.statut !== 'a_faire' && ot.traiteParNom && (
          <p className="text-[11px] text-slate-400">
            {ot.statut === 'fait' ? 'Fait' : 'Signalé'} par {ot.traiteParNom}
            {ot.traiteLe ? ' · ' + new Date(ot.traiteLe).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
          </p>
        )}
      </div>

      <div className="px-4 pb-3">
        <CopyAll ot={ot} ip={ip} />
      </div>

      {(onFait || onNonFait || onReset) && (
        <div className="px-3 pb-3">
          {ot.statut === 'a_faire' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy}
                onClick={onFait}
                className="py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl inline-flex items-center justify-center gap-1.5 active:scale-95 transition"
              >
                <Check className="w-4 h-4" /> Fait
              </button>
              <button
                disabled={busy}
                onClick={onNonFait}
                className="py-2.5 bg-white border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 font-bold text-sm rounded-xl inline-flex items-center justify-center gap-1.5 active:scale-95 transition"
              >
                <X className="w-4 h-4" /> Non fait
              </button>
            </div>
          ) : (
            onReset && (
              <button disabled={busy} onClick={onReset} className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 px-1">
                <RotateCcw className="w-3.5 h-3.5" /> Remettre à faire
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Texte copiable d'un appui (FGP, nom du client) */
function CopyText({ value, className = '', prefix = '' }: { value: string; className?: string; prefix?: string }) {
  const { done, copy } = useCopy(value);
  return (
    <button type="button" onClick={copy} title="Copier" className={`group inline-flex items-center gap-1.5 text-left max-w-full ${className}`}>
      <span className="truncate">
        {prefix}
        {value}
      </span>
      {done ? (
        <Check className="w-4 h-4 flex-shrink-0 text-emerald-600" />
      ) : (
        <Copy className="w-3.5 h-3.5 flex-shrink-0 text-slate-300 group-hover:text-slate-500" />
      )}
    </button>
  );
}

/** Numéro du client : appeler (zone principale) ou copier (icône) */
function PhoneChip({ tel }: { tel: string }) {
  const { done, copy } = useCopy(tel);
  return (
    <span className="inline-flex items-stretch rounded-lg bg-blue-50 text-blue-800 overflow-hidden">
      <a href={`tel:${tel}`} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-2 text-sm font-bold tabular-nums hover:bg-blue-100 active:scale-95 transition">
        <Phone className="w-4 h-4" />
        {fmtTel(tel)}
      </a>
      <button type="button" onClick={copy} aria-label={`Copier ${tel}`} className="px-2 border-l border-blue-100 hover:bg-blue-100">
        {done ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-blue-400" />}
      </button>
    </span>
  );
}

/** Copie toute la fiche (à coller dans WhatsApp ou un SMS) */
function CopyAll({ ot, ip }: { ot: ProgrammeOT; ip?: IpsOT }) {
  const text = [
    ligneLabel(ot),
    ot.clientNom,
    ot.telephones.length ? `Tél : ${ot.telephones.join(' / ')}` : '',
    ot.dis ? `DIS ${ot.dis}` : '',
    ot.ontSerials.length ? `ONT ${ot.ontSerials.join(' / ')}` : '',
    ip?.ips ? `IPS ${ip.ips}` : '',
    ip?.ipm ? `IPM ${ip.ipm}` : '',
    ot.nature === 'installation' && ot.cableFibreM ? `Câble fibre : ${ot.cableFibreM} m` : '',
    ot.adresse ? `Adresse : ${ot.adresse}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const { done, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    >
      {done ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
      {done ? 'Fiche copiée' : 'Copier nom, FGP et contacts'}
    </button>
  );
}

/** Résumé de la clôture : motif, décharge, scan, nouvelle constitution, poteaux */
export function ClotureResume({ ot }: { ot: ProgrammeOT }) {
  const fait = ot.statut === 'fait';
  const pill = (ok: boolean | null, label: string) =>
    ok === null ? null : (
      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
        {label} : {ok ? 'oui' : 'non'}
      </span>
    );
  return (
    <div className={`rounded-md px-2 py-1.5 space-y-1 text-xs ${fait ? 'bg-emerald-50/60 text-emerald-900' : 'bg-red-50 text-red-800'}`}>
      {(ot.motif || ot.commentaire) && (
        <p>
          {ot.motif && <b>{ot.motif}</b>}
          {ot.motif && ot.commentaire ? ' · ' : ''}
          {ot.commentaire}
        </p>
      )}
      {(fait || ot.poteaux > 0) && (
        <div className="flex flex-wrap gap-1">
          {fait && pill(ot.decharge, 'Décharge')}
          {fait && pill(ot.scanne, 'Scanné')}
          {ot.poteaux > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {ot.poteaux} poteau{ot.poteaux > 1 ? 'x' : ''}
            </span>
          )}
        </div>
      )}
      {ot.cstChange && (
        <p className="font-mono text-[11px] text-emerald-900">
          Nouvelle CST : {ot.nouveauDis ? `DIS ${ot.nouveauDis}` : ''}
          {ot.nouvelOnt ? ` · ONT ${ot.nouvelOnt}` : ''}
        </p>
      )}
    </div>
  );
}

/** Délai de la fiche : échéance (à faire), en retard, ou dans / hors délai une fois faite */
function DelaiBadge({ d, today }: { d: ReturnType<typeof delaiOT>; today: string }) {
  if (d.etat === 'non_fait') return null;
  const label =
    d.etat === 'en_cours'
      ? d.echeance === today
        ? 'Avant 22 h aujourd’hui'
        : `Avant ${jourCourt(d.echeance)} 22 h`
      : d.etat === 'retard'
        ? `En retard (échéance ${jourCourt(d.echeance)} 22 h)`
        : ETAT_DELAI[d.etat].label;
  const cls = d.etat === 'en_cours' && d.echeance === today ? 'bg-amber-100 text-amber-800 border-amber-200' : ETAT_DELAI[d.etat].cls;
  return (
    <span
      title={`OT reçu le ${d.recuLe.split('-').reverse().join('/')} · reçu par l'équipe le ${d.depart.split('-').reverse().join('/')} · échéance de l'équipe le ${d.echeance.split('-').reverse().join('/')} à 22 h`} className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
      {d.etat === 'dans' && d.points ? ` · ${d.points > 0 ? '+' : ''}${fmtPts(d.points)} pt` : ''}
    </span>
  );
}

const frCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

/** État de l'ONT dans les fichiers de scan réseau (le fichier fait foi, pas la case cochée) */
function ScanInfo({ ot, scan }: { ot: ProgrammeOT; scan?: ScanOT }) {
  if (!scan) return null;
  // Dérangement : l'ONT était-il déjà non scanné avant la panne ?
  if (ot.nature === 'derangement' && scan.avant && scan.avant !== 'SCANNE' && scan.avantLe) {
    return (
      <p className="text-[11px] font-semibold rounded-md px-2 py-1 bg-amber-50 text-amber-800">
        ONT {scan.avant === 'ABSENT' ? 'absent du' : 'non scanné dans le'} fichier de scan du {frCourt(scan.avantLe)}, avant la panne
      </p>
    );
  }
  // Installation faite : vérifiée par un fichier importé après l'installation
  if (ot.nature === 'installation' && ot.statut === 'fait' && scan.dernier && scan.dernierLe && ot.traiteLe && scan.dernierLe > ot.traiteLe) {
    const ok = scan.dernier === 'SCANNE';
    return (
      <p className={`text-[11px] font-semibold rounded-md px-2 py-1 ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
        {ok ? 'Scanné' : scan.dernier === 'ABSENT' ? 'Absent du fichier de scan' : 'Non scanné'} au fichier du {frCourt(scan.dernierLe)}
        {!ok && ot.scanne ? ' (pourtant coché « scanné »)' : ''}
      </p>
    );
  }
  return null;
}
