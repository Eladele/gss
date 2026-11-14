import { useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { useCaisseStore, isComptable, isDirecteur, isSuperviseurCaisse } from '@/store/useCaisseStore';
import { useAppStore } from '@/store/useAppStore';
import { CATEGORIES, guessCategorie, guessChantier, mru, parseWhatsApp, todayISO, shortDate, soldes, type ParsedLine } from '@/utils/caisse';
import { errMsg } from '@/utils';
import { Caisse, CaisseOperation, CaisseOpType } from '@/types';

const label = 'block text-xs font-semibold text-slate-500 mb-1.5';

function CategoryPicker({ value, onChange }: { value: string; onChange: (v: ParsedLine['categorie']) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${value === c.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** Caisse proposée par défaut : celle dont l'utilisateur est titulaire, sinon la première */
function defaultCaisseId(caisses: Caisse[], userId: string, preferred?: string | null) {
  if (preferred && caisses.some((c) => c.id === preferred)) return preferred;
  return caisses.find((c) => c.titulaireId === userId)?.id ?? caisses[0]?.id ?? '';
}

// ─── Saisie / modification d'une opération ──────────────────────────────────
export function OperationModal({
  open,
  onClose,
  type,
  editing,
  preferredCaisse,
}: {
  open: boolean;
  onClose: () => void;
  type: CaisseOpType;
  editing?: CaisseOperation | null;
  preferredCaisse?: string | null;
}) {
  const user = useAppStore((s) => s.user)!;
  const { caisses, operations, addOperations, editOperation } = useCaisseStore();
  const { showToast } = useToast();
  const compta = isComptable(user);
  const directeur = isDirecteur(user);
  // Un superviseur ne travaille que sur sa propre caisse
  const actives = caisses.filter(
    (c) => (c.actif || c.id === editing?.caisseId) && (!isSuperviseurCaisse(user) || c.titulaireId === user.id),
  );

  const [caisseId, setCaisseId] = useState(() => editing?.caisseId ?? defaultCaisseId(actives, user.id, preferredCaisse));
  const [montant, setMontant] = useState(editing ? String(editing.montant) : '');
  const [libelle, setLibelle] = useState(editing?.libelle ?? '');
  const [categorie, setCategorie] = useState<ParsedLine['categorie']>(
    editing && editing.categorie !== 'alimentation' ? editing.categorie : 'carburant',
  );
  const [catTouched, setCatTouched] = useState(!!editing);
  const [chantier, setChantier] = useState(editing?.chantier ?? '');
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [note, setNote] = useState(editing?.note ?? '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const isDep = type === 'depense';
  // Qui crée quoi :
  //  • dépense      : superviseur → DEMANDE à la comptable ; comptable → enregistrée directement
  //  • alimentation : comptable ET directeur → alimentation directe (sans demande)
  const direct = isDep ? compta : (compta || directeur);
  const soldeCaisse = useMemo(() => soldes(caisses, operations)[caisseId], [caisses, operations, caisseId]);
  const title = editing
    ? `Modifier l'opération`
    : isDep
      ? direct ? 'Enregistrer une dépense' : 'Demander une dépense'
      : 'Alimenter une caisse';

  const submit = async () => {
    const m = parseInt(montant.replace(/\D/g, ''), 10);
    if (!caisseId) return setErr('Choisissez une caisse.');
    if (!m || m <= 0) return setErr('Indiquez un montant supérieur à 0.');
    if (isDep && !libelle.trim()) return setErr('Ajoutez une courte description, par exemple « Carburant Rosso ».');
    setErr('');
    setSaving(true);
    try {
      if (editing) {
        await editOperation(editing.id, {
          caisseId,
          montant: m,
          date,
          libelle: isDep ? libelle.trim() : editing.libelle,
          categorie: isDep ? categorie : 'alimentation',
          chantier,
          note,
        });
        showToast('Opération modifiée', 'success');
      } else {
        await addOperations([
          {
            caisseId,
            type,
            montant: m,
            date,
            libelle: isDep ? libelle.trim() : 'Alimentation caisse',
            categorie: isDep ? categorie : 'alimentation',
            chantier,
            trsId: null,
            note,
            statut: 'validee',
          },
        ]);
        showToast('Opération enregistrée', 'success');
      }
      onClose();
    } catch (e) {
      setErr(errMsg(e, 'Enregistrement impossible'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {!direct && !editing && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            {isDep
              ? 'La comptabilité est prévenue immédiatement. La dépense compte dans le solde une fois validée.'
              : 'Le directeur est prévenu immédiatement. Vous recevrez une notification dès que le transfert est fait.'}
          </p>
        )}
        <div>
          <label className={label} htmlFor="op-montant">Montant (MRU)</label>
          <input
            id="op-montant"
            inputMode="numeric"
            autoFocus
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-2xl font-black tabular-nums focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className={label} htmlFor="op-caisse">Caisse</label>
          <Select id="op-caisse" className="w-full" value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
            {actives.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {c.telephone ? ` · ${c.telephone}` : ''}
                {c.titulaireId === user.id ? ' (ma caisse)' : ''}
              </option>
            ))}
          </Select>
          {!isDep && soldeCaisse && (
            <p className={`text-xs mt-1.5 ${soldeCaisse.solde < 0 ? 'text-red-700' : 'text-slate-500'}`}>
              Solde actuel : <b className="tabular-nums">{mru(soldeCaisse.solde)} MRU</b>
              {soldeCaisse.enAttenteDepense > 0 && ` · ${mru(soldeCaisse.enAttenteDepense)} de dépenses en attente`}
              {soldeCaisse.enAttenteAlim > 0 && ` · ${mru(soldeCaisse.enAttenteAlim)} d’alimentation déjà demandés`}
            </p>
          )}
        </div>
        {isDep && (
          <>
            <div>
              <label className={label} htmlFor="op-libelle">Description</label>
              <Input
                id="op-libelle"
                value={libelle}
                placeholder="ex. Carburant Rosso, 2 poteaux Kaédi"
                onChange={(e) => {
                  setLibelle(e.target.value);
                  if (!catTouched) setCategorie(guessCategorie(e.target.value));
                  if (!editing) setChantier(guessChantier(e.target.value));
                }}
              />
            </div>
            <div>
              <span className={label}>Catégorie</span>
              <CategoryPicker
                value={categorie}
                onChange={(c) => {
                  setCategorie(c);
                  setCatTouched(true);
                }}
              />
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="op-date">Date</label>
            <Input id="op-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="op-chantier">Lieu / chantier</label>
            <Input id="op-chantier" value={chantier} onChange={(e) => setChantier(e.target.value)} placeholder="Rosso, CI1Z01…" />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="op-note">{!isDep && !direct ? 'Motif de la demande' : 'Note'}</label>
          <Input
            id="op-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={!isDep && !direct ? 'ex. solde négatif, carburant de la semaine' : 'facultatif'}
          />
        </div>
        {err && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1 justify-center" onClick={submit} disabled={saving}>
            {saving ? 'Envoi…' : editing ? 'Enregistrer' : direct ? 'Enregistrer' : 'Envoyer la demande'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Collage d'un message WhatsApp → plusieurs dépenses ────────────────────
/** Clé d'une opération pour reconnaître un message déjà enregistré (même caisse, type, date, montant, libellé) */
const cleOp = (o: { caisseId: string; type: string; date: string; montant: number; libelle: string }) =>
  [o.caisseId, o.type, o.date, Math.round(o.montant), o.libelle.trim().toLowerCase()].join('|');

export function WhatsAppModal({ open, onClose, preferredCaisse }: { open: boolean; onClose: () => void; preferredCaisse?: string | null }) {
  const user = useAppStore((s) => s.user)!;
  const { caisses, operations, addOperations } = useCaisseStore();
  const { showToast } = useToast();
  const compta = isComptable(user);
  const directeur = isDirecteur(user);
  // dépenses : superviseur (demande) et comptable ; alimentations : comptable et directeur (directes)
  const peutDepense = compta || isSuperviseurCaisse(user);
  const peutAlim = compta || directeur;
  const actives = caisses.filter((c) => c.actif && (!isSuperviseurCaisse(user) || c.titulaireId === user.id));
  const [caisseId, setCaisseId] = useState(() => defaultCaisseId(actives, user.id, preferredCaisse));
  const [type, setType] = useState<CaisseOpType>(peutDepense ? 'depense' : 'alimentation');
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<Record<number, ParsedLine['categorie']>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [gardeDoublons, setGardeDoublons] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const alim = type === 'alimentation';

  const lines = useMemo(() => parseWhatsApp(text, date), [text, date]);
  // opérations déjà enregistrées (pour ne pas compter deux fois un message collé à nouveau)
  const existantes = useMemo(
    () => new Set(operations.filter((o) => o.statut !== 'annulee' && o.statut !== 'rejetee').map(cleOp)),
    [operations],
  );
  const lignes = lines.map((l, i) => {
    const libelle = alim && !/alim|envoi|versement|transfert|recu|reçu/i.test(l.libelle) ? `Alimentation ${l.libelle}`.trim() : l.libelle;
    const doublon = existantes.has(cleOp({ caisseId, type, date: l.date, montant: l.montant, libelle: alim ? libelle : l.libelle }));
    return { ...l, i, libelle: alim ? libelle : l.libelle, categorie: overrides[i] ?? l.categorie, doublon };
  });
  const kept = lignes.filter((l) => !removed.has(l.i) && (!l.doublon || gardeDoublons.has(l.i)));
  const total = kept.reduce((s, l) => s + l.montant, 0);
  const nbDoublons = lignes.filter((l) => l.doublon && !removed.has(l.i) && !gardeDoublons.has(l.i)).length;

  // regroupement par message (date + émetteur) et totaux par émetteur
  const groupes = new Map<number, typeof lignes>();
  lignes.forEach((l) => {
    if (removed.has(l.i)) return;
    const g = groupes.get(l.message);
    if (g) g.push(l);
    else groupes.set(l.message, [l]);
  });
  const messages = [...groupes.values()];
  const totaux = new Map<string, { n: number; total: number }>();
  kept.forEach((l) => {
    const k = l.emetteur || '—';
    const x = totaux.get(k) ?? { n: 0, total: 0 };
    x.n++;
    x.total += l.montant;
    totaux.set(k, x);
  });
  const parEmetteur = [...totaux.entries()].sort((a, b) => b[1].total - a[1].total);

  const submit = async () => {
    setSaving(true);
    try {
      await addOperations(
        kept.map((l) => ({
          caisseId,
          type,
          montant: l.montant,
          date: l.date,
          libelle: l.libelle,
          categorie: alim ? ('alimentation' as const) : l.categorie,
          chantier: l.chantier,
          // alimentation : toujours directe (comptable, directeur) ; dépense : directe pour la comptable
          statut: alim || compta ? ('validee' as const) : ('en_attente' as const),
          source: 'whatsapp',
          emetteur: l.emetteur,
        })),
      );
      const quoi = alim ? 'alimentation' : 'dépense';
      showToast(
        alim || compta ? `${kept.length} ${quoi}${kept.length > 1 ? 's' : ''} enregistrée${kept.length > 1 ? 's' : ''} · ${mru(total)} MRU` : `${kept.length} demandes envoyées à la comptabilité`,
        'success',
      );
      onClose();
    } catch (e) {
      showToast(errMsg(e, 'Enregistrement impossible'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const reinit = () => {
    setOverrides({});
    setRemoved(new Set());
    setGardeDoublons(new Set());
  };

  return (
    <Modal open={open} onClose={onClose} title="Coller des messages WhatsApp">
      <div className="space-y-4">
        {peutDepense && peutAlim && (
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
            {(['depense', 'alimentation'] as const).map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => {
                  setType(ty);
                  reinit();
                }}
                className={`py-2 rounded-lg text-sm font-bold ${type === ty ? (ty === 'depense' ? 'bg-white shadow text-slate-900' : 'bg-white shadow text-emerald-700') : 'text-slate-500'}`}
              >
                {ty === 'depense' ? 'Dépenses' : 'Alimentations'}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Collez un ou plusieurs messages tels quels, avec leur en-tête « [3/9, 11:35] ElAdel: ». Chaque ligne avec un montant devient
          {alim ? ' une alimentation' : ' une dépense'}, à la date du message et au nom de son émetteur.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="wa-caisse">Caisse</label>
            <Select id="wa-caisse" className="w-full" value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
              {actives.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className={label} htmlFor="wa-date">Date si le message n’en a pas</label>
            <Input id="wa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <Textarea
          id="wa-text"
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            reinit();
          }}
          placeholder={'[3/9, 11:35] ElAdel: Slm\nCarburant 3200\n3 poteau 600\n[3/9, 18:49] 7abib: Bonjour,\n1000 frais transport matériel kaedi'}
        />

        {messages.length > 0 && (
          <div className="border border-slate-200 rounded-xl max-h-80 overflow-y-auto">
            {messages.map((g) => {
              const t0 = g[0];
              const sousTotal = g.filter((l) => !l.doublon || gardeDoublons.has(l.i)).reduce((s, l) => s + l.montant, 0);
              return (
                <div key={t0.message} className="border-b border-slate-100 last:border-0">
                  <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-xs">
                    <span className="font-bold text-slate-700">{shortDate(t0.date)}</span>
                    {t0.emetteur && <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-600">{t0.emetteur}</span>}
                    <span className="ml-auto font-bold tabular-nums text-slate-700">{mru(sousTotal)}</span>
                  </div>
                  {g.map((l) => (
                    <div key={l.i} className={`flex items-center gap-2 px-3 py-2 ${l.doublon && !gardeDoublons.has(l.i) ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {l.libelle}
                          {l.date !== t0.date && <span className="text-xs text-slate-400 font-normal"> · {shortDate(l.date)}</span>}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {!alim && (
                            <select
                              aria-label="Catégorie"
                              className="text-xs border border-slate-200 rounded-md px-1.5 py-0.5 bg-white"
                              value={l.categorie}
                              onChange={(e) => setOverrides((o) => ({ ...o, [l.i]: e.target.value as ParsedLine['categorie'] }))}
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {l.doublon && (
                            <button
                              type="button"
                              onClick={() =>
                                setGardeDoublons((s) => {
                                  const n = new Set(s);
                                  if (n.has(l.i)) n.delete(l.i);
                                  else n.add(l.i);
                                  return n;
                                })
                              }
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800"
                            >
                              {gardeDoublons.has(l.i) ? 'Enregistrer quand même ✓' : 'Déjà enregistrée — ignorée'}
                            </button>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${alim ? 'text-emerald-700' : ''}`}>{mru(l.montant)}</span>
                      <button
                        type="button"
                        aria-label="Retirer la ligne"
                        className="text-slate-300 hover:text-red-600 px-1 text-lg leading-none"
                        onClick={() => setRemoved((s) => new Set(s).add(l.i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {kept.length > 0 && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
            {parEmetteur.length > 1 &&
              parEmetteur.map(([nom, x]) => (
                <div key={nom} className="flex justify-between text-xs text-slate-600">
                  <span>
                    {nom} · {x.n} ligne{x.n > 1 ? 's' : ''}
                  </span>
                  <span className="tabular-nums font-semibold">{mru(x.total)} MRU</span>
                </div>
              ))}
            <div className={`flex justify-between text-sm font-black ${alim ? 'text-emerald-800' : 'text-slate-900'} ${parEmetteur.length > 1 ? 'pt-1.5 border-t border-slate-200' : ''}`}>
              <span>
                Total · {kept.length} ligne{kept.length > 1 ? 's' : ''} · {messages.length} message{messages.length > 1 ? 's' : ''}
              </span>
              <span className="tabular-nums">{mru(total)} MRU</span>
            </div>
            {nbDoublons > 0 && (
              <p className="text-[11px] text-amber-700">
                {nbDoublons} ligne{nbDoublons > 1 ? 's' : ''} déjà enregistrée{nbDoublons > 1 ? 's' : ''} (même date, montant et libellé) : non comptée{nbDoublons > 1 ? 's' : ''}.
              </p>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1 justify-center" onClick={submit} disabled={!kept.length || saving || !caisseId}>
            {saving
              ? 'Envoi…'
              : kept.length
                ? `${alim || compta ? 'Enregistrer' : 'Envoyer'} ${kept.length} ligne${kept.length > 1 ? 's' : ''}`
                : 'Rien à envoyer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Refus d'une ou plusieurs demandes ─────────────────────────────────────
const MOTIFS = ['Pas de justificatif', 'Montant à vérifier', 'Hors budget', 'Doublon'];
export function RejectModal({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const decide = useCaisseStore((s) => s.decide);
  const { showToast } = useToast();
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const n = await decide(ids, 'rejetee', { motif: motif.trim() });
      showToast(n > 1 ? `${n} demandes refusées` : 'Demande refusée', 'warning');
      onClose();
    } catch (e) {
      showToast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={ids.length > 0} onClose={onClose} title={ids.length > 1 ? `Refuser ${ids.length} demandes` : 'Refuser la demande'}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Le demandeur reçoit le motif dans sa notification.</p>
        <div className="flex flex-wrap gap-1.5">
          {MOTIFS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotif(m)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border ${motif === m ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <Input id="rej-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif du refus" />
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" className="flex-1 justify-center" onClick={submit} disabled={saving || !motif.trim()}>
            Refuser
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Exécution d'une demande d'alimentation ────────────────────────────────
export function FulfillModal({ op, onClose }: { op: CaisseOperation | null; onClose: () => void }) {
  const { decide, editOperation, caisses } = useCaisseStore();
  const { showToast } = useToast();
  const caisse = caisses.find((c) => c.id === op?.caisseId);
  const [montant, setMontant] = useState(op ? String(op.montant) : '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  if (!op) return null;
  const submit = async () => {
    const m = parseInt(montant.replace(/\D/g, ''), 10);
    if (!m) return setErr('Indiquez le montant transféré.');
    setSaving(true);
    try {
      if (m !== op.montant) await editOperation(op.id, { montant: m });
      await decide([op.id], 'validee');
      showToast('Transfert enregistré : la comptable et le titulaire sont prévenus', 'success');
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Effectuer l’alimentation">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Demandée par <b>{op.demandeParNom}</b> le {shortDate(op.date)} pour la caisse <b>{caisse?.nom ?? '—'}</b>
          {caisse?.telephone ? (
            <>
              {' '}
              (Bankily <span className="font-mono">{caisse.telephone}</span>)
            </>
          ) : null}
          . Faites le transfert, puis confirmez le montant envoyé.
        </p>
        {op.note && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">Motif : {op.note}</p>}
        <div>
          <label className={label} htmlFor="ff-montant">Montant transféré (MRU)</label>
          <Input id="ff-montant" inputMode="numeric" autoFocus value={montant} onChange={(e) => setMontant(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="success" className="flex-1 justify-center" onClick={submit} disabled={saving}>
            Confirmer le transfert
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Gestion des caisses ───────────────────────────────────────────────────
export function CaissesAdminModal({ open, onClose, titulaires }: { open: boolean; onClose: () => void; titulaires: { id: string; name: string }[] }) {
  const { caisses, saveCaisse } = useCaisseStore();
  const { showToast } = useToast();
  const [edit, setEdit] = useState<Partial<Caisse> | null>(null);
  const save = async () => {
    if (!edit?.nom?.trim()) return showToast('Donnez un nom à la caisse', 'error');
    try {
      await saveCaisse({ ...edit, nom: edit.nom.trim() });
      setEdit(null);
      showToast('Caisse enregistrée', 'success');
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Caisses">
      {edit ? (
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="cx-nom">Nom</label>
            <Input id="cx-nom" value={edit.nom ?? ''} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="cx-tit">Titulaire (reçoit les notifications de la caisse)</label>
            <Select id="cx-tit" className="w-full" value={edit.titulaireId ?? ''} onChange={(e) => setEdit({ ...edit, titulaireId: e.target.value || null })}>
              <option value="">— Aucun —</option>
              {titulaires.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="cx-tel">Numéro Bankily</label>
              <Input id="cx-tel" inputMode="numeric" value={edit.telephone ?? ''} onChange={(e) => setEdit({ ...edit, telephone: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="cx-seuil">Alerte solde bas</label>
              <Input id="cx-seuil" inputMode="numeric" value={String(edit.seuilAlerte ?? 5000)} onChange={(e) => setEdit({ ...edit, seuilAlerte: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={edit.actif ?? true} onChange={(e) => setEdit({ ...edit, actif: e.target.checked })} /> Caisse active
          </label>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 justify-center" onClick={() => setEdit(null)}>
              Retour
            </Button>
            <Button className="flex-1 justify-center" onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {caisses.map((c) => (
            <button
              key={c.id}
              onClick={() => setEdit(c)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left"
            >
              <span className="font-semibold text-sm text-slate-800">
                {c.nom} {!c.actif && <span className="text-xs text-slate-400 font-normal">(inactive)</span>}
              </span>
              <span className="text-xs text-slate-400 font-mono">{c.telephone}</span>
            </button>
          ))}
          <Button variant="outline" className="w-full justify-center mt-2" onClick={() => setEdit({ nom: '', telephone: '', seuilAlerte: 5000, actif: true })}>
            Ajouter une caisse
          </Button>
        </div>
      )}
    </Modal>
  );
}

