import { create } from 'zustand';
import type { User, Situation, Notification, ImportRecord, Equipe } from '@/types';
import { SAMPLE_NOTIFICATIONS, ZONE_EQUIPE_MAP } from '@/data';
import {
  fetchSituations,
  updateSituationStatus,
  insertSituationsBulk,
  insertImportRecord,
  fetchEquipes,
  fetchImportHistory,
  createEquipe,
} from '@/lib/supabaseService';

interface AppState {
  currentUser: any;
  user: User | null;
  situations: Situation[];
  notifications: Notification[];
  importHistory: ImportRecord[];
  equipes: Equipe[];
  loading: boolean;
  // Auth
  login: (user: User) => void;
  logout: () => void;
  // Data loading
  loadAll: () => Promise<void>;
  // Situations
  markOK: (fgp: string) => Promise<void>;
  markNonOK: (fgp: string, comment: string) => Promise<void>;
  addUrgence: (zone: string, type: string, comment: string, equipe?: string) => Promise<void>;
  importSituations: (rows: Situation[], fileName: string) => Promise<void>;
  reassign: (fgp: string, equipe: string) => void;
  // Notifications
  addNotification: (title: string, message: string, type: Notification['type']) => void;
  markNotifRead: (id: number) => void;
  markAllRead: () => void;
  // Equipes
  addEquipe: (equipe: Partial<Equipe>) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  situations: [],
  notifications: [...SAMPLE_NOTIFICATIONS],
  importHistory: [],
  equipes: [],
  loading: false,

  login: (user) => {
    set({ user, notifications: [...SAMPLE_NOTIFICATIONS] });
    // Load real data from Supabase on login
    get().loadAll();
  },
  logout: () => set({ user: null, situations: [], importHistory: [], equipes: [] }),

  loadAll: async () => {
    set({ loading: true });
    try {
      const [situations, equipes, importHistory] = await Promise.all([
        fetchSituations(),
        fetchEquipes(),
        fetchImportHistory(),
      ]);
      set({ situations, equipes, importHistory });
    } catch (err) {
      console.error('loadAll error:', err);
    } finally {
      set({ loading: false });
    }
  },

  markOK: async (fgp) => {
    // Optimistic update
    set(s => ({
      situations: s.situations.map(sit =>
        sit.fgp === fgp ? { ...sit, status: 'ok', updatedAt: new Date().toISOString() } : sit
      )
    }));
    await updateSituationStatus(fgp, 'ok');
  },

  markNonOK: async (fgp, comment) => {
    // Optimistic update
    set(s => ({
      situations: s.situations.map(sit =>
        sit.fgp === fgp ? { ...sit, status: 'non_ok', comment, updatedAt: new Date().toISOString() } : sit
      )
    }));
    await updateSituationStatus(fgp, 'non_ok', comment);
    const sit = get().situations.find(s => s.fgp === fgp);
    get().addNotification('NON OK détecté', `FGP ${fgp} — ${sit?.zone} — ${comment}`, 'nok');
  },

  addUrgence: async (zone, type, comment, equipeOverride) => {
    const fgp = 'URG' + Date.now().toString().slice(-5);
    // Use override if given, otherwise fall back to zone map
    const zoneMap: Record<string, string> = {};
    get().equipes.forEach(e => (e.zones ?? []).forEach(z => { if (!zoneMap[z]) zoneMap[z] = e.name; }));
    const equipe = equipeOverride || ZONE_EQUIPE_MAP[zone] || zoneMap[zone] || '';
    const newSit: Situation = {
      id: 'urg-' + Date.now(),
      fgp, type: type as any, zone, equipe, motif: comment,
      dateDepo: new Date().toISOString().slice(0, 10),
      dateClt: '', delai: 0, status: 'urgent', comment: '', isUrgent: true,
    };
    set(s => ({ situations: [newSit, ...s.situations] }));
    get().addNotification('Nouvelle Urgence', `FGP ${fgp} — ${zone} — ${equipe || '?'}`, 'urgent');
    await insertSituationsBulk([newSit]);
  },

  importSituations: async (rows, fileName) => {
    const existing = new Set(get().situations.map(s => s.fgp));
    const newRows = rows.filter(r => !existing.has(r.fgp));
    const importRecord = {
      fileName,
      date: new Date().toLocaleString('fr-FR'),
      count: rows.length,
      by: get().user?.name || 'Inconnu',
    };
    // Optimistic update
    set(s => ({
      situations: [...s.situations, ...newRows],
      importHistory: [{ id: Date.now().toString(), ...importRecord }, ...s.importHistory],
    }));
    get().addNotification('Import réussi', `${newRows.length} nouvelles situations importées`, 'import');
    // Persist to Supabase
    if (newRows.length > 0) await insertSituationsBulk(newRows);
    await insertImportRecord(importRecord);
  },

  reassign: (fgp, equipe) => set(s => ({
    situations: s.situations.map(sit => sit.fgp === fgp ? { ...sit, equipe } : sit)
  })),

  addNotification: (title, message, type) => set(s => ({
    notifications: [{
      id: Date.now(), title, message, type,
      time: 'À l\'instant', read: false,
    }, ...s.notifications]
  })),

  markNotifRead: (id) => set(s => ({
    notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n)
  })),

  markAllRead: () => set(s => ({
    notifications: s.notifications.map(n => ({ ...n, read: true }))
  })),

  addEquipe: async (equipe) => {
    const newEquipe = await createEquipe(equipe);
    if (newEquipe) {
      set(s => ({ equipes: [...s.equipes, newEquipe] }));
      get().addNotification('Équipe créée', `L'équipe ${newEquipe.name} a été créée.`, 'ok');
    }
  },
}));
