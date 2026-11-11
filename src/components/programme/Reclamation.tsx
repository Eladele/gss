import { useState } from 'react';
import { Check, Clock, MessageSquareWarning, X } from 'lucide-react';
import type { ReclamationFauxOk } from '@/lib/programmeService';
import { libelleFauxOk, ligneLabel } from '@/utils/programme';
import { fmtPts } from '@/utils/points';

const dateHeure = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Chef d'équipe, sur une fiche rouverte par un faux OK : bouton « Réclamer » (explication courte),
 * puis l'état de la réclamation (en attente, refusée avec la raison).
 */
export function ReclamerFauxOk({ reclamation, onReclamer }: { reclamation?: ReclamationFauxOk; onReclamer: (message: string) => Promise<void> }) {
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (reclamation?.statut === 'en_attente')
    return (
      <p className="text-[11px] font-semibold rounded-md px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 shrink-0" /> Réclamation envoyée le {dateHeure(reclamation.demandeLe)} — en attente du superviseur.
      </p>
    );
  if (reclamation?.statut === 'refusee')
    return (
      <p className="text-[11px] font-semibold rounded-md px-2 py-1 bg-slate-100 text-slate-700 border border-slate-200">
        Réclamation refusée par {reclamation.traiteParNom ?? 'le superviseur'}
        {reclamation.reponse ? ` : « ${reclamation.reponse} »` : ''}. Le faux OK est maintenu.
      </p>
    );
  if (reclamation) return null;

  if (!ouvert)
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="w-full text-xs font-bold rounded-lg px-3 py-2 border border-red-300 text-red-700 bg-white hover:bg-red-50 inline-flex items-center justify-center gap-1.5"
      >
        <MessageSquareWarning className="w-4 h-4" /> Ce n’est pas un faux OK : réclamer
      </button>
    );
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-2 space-y-2">
      <textarea
        aria-label="Explication de la réclamation"
        value={message}
        maxLength={300}
        rows={2}
        autoFocus
        placeholder="Expliquez : le client a du signal, décharge signée, photo envoyée…"
        onChange={(e) => setMessage(e.target.value)}
        className="w-full text-sm rounded-md border border-red-200 bg-white px-2 py-1.5 resize-none"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOuvert(false)} className="flex-1 text-xs font-semibold rounded-md px-2 py-2 bg-white border border-slate-200 text-slate-600">
          Annuler
        </button>
        <button
          type="button"
          disabled={message.trim().length < 3 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onReclamer(message.trim());
              setOuvert(false);
            } catch {
              /* erreur déjà affichée : le texte reste pour réessayer */
            } finally {
              setBusy(false);
            }
          }}
          className="flex-[2] text-xs font-bold rounded-md px-2 py-2 bg-red-600 text-white disabled:opacity-40"
        >
          {busy ? 'Envoi…' : 'Envoyer la réclamation'}
        </button>
      </div>
    </div>
  );
}

/**
 * Admin / superviseur : réclamations des chefs à accepter ou refuser, puis les dernières décisions.
 * Accepter : le faux OK (et les pénalités prises depuis la réouverture) sont annulés, la fiche
 * redevient « Fait » si elle n'a pas été refaite. Refuser : raison obligatoire.
 */
export function ReclamationsPanel({
  reclamations,
  onTraiter,
}: {
  reclamations: ReclamationFauxOk[];
  onTraiter: (r: ReclamationFauxOk, accepter: boolean, reponse: string) => Promise<void>;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [raison, setRaison] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [voirTout, setVoirTout] = useState(false);
  const enAttente = reclamations.filter((r) => r.statut === 'en_attente');
  const traitees = reclamations.filter((r) => r.statut !== 'en_attente');
  if (!reclamations.length) return null;

  const agir = async (r: ReclamationFauxOk, accepter: boolean) => {
    setBusy(r.id);
    try {
      await onTraiter(r, accepter, accepter ? '' : raison.trim());
      setRefus(null);
      setRaison('');
    } catch {
      /* erreur déjà affichée */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`rounded-xl border shadow-sm bg-white overflow-hidden ${enAttente.length ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className={`px-3 sm:px-4 py-2.5 flex items-center gap-2 ${enAttente.length ? 'bg-amber-50' : 'bg-slate-50'}`}>
        <MessageSquareWarning className={`w-4 h-4 ${enAttente.length ? 'text-amber-700' : 'text-slate-400'}`} />
        <h2 className="font-bold text-slate-800 text-sm flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          Réclamations faux OK
          {enAttente.length > 0 && <span className="text-xs font-bold text-white bg-amber-600 rounded-full px-2 py-0.5 whitespace-nowrap">{enAttente.length} à traiter</span>}
        </h2>
        {traitees.length > 0 && (
          <button type="button" onClick={() => setVoirTout((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 whitespace-nowrap">
            {voirTout ? 'Masquer les décisions' : `Décisions (${traitees.length})`}
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {enAttente.length === 0 && !voirTout && <p className="px-4 py-3 text-xs text-slate-500">Aucune réclamation en attente.</p>}
        {enAttente.map((r) => (
          <div key={r.id} className="px-3 sm:px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-bold text-slate-900">{ligneLabel(r)}</span>
              <span className="text-sm text-slate-600 truncate">{r.clientNom}</span>
              <span className="text-xs font-semibold text-slate-500">· {r.equipe}</span>
              <span className="text-[11px] text-slate-400 ml-auto">{dateHeure(r.demandeLe)}</span>
            </div>
            <p className="text-xs text-slate-600">
              Faux OK du {r.jourFauxOk.slice(8, 10)}/{r.jourFauxOk.slice(5, 7)} : <b>{libelleFauxOk(r.motifFauxOk, r.noteFauxOk) || '—'}</b> ({fmtPts(r.points)} pt)
            </p>
            <p className="text-sm bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-slate-800">
              <span className="text-xs font-semibold text-slate-500">{r.demandeParNom ?? 'Chef'} : </span>« {r.message} »
            </p>
            {refus === r.id ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  aria-label="Raison du refus"
                  value={raison}
                  maxLength={300}
                  autoFocus
                  placeholder="Raison du refus (obligatoire)"
                  onChange={(e) => setRaison(e.target.value)}
                  className="flex-1 text-sm rounded-md border border-slate-300 px-2 py-1.5"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRefus(null)} className="flex-1 sm:flex-none text-xs font-semibold rounded-md px-3 py-2 border border-slate-200 text-slate-600">
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={raison.trim().length < 3 || busy === r.id}
                    onClick={() => agir(r, false)}
                    className="flex-1 sm:flex-none text-xs font-bold rounded-md px-3 py-2 bg-slate-800 text-white disabled:opacity-40"
                  >
                    Confirmer le refus
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => agir(r, true)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold rounded-md px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <Check className="w-4 h-4" /> Accepter
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => {
                    setRefus(r.id);
                    setRaison('');
                  }}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold rounded-md px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <X className="w-4 h-4" /> Refuser
                </button>
                <p className="hidden sm:block text-[11px] text-slate-400 self-center">
                  Accepter annule le faux OK et les pénalités prises depuis ; la fiche redevient « Fait » si elle n’a pas été refaite.
                </p>
              </div>
            )}
          </div>
        ))}
        {voirTout &&
          traitees.map((r) => (
            <div key={r.id} className="px-3 sm:px-4 py-2 text-xs flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
              <span
                className={`font-bold px-1.5 py-0.5 rounded-full border ${r.statut === 'acceptee' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
              >
                {r.statut === 'acceptee' ? 'Acceptée' : 'Refusée'}
              </span>
              <span className="font-semibold text-slate-800">{ligneLabel(r)}</span>
              <span className="text-slate-500">{r.equipe}</span>
              <span className="text-slate-500 truncate">« {r.message} »</span>
              {r.reponse && <span className="text-slate-700">→ {r.reponse}</span>}
              <span className="text-slate-400 ml-auto">
                {r.traiteParNom} · {dateHeure(r.traiteLe)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
