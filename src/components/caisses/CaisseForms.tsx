import { useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { useCaisseStore, isComptable, isDirecteur, isSuperviseurCaisse } from '@/store/useCaisseStore';
import { useAppStore } from '@/store/useAppStore';
import type { Caisse, CaisseOperation, CaisseOpType } from '@/types';
import { CATEGORIES, guessCategorie, guessChantier, mru, parseWhatsApp, todayISO, shortDate, soldes, type ParsedLine } from '@/utils/caisse';
import { errMsg } from '@/utils';

const label = 'block text-xs font-semibold text-slate-500 mb-1.5';

function CategoryPicker({ value, onChange }: { value: string; onChange: (v: ParsedLine['categorie']) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            value === c.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
  //  • alimentation : comptable → DEMANDE au directeur ;   directeur → transfert enregistré directement
  const direct = isDep ? compta : directeur;
  const soldeCaisse = useMemo(() => soldes(caisses, operations)[caisseId], [caisses, operations, caisseId]);
  const title = editing
    ? 'Modifier l’opération'
    : isDep
      ? direct ? 'Enregistrer une dépense' : 'Demander une dépense'
      : direct ? 'Alimenter une caisse' : 'Demander une alimentation au directeur';

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
            libelle: isDep ? libelle.trim() : direct ? 'Transfert Bankily' : 'Demande d’alimentation',
            categorie: isDep ? categorie : 'alimentation',
            chantier,
            trsId: null,
            note,
            statut: direct ? 'validee' : 'en_attente',
          },
        ]);
        showToast(direct ? 'Opération enregistrée' : isDep ? 'Demande envoyée à la comptabilité' : 'Demande envoyée au directeur', 'success');
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
export function WhatsAppModal({ open, onClose, preferredCaisse }: { open: boolean; onClose: () => void; preferredCaisse?: string | null }) {
  const user = useAppStore((s) => s.user)!;
  const { caisses, addOperations } = useCaisseStore();
  const { showToast } = useToast();
  const compta = isComptable(user);
  const actives = caisses.filter((c) => c.actif && (!isSuperviseurCaisse(user) || c.titulaireId === user.id));
  const [caisseId, setCaisseId] = useState(() => defaultCaisseId(actives, user.id, preferredCaisse));
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<Record<number, ParsedLine['categorie']>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const lines = useMemo(() => parseWhatsApp(text, date), [text, date]);
  const kept = lines.map((l, i) => ({ ...l, i, categorie: overrides[i] ?? l.categorie })).filter((l) => !removed.has(l.i));
  const total = kept.reduce((s, l) => s + l.montant, 0);

  const submit = async () => {
    setSaving(true);
    try {
      await addOperations(
        kept.map((l) => ({
          caisseId,
          type: 'depense' as const,
          montant: l.montant,
          date: l.date,
          libelle: l.libelle,
          categorie: l.categorie,
          chantier: l.chantier,
          statut: compta ? ('validee' as const) : ('en_attente' as const),
          source: 'whatsapp',
        })),
      );
      showToast(compta ? `${kept.length} dépenses enregistrées` : `${kept.length} demandes envoyées à la comptabilité`, 'success');
      onClose();
    } catch (e) {
      showToast(errMsg(e, 'Enregistrement impossible'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Coller un message WhatsApp">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Collez le message tel qu’il est écrit. Chaque ligne avec un montant devient une dépense ; vérifiez la catégorie avant d’envoyer.
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
            <label className={label} htmlFor="wa-date">Date par défaut</label>
            <Input id="wa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <Textarea
          id="wa-text"
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOverrides({});
            setRemoved(new Set());
          }}
          placeholder={'Bonjour\nCarburant 3200\n3 poteau 600\nLocation depot 1500'}
        />
        {kept.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {lines.map((l, i) =>
              removed.has(i) ? null : (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {l.libelle} <span className="text-xs text-slate-400 font-normal">{shortDate(l.date)}</span>
                    </p>
                    <select
                      aria-label="Catégorie"
                      className="mt-0.5 text-xs border border-slate-200 rounded-md px-1.5 py-0.5 bg-white"
                      value={overrides[i] ?? l.categorie}
                      onChange={(e) => setOverrides((o) => ({ ...o, [i]: e.target.value as ParsedLine['categorie'] }))}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{mru(l.montant)}</span>
                  <button
                    type="button"
                    aria-label="Retirer la ligne"
                    className="text-slate-300 hover:text-red-600 px-1 text-lg leading-none"
                    onClick={() => setRemoved((s) => new Set(s).add(i))}
                  >
                    ×
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        {kept.length > 0 && (
          <div className="flex justify-between text-sm font-semibold text-slate-700 px-1">
            <span>Total</span>
            <span className="tabular-nums">{mru(total)} MRU</span>
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1 justify-center" onClick={submit} disabled={!kept.length || saving || !caisseId}>
            {saving ? 'Envoi…' : kept.length ? `${compta ? 'Enregistrer' : 'Envoyer'} ${kept.length} ligne${kept.length > 1 ? 's' : ''}` : 'Rien à envoyer'}
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

