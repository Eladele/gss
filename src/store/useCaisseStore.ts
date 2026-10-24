import { create } from 'zustand';
import type { AppNotification, Caisse, CaisseChargeFixe, CaisseOperation, Role, User } from '@/types';
import { errMsg } from '@/utils';
import {
  fetchCaisses,
  fetchOperations,
  fetchNotifications,
  insertOperations,
  updateOperation,
  decideOperations,
  cancelOperation,
  deleteOperation,
  upsertCaisse,
  markNotificationsRead,
  subscribeCaisses,
  fetchChargesFixes,
  upsertChargeFixe,
  deleteChargeFixe,
  declencherUneChargeFixe,
  verifierEtDeclencherChargesFixes,
  type NewOperation,
} from '@/lib/caisseService';

// Circuit des caisses :
//   • superviseurs (admin, titulaires d'une caisse) → demandent des DÉPENSES uniquement ;
//   • comptable (rh)   → valide/refuse les dépenses, demande les ALIMENTATIONS au directeur ;
//   • directeur        → effectue (Trs ID) ou refuse les alimentations.
export const CAISSE_ROLES: Role[] = ['admin', 'rh', 'directeur'];
export const canUseCaisses = (role: Role) => CAISSE_ROLES.includes(role);
export const isComptable = (user: User) => user.role === 'rh';
export const isDirecteur = (user: User) => user.role === 'directeur';
export const isSuperviseurCaisse = (user: User) => user.role === 'admin';
/** Qui décide : la comptable pour les dépenses, le directeur pour les alimentations. */
export const canDecide = (user: User, op: CaisseOperation) =>
  op.demandeParId !== user.id && (op.type === 'depense' ? isComptable(user) : isDirecteur(user));

interface CaisseState {
  caisses: Caisse[];
  operations: CaisseOperation[];
  chargesFixes: CaisseChargeFixe[];
  notifications: AppNotification[];
  loaded: boolean;
  error: string | null;
  /** Dernière notification reçue en direct — l'en-tête l'affiche en toast */
  incoming: AppNotification | null;

  start: (user: User) => () => void;
  reload: () => Promise<void>;
  addOperations: (ops: NewOperation[]) => Promise<void>;
  editOperation: (id: string, patch: Parameters<typeof updateOperation>[1]) => Promise<void>;
  decide: (ids: string[], decision: 'validee' | 'rejetee', extra?: { motif?: string; trsId?: string }) => Promise<number>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saveCaisse: (c: Partial<Caisse> & { nom: string }) => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  triggerChargeFixe: (id: string) => Promise<void>;
  saveChargeFixe: (cf: Partial<CaisseChargeFixe> & { libelle: string; montant: number; caisseId: string }) => Promise<void>;
  removeChargeFixe: (id: string) => Promise<void>;
  checkChargesFixes: () => Promise<number>;
}

let currentUser: User | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

function me() {
  if (!currentUser) throw new Error('Session expirée, reconnectez-vous.');
  return { id: currentUser.id, name: currentUser.name };
}

// Alerte système (barre de notification du téléphone) quand l'appli n'est pas au premier plan
async function systemNotify(n: AppNotification) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // déjà affichée en toast
    const opts: NotificationOptions = { body: n.message, icon: 'pwa-icon-192.png', badge: 'pwa-icon-192.png', tag: n.id };
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(n.titre, opts);
    else new Notification(n.titre, opts);
  } catch {
    // alerte système refusée ou indisponible : le badge et la liste restent à jour
  }
}

export const useCaisseStore = create<CaisseState>()((set, get) => ({
  caisses: [],
  operations: [],
  chargesFixes: [],
  notifications: [],
  loaded: false,
  error: null,
  incoming: null,

  start: (user) => {
    currentUser = user;
    const withCaisses = canUseCaisses(user.role);
    fetchNotifications(user.id).then((notifications) => set({ notifications }));
    if (withCaisses) {
      get().reload().then(() => {
        // Vérifie si des charges fixes sont dues aujourd'hui (lundi matin, jeudi matin, 1er du mois)
        verifierEtDeclencherChargesFixes().then((n) => {
          if (n > 0) get().reload();
        });
      });
    }

    const scheduleReload = () => {
      if (!withCaisses) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => get().reload(), 400);
    };
    const unsubscribe = subscribeCaisses(user.id, {
      onNotification: (n) => {
        set((s) => ({ notifications: [n, ...s.notifications.filter((x) => x.id !== n.id)], incoming: n }));
        if ('vibrate' in navigator) navigator.vibrate?.(120);
        systemNotify(n);
      },
      onOperationsChanged: scheduleReload,
    });
    // Filet de sécurité si le temps réel est coupé (réseau mobile) : resynchronise chaque minute
    const poll = setInterval(() => {
      fetchNotifications(user.id).then((notifications) => set({ notifications }));
      scheduleReload();
    }, 60_000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(user.id).then((notifications) => set({ notifications }));
        scheduleReload();
      }
    };
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onFocus);
      currentUser = null;
      set({ caisses: [], operations: [], chargesFixes: [], notifications: [], loaded: false, error: null, incoming: null });
    };
  },

  reload: async () => {
    try {
      const [caisses, operations, chargesFixes] = await Promise.all([
        fetchCaisses(),
        fetchOperations(),
        fetchChargesFixes(),
      ]);
      set({ caisses, operations, chargesFixes, loaded: true, error: null });
    } catch (err) {
      set({ loaded: true, error: errMsg(err, 'Chargement impossible') });
    }
  },

  addOperations: async (ops) => {
    const created = await insertOperations(ops, me());
    set((s) => ({ operations: [...created, ...s.operations] }));
  },

  editOperation: async (id, patch) => {
    await updateOperation(id, patch);
    await get().reload();
  },

  decide: async (ids, decision, extra) => {
    const n = await decideOperations(ids, decision, me(), extra);
    await get().reload();
    return n;
  },

  cancel: async (id) => {
    await cancelOperation(id);
    await get().reload();
  },

  remove: async (id) => {
    await deleteOperation(id);
    set((s) => ({ operations: s.operations.filter((o) => o.id !== id) }));
  },

  saveCaisse: async (c) => {
    await upsertCaisse(c);
    await get().reload();
  },

  markRead: async (ids) => {
    set((s) => ({ notifications: s.notifications.map((n) => (ids.includes(n.id) ? { ...n, lu: true } : n)) }));
    await markNotificationsRead(ids);
  },

  markAllRead: async () => {
    const ids = get().notifications.filter((n) => !n.lu).map((n) => n.id);
    await get().markRead(ids);
  },

  triggerChargeFixe: async (id) => {
    const cf = get().chargesFixes.find((c) => c.id === id);
    if (!cf) throw new Error('Charge fixe introuvable');
    await declencherUneChargeFixe(cf, me());
    await get().reload();
  },

  saveChargeFixe: async (cf) => {
    await upsertChargeFixe(cf);
    await get().reload();
  },

  removeChargeFixe: async (id) => {
    await deleteChargeFixe(id);
    set((s) => ({ chargesFixes: s.chargesFixes.filter((c) => c.id !== id) }));
  },

  checkChargesFixes: async () => {
    const count = await verifierEtDeclencherChargesFixes();
    if (count > 0) await get().reload();
    return count;
  },
}));
