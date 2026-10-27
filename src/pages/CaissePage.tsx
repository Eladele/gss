import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Check,
  ClipboardPaste,
  Download,
  Inbox,
  Pencil,
  Search,
  Settings2,
  Trash2,
  Undo2,
  X,
  CalendarClock,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useCaisseStore, canDecide, isComptable, isDirecteur, isSuperviseurCaisse } from '@/store/useCaisseStore';
import type { Caisse } from '@/types';
import { Button, Card, Modal, Select, useToast } from '@/components/ui';
import { OperationModal, WhatsAppModal, RejectModal, FulfillModal, CaissesAdminModal } from '@/components/caisses/CaisseForms';
import { ChargesFixesModal } from '@/components/caisses/ChargesFixesModal';
import { fetchTitulaires } from '@/lib/caisseService';
import type { CaisseOperation, CaisseOpType } from '@/types';
import { CATEGORIES, STATUT_CLASS, STATUT_LABEL, catOf, dayLabel, monthLabel, mru, shortDate, soldes } from '@/utils/caisse';
import { downloadWorkbookBuffer } from '@/utils/stats';
import { errMsg } from '@/utils';

type Tab = 'valider' | 'mes' | 'journal' | 'bilan';

const Amount = ({ op }: { op: CaisseOperation }) => (
  <span
    className={`font-semibold tabular-nums whitespace-nowrap ${
      op.statut === 'rejetee' || op.statut === 'annulee' ? 'line-through text-slate-400' : op.type === 'alimentation' ? 'text-emerald-700' : 'text-slate-900'
    }`}
  >
    {op.type === 'alimentation' ? '+' : '−'}
    {mru(op.montant)}
  </span>
);

const StatutPill = ({ s }: { s: CaisseOperation['statut'] }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUT_CLASS[s]}`}>{STATUT_LABEL[s]}</span>
);

export default function CaissesPage() {
  const user = useAppStore((s) => s.user)!;
  const { caisses: allCaisses, operations: allOps, loaded, error, decide, cancel, remove, addOperations } = useCaisseStore();
  const { showToast } = useToast();
  const compta = isComptable(user);
  const directeur = isDirecteur(user);
  const superviseur = isSuperviseurCaisse(user);
  // Un superviseur ne voit que SA caisse ; comptable et directeur voient tout
  const caisses = useMemo(
    () => (superviseur ? allCaisses.filter((c) => c.titulaireId === user.id) : allCaisses),
    [allCaisses, superviseur, user.id],
  );
  const operations = useMemo(() => {
    if (!superviseur) return allOps;
    const ids = new Set(caisses.map((c) => c.id));
    return allOps.filter((o) => ids.has(o.caisseId));
  }, [allOps, caisses, superviseur]);
  const myCaisse = caisses.find((c) => c.titulaireId === user.id) ?? null;

  const pendingForMe = useMemo(() => operations.filter((o) => o.statut === 'en_attente' && canDecide(user, o)), [operations, user]);
  // « Mes demandes » : dépenses demandées (superviseur) ou alimentations demandées au directeur (comptable)
  const myRequests = useMemo(
    () =>
      operations.filter(
        (o) =>
          o.demandeParId === user.id &&
          o.traiteParNom !== 'Reprise historique' &&
          (superviseur ? o.type === 'depense' : o.type === 'alimentation'),
      ),
    [operations, user.id, superviseur],
  );

  const [tab, setTab] = useState<Tab>(() => (compta || directeur ? 'valider' : 'mes'));
  const [caisseFilter, setCaisseFilter] = useState<string>('all');
  const [form, setForm] = useState<{ type: CaisseOpType; editing?: CaisseOperation | null } | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [rejectIds, setRejectIds] = useState<string[]>([]);
  const [fulfill, setFulfill] = useState<CaisseOperation | null>(null);
  const [detail, setDetail] = useState<CaisseOperation | null>(null);
  const [validateOp, setValidateOp] = useState<CaisseOperation | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [chargesFixesOpen, setChargesFixesOpen] = useState(false);
  const [titulaires, setTitulaires] = useState<{ id: string; name: string }[]>([]);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useEffect(() => {
    fetchTitulaires().then(setTitulaires);
  }, []);

  const totals = useMemo(() => soldes(caisses, operations), [caisses, operations]);
  const grand = Object.values(totals).reduce((s, t) => s + t.solde, 0);

  const askNotif = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
    if (p === 'granted') showToast('Alertes activées sur cet appareil', 'success');
  };

  // ─── Rendu ───────────────────────────────────────────────────────────────
  if (!loaded) {
    return <div className="py-20 text-center text-sm text-slate-400">Chargement des caisses…</div>;
  }
  if (error) {
    return (
      <Card className="p-6 max-w-lg">
        <p className="font-semibold text-slate-800">Le module Caisses ne répond pas</p>
        <p className="text-sm text-slate-500 mt-1">{error}</p>
      </Card>
    );
  }

  const tabs: { id: Tab; label: string; count?: number; show: boolean }[] = [
    { id: 'valider', label: directeur ? 'Alimentations à faire' : 'Dépenses à valider', count: pendingForMe.length, show: compta || directeur },
    { id: 'mes', label: 'Mes demandes', count: myRequests.filter((o) => o.statut === 'en_attente').length, show: superviseur || compta },
    { id: 'journal', label: 'Journal', show: true },
    { id: 'bilan', label: 'Bilan', show: true },
  ];

  return (
    <div className="space-y-5 animate-fade-in pb-20 md:pb-0">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Caisses terrain · MRU</p>
          <h1 className="text-2xl font-black text-slate-900">{compta ? 'Comptabilité des caisses' : directeur ? 'Caisses — Direction' : myCaisse ? `Caisse ${myCaisse.nom}` : 'Caisses'}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {notifPerm === 'default' && (
            <Button variant="outline" size="sm" icon={<BellRing className="w-4 h-4" />} onClick={askNotif}>
              Activer les alertes
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={<CalendarClock className="w-4 h-4 text-blue-600" />}
            onClick={() => setChargesFixesOpen(true)}
          >
            Charges fixes
          </Button>
          {(compta || directeur) && (
            <Button variant="ghost" size="sm" icon={<Settings2 className="w-4 h-4" />} onClick={() => setAdminOpen(true)}>
              Caisses
            </Button>
          )}
        </div>
      </div>

      {/* Soldes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {caisses
          .filter((c) => c.actif)
          .map((c) => {
            const t = totals[c.id];
            const low = t.solde < c.seuilAlerte;
            const sel = caisseFilter === c.id;
            const pct = t.recu ? Math.min(100, (t.depense / t.recu) * 100) : t.depense ? 100 : 0;
            return (
              <button
                key={c.id}
                onClick={() => setCaisseFilter(sel ? 'all' : c.id)}
                className={`text-left bg-white rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md ${sel ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-slate-800">
                    {c.nom}
                    {c.titulaireId === user.id && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-700">Ma caisse</span>}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{c.telephone}</span>
                </div>
                <div className={`mt-2 text-3xl font-black tabular-nums ${t.solde < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {t.solde < 0 ? '−' : ''}
                  {mru(Math.abs(t.solde))}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${t.depense > t.recu ? 'bg-red-600' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>
                    Reçu <b className="tabular-nums text-slate-700">{mru(t.recu)}</b>
                  </span>
                  <span>
                    Dépensé <b className="tabular-nums text-slate-700">{mru(t.depense)}</b>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.solde < 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                      Avance de {mru(-t.solde)} à rembourser
                    </span>
                  )}
                  {t.solde >= 0 && low && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">Solde bas</span>
                  )}
                  {t.enAttenteDepense > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {mru(t.enAttenteDepense)} de dépenses en attente
                    </span>
                  )}
                  {t.enAttenteAlim > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                      {mru(t.enAttenteAlim)} d’alimentation demandés au directeur
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        {!superviseur && (
        <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total des caisses</span>
          <span className="text-3xl font-black tabular-nums">
            {grand < 0 ? '−' : ''}
            {mru(Math.abs(grand))} <span className="text-sm font-semibold text-slate-400">MRU</span>
          </span>
          <span className="text-xs text-slate-400">
            {pendingForMe.length ? `${pendingForMe.length} demande${pendingForMe.length > 1 ? 's attendent' : ' attend'} votre décision` : 'Aucune demande en attente pour vous'}
          </span>
        </div>
        )}
      </div>
      {superviseur && caisses.length === 0 && (
        <Card className="p-5 text-sm text-slate-600">
          Aucune caisse n’est encore à votre nom. Demandez à la comptabilité de vous désigner comme titulaire d’une caisse.
        </Card>
      )}

      {/* Actions */}
      {/* superviseur : dépenses seulement · comptable : dépenses + demande d'alimentation · directeur : alimentation */}
      <div className="flex flex-wrap gap-2">
        {(superviseur || compta) && caisses.length > 0 && (
          <>
            <Button icon={<ArrowUpRight className="w-4 h-4" />} onClick={() => setForm({ type: 'depense' })}>
              {compta ? 'Enregistrer une dépense' : 'Demander une dépense'}
            </Button>
            <Button variant="outline" icon={<ClipboardPaste className="w-4 h-4" />} onClick={() => setWaOpen(true)}>
              Coller WhatsApp
            </Button>
          </>
        )}
        {(compta || directeur) && (
          <Button
            variant="success"
            icon={<ArrowDownLeft className="w-4 h-4" />}
            onClick={() => setForm({ type: 'alimentation' })}
          >
            Alimenter une caisse
          </Button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit max-w-full overflow-x-auto scrollbar-hide">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
              {!!t.count && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500 text-white">{t.count}</span>}
            </button>
          ))}
      </div>

      {tab === 'valider' && (
        <ValidationList
          ops={pendingForMe.filter((o) => caisseFilter === 'all' || o.caisseId === caisseFilter)}
          caisseName={(id) => caisses.find((c) => c.id === id)?.nom ?? '—'}
          onApprove={async (ids) => {
            try {
              const n = await decide(ids, 'validee');
              showToast(n > 1 ? `${n} dépenses validées` : 'Dépense validée', 'success');
            } catch (e) {
              showToast(errMsg(e), 'error');
            }
          }}
          onValidateWithFrais={setValidateOp}
          onReject={setRejectIds}
          onFulfill={setFulfill}
          onOpen={setDetail}
        />
      )}

      {tab === 'mes' && (
        <Card>
          {myRequests.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-400">
              Vos demandes apparaîtront ici avec leur statut : en attente, validée ou refusée.
            </div>
          ) : (
            <OpRows ops={myRequests.slice(0, 60)} caisseName={(id) => caisses.find((c) => c.id === id)?.nom ?? '—'} onOpen={setDetail} showStatut />
          )}
        </Card>
      )}

      {tab === 'journal' && (
        <Journal caisses={caisses} operations={operations} caisseFilter={caisseFilter} setCaisseFilter={setCaisseFilter} onOpen={setDetail} />
      )}

      {tab === 'bilan' && <Bilan caisses={caisses} operations={operations} caisseFilter={caisseFilter} />}

      {/* Fenêtres */}
      {form && (
        <OperationModal
          key={form.editing?.id ?? form.type}
          open
          type={form.type}
          editing={form.editing}
          preferredCaisse={caisseFilter !== 'all' ? caisseFilter : null}
          onClose={() => setForm(null)}
        />
      )}
      {waOpen && <WhatsAppModal open onClose={() => setWaOpen(false)} preferredCaisse={caisseFilter !== 'all' ? caisseFilter : null} />}
      {rejectIds.length > 0 && <RejectModal ids={rejectIds} onClose={() => setRejectIds([])} />}
      {fulfill && <FulfillModal key={fulfill.id} op={fulfill} onClose={() => setFulfill(null)} />}
      {adminOpen && <CaissesAdminModal open onClose={() => setAdminOpen(false)} titulaires={titulaires} />}
      <ChargesFixesModal open={chargesFixesOpen} onClose={() => setChargesFixesOpen(false)} />
      {validateOp && (
        <ValidateAvecFraisModal
          op={validateOp}
          caisseName={caisses.find((c) => c.id === validateOp.caisseId)?.nom ?? '—'}
          onClose={() => setValidateOp(null)}
          onConfirm={async (frais, libelleFrais) => {
            try {
              await decide([validateOp.id], 'validee');
              if (frais > 0) {
                await addOperations([{
                  caisseId: validateOp.caisseId,
                  type: 'depense',
                  montant: frais,
                  date: validateOp.date,
                  libelle: libelleFrais || `Frais — ${validateOp.libelle}`,
                  categorie: validateOp.categorie,
                  chantier: validateOp.chantier,
                  note: `Frais liés à : ${validateOp.libelle}`,
                  statut: 'validee',
                }]);
                showToast(`Dépense validée + ${mru(frais)} MRU de frais déduits`, 'success');
              } else {
                showToast('Dépense validée', 'success');
              }
              setValidateOp(null);
            } catch (e) {
              showToast(errMsg(e), 'error');
            }
          }}
        />
      )}
      {detail && (
        <DetailModal
          op={detail}
          caisseName={caisses.find((c) => c.id === detail.caisseId)?.nom ?? '—'}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setForm({ type: detail.type, editing: detail });
            setDetail(null);
          }}
          onApprove={async () => {
            if (detail.type === 'alimentation') {
              setFulfill(detail);
              setDetail(null);
              return;
            }
            try {
              await decide([detail.id], 'validee');
              showToast('Dépense validée', 'success');
              setDetail(null);
            } catch (e) {
              showToast(errMsg(e), 'error');
            }
          }}
          onReject={() => {
            setRejectIds([detail.id]);
            setDetail(null);
          }}
          onCancel={async () => {
            try {
              await cancel(detail.id);
              showToast('Demande annulée', 'info');
              setDetail(null);
            } catch (e) {
              showToast(errMsg(e), 'error');
            }
          }}
          onDelete={async () => {
            try {
              await remove(detail.id);
              showToast('Opération supprimée', 'info');
              setDetail(null);
            } catch (e) {
              showToast(errMsg(e), 'error');
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Liste des demandes à valider ────────────────────────────────────────────
function ValidationList({
  ops,
  caisseName,
  onApprove,
  onValidateWithFrais,
  onReject,
  onFulfill,
  onOpen,
}: {
  ops: CaisseOperation[];
  caisseName: (id: string) => string;
  onApprove: (ids: string[]) => Promise<void>;
  onValidateWithFrais: (op: CaisseOperation) => void;
  onReject: (ids: string[]) => void;
  onFulfill: (op: CaisseOperation) => void;
  onOpen: (op: CaisseOperation) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const depenses = ops.filter((o) => o.type === 'depense');
  const alims = ops.filter((o) => o.type === 'alimentation');
  const selected = depenses.filter((o) => sel.has(o.id));
  const selTotal = selected.reduce((s, o) => s + o.montant, 0);
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!ops.length) {
    return (
      <Card className="py-14 text-center">
        <Inbox className="w-8 h-8 mx-auto text-slate-300" />
        <p className="mt-2 font-semibold text-slate-700">Tout est à jour</p>
        <p className="text-sm text-slate-400">Vous serez notifié dès qu’une nouvelle demande arrive.</p>
      </Card>
    );
  }

  const approve = async (ids: string[]) => {
    setBusy(true);
    await onApprove(ids);
    setSel(new Set());
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {alims.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Demandes d’alimentation</div>
          {alims.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(o)}>
                <p className="text-sm font-semibold text-slate-800">
                  <span className="tabular-nums">{mru(o.montant)} MRU</span> pour la caisse {caisseName(o.caisseId)}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  Demandé par {o.demandeParNom} · {shortDate(o.date)}
                  {o.note ? ` · ${o.note}` : ''}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onReject([o.id])}>
                Refuser
              </Button>
              <Button size="sm" variant="success" onClick={() => onFulfill(o)}>
                Effectuer
              </Button>
            </div>
          ))}
        </Card>
      )}

      {depenses.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={selected.length === depenses.length}
                onChange={(e) => setSel(e.target.checked ? new Set(depenses.map((o) => o.id)) : new Set())}
              />
              Dépenses à valider ({depenses.length})
            </label>
            {selected.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => onReject(selected.map((o) => o.id))}>
                  Refuser
                </Button>
                <Button size="sm" variant="success" disabled={busy} onClick={() => approve(selected.map((o) => o.id))}>
                  Valider {selected.length} · {mru(selTotal)}
                </Button>
              </div>
            )}
          </div>
          {depenses.map((o) => {
            const c = catOf(o.categorie);
            return (
              <div key={o.id} className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 ${sel.has(o.id) ? 'bg-blue-50/50' : ''}`}>
                <input type="checkbox" aria-label={`Sélectionner ${o.libelle}`} checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(o)}>
                  <div className="flex items-center gap-1.5 truncate">
                    <p className="text-sm font-semibold text-slate-800 truncate">{o.libelle}</p>
                    {o.source === 'charge_fixe' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                        Charge fixe
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: c.color }} />
                    {c.label} · {caisseName(o.caisseId)} · {o.demandeParNom} · {shortDate(o.date)}
                    {o.chantier ? ` · ${o.chantier}` : ''}
                  </p>
                </div>
                <Amount op={o} />
                <div className="hidden sm:flex gap-1">
                  <button aria-label="Refuser" onClick={() => onReject([o.id])} className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50">
                    <X className="w-4 h-4" />
                  </button>
                  <button aria-label="Valider" disabled={busy} onClick={() => onValidateWithFrais(o)} className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50">
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ─── Lignes d'opérations ────────────────────────────────────────────────────
function OpRows({
  ops,
  caisseName,
  onOpen,
  showStatut,
}: {
  ops: CaisseOperation[];
  caisseName: (id: string) => string;
  onOpen: (op: CaisseOperation) => void;
  showStatut?: boolean;
}) {
  return (
    <div>
      {ops.map((o) => {
        const c = catOf(o.categorie);
        const alim = o.type === 'alimentation';
        return (
          <button
            key={o.id}
            onClick={() => onOpen(o)}
            className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 text-left hover:bg-slate-50 ${alim ? 'bg-emerald-50/40' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: alim ? '#2E7D32' : c.color }} />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 truncate">
                <span>{alim ? o.libelle || 'Alimentation' : o.libelle}</span>
                {o.source === 'charge_fixe' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                    Charge fixe
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-500 truncate">
                {caisseName(o.caisseId)} · {alim ? 'Alimentation' : c.label}
                {o.chantier ? ` · ${o.chantier}` : ''}
                {showStatut ? ` · ${shortDate(o.date)}` : ''}
              </span>
            </span>
            {(showStatut || o.statut !== 'validee') && <StatutPill s={o.statut} />}
            <Amount op={o} />
          </button>
        );
      })}
    </div>
  );
}

// ─── Journal ────────────────────────────────────────────────────────────────
function Journal({
  caisses,
  operations,
  caisseFilter,
  setCaisseFilter,
  onOpen,
}: {
  caisses: Caisse[];
  operations: CaisseOperation[];
  caisseFilter: string;
  setCaisseFilter: (v: string) => void;
  onOpen: (op: CaisseOperation) => void;
}) {
  const [type, setType] = useState<'all' | CaisseOpType>('all');
  const [statut, setStatut] = useState<'all' | CaisseOperation['statut']>('all');
  const [month, setMonth] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const months = useMemo(() => [...new Set(operations.map((o) => o.date.slice(0, 7)))].sort().reverse(), [operations]);
  const caisseName = (id: string) => caisses.find((c) => c.id === id)?.nom ?? '—';

  const list = useMemo(() => {
    const s = q
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return operations.filter((o) => {
      if (caisseFilter !== 'all' && o.caisseId !== caisseFilter) return false;
      if (type !== 'all' && o.type !== type) return false;
      if (statut !== 'all' && o.statut !== statut) return false;
      if (month !== 'all' && !o.date.startsWith(month)) return false;
      if (cat !== 'all' && o.categorie !== cat) return false;
      if (s) {
        const hay = [o.libelle, o.chantier, o.note, o.demandeParNom, String(o.montant)]
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '');
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [operations, caisseFilter, type, statut, month, cat, q]);

  const byDay = useMemo(() => {
    const m = new Map<string, CaisseOperation[]>();
    list.forEach((o) => m.set(o.date, [...(m.get(o.date) ?? []), o]));
    return [...m.entries()];
  }, [list]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Select aria-label="Caisse" value={caisseFilter} onChange={(e) => setCaisseFilter(e.target.value)}>
          <option value="all">Toutes les caisses</option>
          {caisses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">Dépenses et alimentations</option>
          <option value="depense">Dépenses</option>
          <option value="alimentation">Alimentations</option>
        </Select>
        <Select aria-label="Statut" value={statut} onChange={(e) => setStatut(e.target.value as typeof statut)}>
          <option value="all">Tous statuts</option>
          {Object.entries(STATUT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label="Mois" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Tous les mois</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        <Select aria-label="Catégorie" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="journal-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher : carburant, Rosso, montant…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
          />
        </div>
      </div>

      {byDay.length === 0 ? (
        <Card className="py-14 text-center text-sm text-slate-400">
          {operations.length ? 'Aucune opération ne correspond à ces filtres.' : 'Aucune opération pour l’instant. Commencez par une dépense ou un collage WhatsApp.'}
        </Card>
      ) : (
        <Card>
          {byDay.map(([day, ops]) => {
            const out = ops.filter((o) => o.type === 'depense' && o.statut === 'validee').reduce((s, o) => s + o.montant, 0);
            const inn = ops.filter((o) => o.type === 'alimentation' && o.statut === 'validee').reduce((s, o) => s + o.montant, 0);
            return (
              <div key={day}>
                <div className="flex justify-between items-baseline px-4 pt-4 pb-1.5 border-b border-slate-100 bg-slate-50/60">
                  <span className="text-sm font-bold text-slate-700 capitalize">{dayLabel(day)}</span>
                  <span className="text-xs tabular-nums text-slate-500">
                    {out ? `−${mru(out)}` : ''}
                    {out && inn ? ' · ' : ''}
                    {inn ? <span className="text-emerald-700">+{mru(inn)}</span> : ''}
                  </span>
                </div>
                <OpRows ops={ops} caisseName={caisseName} onOpen={onOpen} />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ─── Bilan mensuel + export Excel ────────────────────────────────────────────
function Bilan({ caisses, operations, caisseFilter }: { caisses: Caisse[]; operations: CaisseOperation[]; caisseFilter: string }) {
  const { showToast } = useToast();
  const months = useMemo(() => [...new Set(operations.map((o) => o.date.slice(0, 7)))].sort().reverse(), [operations]);
  const [month, setMonth] = useState(() => months[0] ?? 'all');
  const inP = (o: CaisseOperation) => month === 'all' || o.date.startsWith(month);
  const before = soldes(caisses, operations, (o) => month !== 'all' && o.date < month + '-01');
  const during = soldes(caisses, operations, inP);
  const shown = caisses.filter((c) => caisseFilter === 'all' || c.id === caisseFilter);

  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    operations
      .filter((o) => o.type === 'depense' && o.statut === 'validee' && inP(o) && (caisseFilter === 'all' || o.caisseId === caisseFilter))
      .forEach((o) => (m[o.categorie] = (m[o.categorie] ?? 0) + o.montant));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [operations, month, caisseFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const catTotal = byCat.reduce((s, [, v]) => s + v, 0);
  const catMax = Math.max(1, ...byCat.map(([, v]) => v));

  const exportXlsx = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Bilan');
      ws.addRow([`Bilan des caisses — ${month === 'all' ? 'toute la période' : monthLabel(month)}`]).font = { bold: true, size: 14 };
      ws.addRow([]);
      ws.addRow(['Caisse', 'Solde début', 'Reçu', 'Dépensé', 'Solde fin', 'En attente']).font = { bold: true };
      shown.forEach((c) => {
        const o = before[c.id]?.solde ?? 0;
        const d = during[c.id];
        ws.addRow([c.nom, o, d.recu, d.depense, o + d.recu - d.depense, d.enAttenteDepense]);
      });
      ws.addRow([]);
      ws.addRow(['Catégorie', 'Montant', '%']).font = { bold: true };
      byCat.forEach(([k, v]) => ws.addRow([catOf(k).label, v, catTotal ? Math.round((v / catTotal) * 100) / 100 : 0]));
      ws.getColumn(1).width = 26;
      [2, 3, 4, 5, 6].forEach((i) => (ws.getColumn(i).numFmt = '#,##0'));
      ws.getColumn(3).numFmt = '#,##0';

      const wj = wb.addWorksheet('Journal');
      wj.addRow(['Date', 'Caisse', 'Type', 'Description', 'Catégorie', 'Lieu', 'Montant', 'Statut', 'Demandé par', 'Traité par', 'Motif refus', 'Note']).font = { bold: true };
      operations
        .filter((o) => inP(o) && (caisseFilter === 'all' || o.caisseId === caisseFilter))
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((o) =>
          wj.addRow([
            o.date,
            caisses.find((c) => c.id === o.caisseId)?.nom ?? '',
            o.type === 'depense' ? 'Dépense' : 'Alimentation',
            o.libelle,
            o.type === 'depense' ? catOf(o.categorie).label : '',
            o.chantier,
            o.type === 'depense' ? -o.montant : o.montant,
            STATUT_LABEL[o.statut],
            o.demandeParNom ?? '',
            o.traiteParNom ?? '',
            o.motifRejet ?? '',
            o.note,
          ]),
        );
      wj.getColumn(7).numFmt = '#,##0';
      wj.columns.forEach((c, i) => (c.width = [12, 14, 13, 30, 18, 14, 12, 12, 22, 14, 14, 20, 24][i] ?? 14));
      wj.views = [{ state: 'frozen', ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      downloadWorkbookBuffer(buf as ArrayBuffer, `caisses-${month === 'all' ? 'tout' : month}.xlsx`);
    } catch (e) {
      showToast('Export impossible — ' + errMsg(e), 'error');
    }
  };

  const lignes = shown.map((c) => {
    const o = before[c.id]?.solde ?? 0;
    const d = during[c.id];
    return { c, o, d, f: o + d.recu - d.depense };
  });
  const tot = lignes.reduce((t, l) => ({ o: t.o + l.o, r: t.r + l.d.recu, d: t.d + l.d.depense, a: t.a + l.d.enAttenteDepense }), { o: 0, r: 0, d: 0, a: 0 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Select aria-label="Période" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Toute la période</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={exportXlsx}>
          Exporter Excel
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-semibold">Caisse</th>
                <th className="text-right px-3 py-2.5 font-semibold">Solde début</th>
                <th className="text-right px-3 py-2.5 font-semibold">Reçu</th>
                <th className="text-right px-3 py-2.5 font-semibold">Dépensé</th>
                <th className="text-right px-3 py-2.5 font-semibold">Solde fin</th>
                <th className="text-right px-4 py-2.5 font-semibold">En attente</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {lignes.map(({ c, o, d, f }) => {
                return (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="px-4 py-2.5 font-sans font-semibold text-slate-800">{c.nom}</td>
                    <td className="text-right px-3">{mru(o)}</td>
                    <td className="text-right px-3 text-emerald-700">+{mru(d.recu)}</td>
                    <td className="text-right px-3">−{mru(d.depense)}</td>
                    <td className={`text-right px-3 font-bold ${f < 0 ? 'text-red-700' : ''}`}>{mru(f)}</td>
                    <td className="text-right px-4 text-amber-700">{d.enAttenteDepense ? mru(d.enAttenteDepense) : '—'}</td>
                  </tr>
                );
              })}
              {shown.length > 1 && (
                <tr className="font-bold">
                  <td className="px-4 py-2.5 font-sans">Total</td>
                  <td className="text-right px-3">{mru(tot.o)}</td>
                  <td className="text-right px-3">+{mru(tot.r)}</td>
                  <td className="text-right px-3">−{mru(tot.d)}</td>
                  <td className="text-right px-3">{mru(tot.o + tot.r - tot.d)}</td>
                  <td className="text-right px-4">{tot.a ? mru(tot.a) : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Dépenses validées par catégorie</h3>
        {byCat.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune dépense validée sur cette période.</p>
        ) : (
          <div className="space-y-2.5">
            {byCat.map(([k, v]) => {
              const c = catOf(k);
              return (
                <div key={k} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] gap-3 items-center text-sm">
                  <span className="text-slate-600 truncate">{c.label}</span>
                  <span className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(v / catMax) * 100}%`, background: c.color }} />
                  </span>
                  <span className="tabular-nums text-slate-800">
                    {mru(v)} <span className="text-slate-400 text-xs">{Math.round((v / catTotal) * 100)}%</span>
                  </span>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold">
              <span>Total</span>
              <span className="tabular-nums">{mru(catTotal)} MRU</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Détail d'une opération ─────────────────────────────────────────────────
function DetailModal({
  op,
  caisseName,
  onClose,
  onEdit,
  onApprove,
  onReject,
  onCancel,
  onDelete,
}: {
  op: CaisseOperation;
  caisseName: string;
  onClose: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const user = useAppStore((s) => s.user)!;
  // La comptable gère les dépenses, le directeur les alimentations
  const manager = op.type === 'depense' ? isComptable(user) : isDirecteur(user);
  const mine = op.demandeParId === user.id;
  const pending = op.statut === 'en_attente';
  const [armed, setArmed] = useState(false);
  const c = catOf(op.categorie);
  const row = (k: string, v: React.ReactNode) =>
    v ? (
      <div className="flex justify-between gap-4 py-2 border-b border-slate-100 text-sm">
        <span className="text-slate-500">{k}</span>
        <span className="text-slate-800 text-right">{v}</span>
      </div>
    ) : null;

  return (
    <Modal open onClose={onClose} title={op.type === 'alimentation' ? 'Alimentation' : op.libelle}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl font-black">
          <Amount op={op} /> <span className="text-sm text-slate-400 font-semibold">MRU</span>
        </span>
        <StatutPill s={op.statut} />
      </div>
      {row('Caisse', caisseName)}
      {row('Date', dayLabel(op.date))}
      {op.type === 'depense' && row('Catégorie', c.label)}
      {row('Lieu / chantier', op.chantier)}
      {row('Demandé par', op.demandeParNom)}
      {row(op.statut === 'rejetee' ? 'Refusé par' : 'Traité par', op.traiteParNom && `${op.traiteParNom}${op.traiteLe ? ' · ' + new Date(op.traiteLe).toLocaleDateString('fr-FR') : ''}`)}
      {row('Motif du refus', op.motifRejet)}
      {row('Note', op.note)}
      {row('Source', op.source === 'whatsapp' ? 'Message WhatsApp' : op.source === 'bankily' ? 'Reçu Bankily' : '')}

      <div className="flex flex-wrap gap-2 mt-5">
        {pending && canDecide(user, op) && (
          <>
            <Button variant="success" icon={<Check className="w-4 h-4" />} onClick={onApprove}>
              {op.type === 'alimentation' ? 'Effectuer' : 'Valider'}
            </Button>
            <Button variant="outline" icon={<X className="w-4 h-4" />} onClick={onReject}>
              Refuser
            </Button>
          </>
        )}
        {(manager || (mine && pending)) && (
          <Button variant="ghost" icon={<Pencil className="w-4 h-4" />} onClick={onEdit}>
            Modifier
          </Button>
        )}
        {mine && pending && (
          <Button variant="ghost" icon={<Undo2 className="w-4 h-4" />} onClick={onCancel}>
            Annuler la demande
          </Button>
        )}
        {manager && (
          <Button
            variant={armed ? 'danger' : 'ghost'}
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => (armed ? onDelete() : setArmed(true))}
            className="ml-auto"
          >
            {armed ? 'Confirmer la suppression' : 'Supprimer'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
// ─── Modal : valider une dépense + saisir des frais optionnels ───────────────
function ValidateAvecFraisModal({
  op,
  caisseName,
  onClose,
  onConfirm,
}: {
  op: CaisseOperation;
  caisseName: string;
  onClose: () => void;
  onConfirm: (frais: number, libelleFrais: string) => Promise<void>;
}) {
  const [frais, setFrais] = useState('');
  const [libelleFrais, setLibelleFrais] = useState('');
  const [saving, setSaving] = useState(false);
  const montantFrais = parseInt(frais.replace(/\D/g, ''), 10) || 0;
  const total = op.montant + montantFrais;

  const submit = async () => {
    setSaving(true);
    await onConfirm(montantFrais, libelleFrais.trim());
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title="✅ Valider la dépense">
      <div className="space-y-4">
        {/* Résumé dépense */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-0.5">
          <p className="text-sm font-semibold text-slate-800">{op.libelle}</p>
          <p className="text-xs text-slate-500">{caisseName} · {shortDate(op.date)}</p>
          <p className="text-lg font-black tabular-nums text-slate-900">−{mru(op.montant)} MRU</p>
        </div>

        {/* Frais optionnels */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Frais supplémentaires (optionnel)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={frais}
            onChange={(e) => setFrais(e.target.value)}
            placeholder="0 MRU"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xl font-black tabular-nums focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          {montantFrais > 0 && (
            <input
              type="text"
              value={libelleFrais}
              onChange={(e) => setLibelleFrais(e.target.value)}
              placeholder={`ex. Transport, remise en état…`}
              className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          )}
        </div>

        {/* Total */}
        {montantFrais > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <span className="text-amber-800 font-medium">Total déduit de la caisse</span>
            <span className="font-black tabular-nums text-amber-900">−{mru(total)} MRU</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 justify-center" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="success" className="flex-1 justify-center" onClick={submit} disabled={saving}>
            {saving ? 'Validation…' : montantFrais > 0 ? `Valider + ${mru(montantFrais)} frais` : 'Valider'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
