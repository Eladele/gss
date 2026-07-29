import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Situation, Notification, ImportRecord, Equipe, Employee, LeaveRecord, Vehicle, Materiel, ScanRecord, Loan } from '@/types';
import type { ScanImportSnapshot } from '@/lib/supabaseService';
import { SAMPLE_NOTIFICATIONS, ZONE_EQUIPE_MAP } from '@/data';
import {
  fetchSituations,
  updateSituationStatus,
  insertSituationsBulk,
  insertImportRecord,
  deleteImportRecord,
  reassignSituationEquipe,
  fetchEquipes,
  fetchImportHistory,
  createEquipe,
  fetchEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fetchLeaves,
  createLeave,
  updateLeave,
  deleteLeave,
  updateEquipe,
  deleteEquipe,
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchMateriels,
  createMateriel,
  updateMateriel,
  deleteMateriel,
  fetchScans,
  bulkInsertScans,
  clearScans,
  deleteScan,
  fetchScanImportHistory,
  insertScanImportSnapshot,
  deleteScanImportSnapshot,
  fetchLoans,
  createLoan,
  recordLoanPayment as recordLoanPaymentService,
} from '@/lib/supabaseService';

interface AppState {
  currentUser: unknown;
  user: User | null;
  situations: Situation[];
  notifications: Notification[];
  importHistory: ImportRecord[];
  equipes: Equipe[];
  employees: Employee[];
  leaves: LeaveRecord[];
  loans: Loan[];
  vehicles: Vehicle[];
  materiels: Materiel[];
  scans: ScanRecord[];
  scanHistory: ScanImportSnapshot[];
  loading: boolean;
  // Auth
  login: (user: User) => void;
  logout: () => void;
  // Data loading
  loadAll: () => Promise<void>;
  // Situations
  markOK: (
    id: string,
    details?: {
      poteau?: number;
      equipe?: string;
      motif?: string;
      dateClt?: string;
      rxDbm?: number;
      rangingM?: number;
      scanStatut?: 'SCANNE' | 'NON SCANE';
    },
  ) => Promise<void>;
  markNonOK: (id: string, comment: string) => Promise<void>;
  addUrgence: (zone: string, type: string, comment: string, equipe?: string) => Promise<void>;
  importSituations: (rows: Situation[], fileName: string) => Promise<void>;
  removeImportRecord: (id: string) => Promise<void>;
  reassign: (id: string, equipe: string) => void;
  // Notifications
  addNotification: (title: string, message: string, type: Notification['type']) => void;
  markNotifRead: (id: number) => void;
  markAllRead: () => void;
  // Equipes
  addEquipe: (equipe: Partial<Equipe>) => Promise<void>;
  editEquipe: (id: string, equipe: Partial<Equipe>) => Promise<void>;
  removeEquipe: (id: string) => Promise<void>;
  // Employés & congés (admin uniquement)
  loadEmployees: () => Promise<void>;
  addEmployee: (emp: Partial<Employee>) => Promise<void>;
  editEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
  addLeave: (leave: Partial<LeaveRecord>) => Promise<void>;
  editLeave: (id: string, leave: Partial<LeaveRecord>) => Promise<void>;
  removeLeave: (id: string) => Promise<void>;
  addLoan: (loan: {
    employeeId: string;
    montantTotal: number;
    mensualite: number;
    dateDebut: string;
    dureeMois?: number;
    banqueCaisse?: string;
  }) => Promise<void>;
  recordLoanPayment: (loanId: string, month: string) => Promise<void>;
  // Véhicules (admin uniquement)
  loadVehicles: () => Promise<void>;
  addVehicle: (v: Partial<Vehicle>) => Promise<void>;
  editVehicle: (id: string, v: Partial<Vehicle>) => Promise<void>;
  removeVehicle: (id: string) => Promise<void>;
  // Matériel des équipes (admin uniquement)
  loadMateriels: () => Promise<void>;
  addMateriel: (m: Partial<Materiel>) => Promise<void>;
  editMateriel: (id: string, m: Partial<Materiel>) => Promise<void>;
  removeMateriel: (id: string) => Promise<void>;
  // Scans réseau (admin uniquement)
  loadScans: () => Promise<void>;
  importScans: (rows: Partial<ScanRecord>[], replace?: boolean) => Promise<number>;
  removeScan: (id: string) => Promise<void>;
  loadScanHistory: () => Promise<void>;
  removeScanSnapshot: (id: string) => Promise<void>;
  clearAllScans: () => Promise<void>;
  recordScanSnapshot: (stats: {
    total: number;
    scanne: number;
    nonScanne: number;
    excellent: number;
    moyen: number;
    degrade: number;
    resilies?: number;
    diff?: {
      nouveaux: number;
      nouveauxScanne: number;
      nouveauxNonScanne: number;
      disparus: number;
      passesNonScanne: number;
      passesScanne: number;
      signalDegrade: number;
      signalAmeliore: number;
    } | null;
  }) => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      user: null,
      situations: [],
      notifications: [...SAMPLE_NOTIFICATIONS],
      importHistory: [],
      equipes: [],
      employees: [],
      leaves: [],
      loans: [],
      vehicles: [],
      materiels: [],
      scans: [],
      scanHistory: [],
      loading: false,

      login: (user) => {
        set({ user, notifications: [...SAMPLE_NOTIFICATIONS] });
        // Load real data from Supabase on login
        get().loadAll();
      },
      logout: () =>
        set({
          user: null,
          situations: [],
          importHistory: [],
          equipes: [],
          employees: [],
          leaves: [],
          loans: [],
          vehicles: [],
          materiels: [],
          scans: [],
          scanHistory: [],
        }),

      loadAll: async () => {
        set({ loading: true });
        try {
          const [situations, equipes, importHistory] = await Promise.all([fetchSituations(), fetchEquipes(), fetchImportHistory()]);
          set({ situations, equipes, importHistory });
        } catch (err) {
          console.error('loadAll error:', err);
        } finally {
          set({ loading: false });
        }
      },

      markOK: async (id, details) => {
        const today = new Date().toISOString().slice(0, 10);
        const previous = get().situations.find((s) => s.id === id);
        if (!previous) return;
        const newDateClt = details?.dateClt || previous.dateClt || today;
        const closedByName = get().user?.name;
        // Optimistic update — la "DATE MISE EN SERVICE" est posée automatiquement
        // à la date système dès qu'une situation (installation ou dérangement) passe OK,
        // sauf si une date a été saisie dans le formulaire de clôture.
        // Ciblée par id (et non fgp) : un même FGP peut avoir plusieurs situations actives
        // en parallèle (types/motifs différents), il ne faut affecter QUE celle cliquée.
        set((s) => ({
          situations: s.situations.map((sit) =>
            sit.id === id
              ? {
                  ...sit,
                  status: 'ok',
                  updatedAt: new Date().toISOString(),
                  dateClt: newDateClt,
                  poteau: details?.poteau ?? sit.poteau,
                  equipe: details?.equipe ?? sit.equipe,
                  motif: details?.motif ?? sit.motif,
                  rxDbm: details?.rxDbm ?? sit.rxDbm,
                  rangingM: details?.rangingM ?? sit.rangingM,
                  scanStatut: details?.scanStatut ?? sit.scanStatut,
                  closedBy: closedByName ?? sit.closedBy,
                }
              : sit,
          ),
        }));
        try {
          await updateSituationStatus(id, 'ok', '', newDateClt, {
            poteau: details?.poteau,
            equipe: details?.equipe,
            motif: details?.motif,
            rxDbm: details?.rxDbm ?? null,
            rangingM: details?.rangingM ?? null,
            scanStatut: details?.scanStatut ?? null,
            closedBy: closedByName ?? null,
          });
        } catch (err: any) {
          // Échec réel en base — on annule la mise à jour visuelle pour ne pas laisser
          // croire à un succès (ex: contrainte d'unicité violée, RLS...).
          set((s) => ({ situations: s.situations.map((sit) => (sit.id === id ? previous : sit)) }));
          get().addNotification('Échec', err?.message || "Le statut n'a pas pu être enregistré", 'nok');
          throw err;
        }
      },

      markNonOK: async (id, comment) => {
        const previous = get().situations.find((s) => s.id === id);
        if (!previous) return;
        // Optimistic update
        set((s) => ({
          situations: s.situations.map((sit) =>
            sit.id === id ? { ...sit, status: 'non_ok', comment, updatedAt: new Date().toISOString() } : sit,
          ),
        }));
        try {
          await updateSituationStatus(id, 'non_ok', comment);
          get().addNotification('NON OK détecté', `FGP ${previous.fgp} — ${previous.zone} — ${comment}`, 'nok');
        } catch (err: any) {
          set((s) => ({ situations: s.situations.map((sit) => (sit.id === id ? previous : sit)) }));
          get().addNotification('Échec', err?.message || "Le statut n'a pas pu être enregistré", 'nok');
          throw err;
        }
      },

      addUrgence: async (zone, type, comment, equipeOverride) => {
        const fgp = 'URG' + Date.now().toString().slice(-5);
        // Use override if given, otherwise fall back to zone map
        const zoneMap: Record<string, string> = {};
        get().equipes.forEach((e) =>
          (e.zones ?? []).forEach((z) => {
            if (!zoneMap[z]) zoneMap[z] = e.name;
          }),
        );
        const equipe = equipeOverride || ZONE_EQUIPE_MAP[zone] || zoneMap[zone] || '';
        const newSit: Situation = {
          id: 'urg-' + Date.now(),
          fgp,
          type: type as any,
          zone,
          equipe,
          motif: comment,
          dateDepo: new Date().toISOString().slice(0, 10),
          dateClt: '',
          delai: 0,
          status: 'urgent',
          comment: '',
          isUrgent: true,
        };
        set((s) => ({ situations: [newSit, ...s.situations] }));
        get().addNotification('Nouvelle Urgence', `FGP ${fgp} — ${zone} — ${equipe || '?'}`, 'urgent');
        await insertSituationsBulk([newSit]);
      },

      importSituations: async (rows, fileName) => {
        const existing = new Set(get().situations.map((s) => s.fgp));
        const newRows = rows.filter((r) => !existing.has(r.fgp));
        const importRecord = {
          fileName,
          date: new Date().toLocaleString('fr-FR'),
          count: rows.length,
          by: get().user?.name || 'Inconnu',
        };
        try {
          // Persist to Supabase D'ABORD — si ça échoue, on ne met pas à jour l'UI ni
          // l'historique, pour ne jamais afficher un faux "succès".
          const savedRecord = await insertImportRecord(importRecord);
          const importId = savedRecord?.id;

          const newRowsWithImportId = newRows.map((r) => ({
            ...r,
            importId,
          }));

          if (newRowsWithImportId.length > 0) {
            await insertSituationsBulk(newRowsWithImportId);
          }

          set((s) => ({
            situations: [...s.situations, ...newRowsWithImportId],
            // On utilise le VRAI id renvoyé par la base (pas un id local temporaire),
            // sinon un "Supprimer" fait dans la foulée (sans refresh) cible le mauvais
            // enregistrement et ne supprime rien côté base.
            importHistory: [savedRecord ?? { id: Date.now().toString(), ...importRecord }, ...s.importHistory],
          }));
          get().addNotification('Import réussi', `${newRowsWithImportId.length} nouvelles situations importées`, 'import');
        } catch (err: any) {
          console.error('importSituations failed:', err);
          get().addNotification('Échec de l\'import', err?.message || 'Les situations n\'ont pas pu être enregistrées', 'nok');
          throw err;
        }
      },

      removeImportRecord: async (id) => {
        try {
          await deleteImportRecord(id);
          set((s) => ({
            importHistory: s.importHistory.filter((h) => h.id !== id),
            situations: s.situations.filter((sit) => sit.importId !== id),
          }));
        } catch (err: any) {
          console.error('removeImportRecord failed:', err);
          get().addNotification('Suppression impossible', err?.message || "La ligne n'a pas pu être supprimée en base", 'nok');
          throw err;
        }
      },

      reassign: (id, equipe) => {
        set((s) => ({
          situations: s.situations.map((sit) => (sit.id === id ? { ...sit, equipe } : sit)),
        }));
        reassignSituationEquipe(id, equipe);
      },

      addNotification: (title, message, type) =>
        set((s) => ({
          notifications: [
            {
              id: Date.now(),
              title,
              message,
              type,
              time: "À l'instant",
              read: false,
            },
            ...s.notifications,
          ],
        })),

      markNotifRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),

      addEquipe: async (equipe) => {
        const newEquipe = await createEquipe(equipe);
        if (newEquipe) {
          set((s) => ({ equipes: [...s.equipes, newEquipe] }));
          get().addNotification('Équipe créée', `L'équipe ${newEquipe.name} a été créée.`, 'ok');
        }
      },

      editEquipe: async (id, equipe) => {
        await updateEquipe(id, equipe);
        set((s) => ({ equipes: s.equipes.map((e) => (e.id === id ? { ...e, ...equipe } : e)) }));
        get().addNotification('Équipe modifiée', `Les informations de l'équipe ont été mises à jour.`, 'ok');
      },

      removeEquipe: async (id) => {
        await deleteEquipe(id);
        set((s) => ({ equipes: s.equipes.filter((e) => e.id !== id) }));
      },

      // ─── Employés, congés & prêts ─────────────────────────────────────────
      loadEmployees: async () => {
        const [employees, leaves, loans] = await Promise.all([fetchEmployees(), fetchLeaves(), fetchLoans()]);
        set({ employees, leaves, loans });
      },

      addEmployee: async (emp) => {
        const newEmp = await createEmployee(emp);
        if (newEmp) {
          set((s) => ({ employees: [...s.employees, newEmp] }));
          get().addNotification('Employé ajouté', `${newEmp.name} a été ajouté.`, 'ok');
        }
      },

      editEmployee: async (id, emp) => {
        await updateEmployee(id, emp);
        set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...emp } : e)) }));
      },

      removeEmployee: async (id) => {
        await deleteEmployee(id);
        set((s) => ({
          employees: s.employees.filter((e) => e.id !== id),
          leaves: s.leaves.filter((l) => l.employeeId !== id),
        }));
      },

      addLeave: async (leave) => {
        const withAuthor = { ...leave, createdBy: get().user?.name || 'Inconnu' };
        const newLeave = await createLeave(withAuthor);
        if (newLeave) {
          set((s) => ({ leaves: [newLeave, ...s.leaves] }));
          get().addNotification('Congé enregistré', `Congé ${newLeave.type} ajouté.`, 'ok');
        }
      },

      editLeave: async (id, leave) => {
        await updateLeave(id, leave);
        set((s) => ({ leaves: s.leaves.map((l) => (l.id === id ? { ...l, ...leave } : l)) }));
      },

      removeLeave: async (id) => {
        await deleteLeave(id);
        set((s) => ({ leaves: s.leaves.filter((l) => l.id !== id) }));
      },

      addLoan: async (loan) => {
        const newLoan = await createLoan(loan);
        if (newLoan) {
          set((s) => ({ loans: [newLoan, ...s.loans] }));
          get().addNotification('Prêt enregistré', `Prêt ajouté pour un montant de ${newLoan.montantTotal} MRU.`, 'ok');
        }
      },

      recordLoanPayment: async (loanId, month) => {
        const loan = get().loans.find((l) => l.id === loanId);
        if (!loan) return;
        const montant = Math.min(loan.mensualite, loan.reste);
        const newReste = Math.max(0, loan.reste - loan.mensualite);
        try {
          await recordLoanPaymentService(loanId, month, montant, newReste);
          set((s) => ({
            loans: s.loans.map((l) => (l.id === loanId ? { ...l, reste: newReste, statut: newReste <= 0 ? 'solde' : 'actif' } : l)),
          }));
          get().addNotification('Mensualité prélevée', `${montant} MRU déduits — reste ${newReste} MRU.`, 'ok');
        } catch (err: any) {
          get().addNotification('Échec', err?.message || 'Mensualité déjà enregistrée pour ce mois ?', 'nok');
          throw err;
        }
      },

      // ─── Véhicules ────────────────────────────────────────────────────────────
      loadVehicles: async () => {
        const vehicles = await fetchVehicles();
        set({ vehicles });
      },

      addVehicle: async (v) => {
        const newVehicle = await createVehicle(v);
        if (newVehicle) {
          set((s) => ({ vehicles: [...s.vehicles, newVehicle] }));
          get().addNotification('Véhicule ajouté', `${newVehicle.type} (${newVehicle.immatriculation}) ajouté.`, 'ok');
        }
      },

      editVehicle: async (id, v) => {
        await updateVehicle(id, v);
        set((s) => ({ vehicles: s.vehicles.map((x) => (x.id === id ? { ...x, ...v } : x)) }));
      },

      removeVehicle: async (id) => {
        await deleteVehicle(id);
        set((s) => ({ vehicles: s.vehicles.filter((x) => x.id !== id) }));
      },

      // ─── Matériel des équipes ──────────────────────────────────────────────────
      loadMateriels: async () => {
        const materiels = await fetchMateriels();
        set({ materiels });
      },

      addMateriel: async (m) => {
        const newM = await createMateriel(m);
        if (newM) {
          set((s) => ({ materiels: [...s.materiels, newM] }));
          get().addNotification('Matériel ajouté', `${newM.nom} (${newM.equipeNom || 'stock'}) ajouté.`, 'ok');
        }
      },

      editMateriel: async (id, m) => {
        await updateMateriel(id, m);
        set((s) => ({ materiels: s.materiels.map((x) => (x.id === id ? { ...x, ...m } : x)) }));
      },

      removeMateriel: async (id) => {
        await deleteMateriel(id);
        set((s) => ({ materiels: s.materiels.filter((x) => x.id !== id) }));
      },

      // ─── Scans réseau (ONU/OLT) ─────────────────────────────────────────────────
      loadScans: async () => {
        const scans = await fetchScans();
        set({ scans });
      },

      importScans: async (rows, replace = true) => {
        if (replace) await clearScans();
        const inserted = await bulkInsertScans(rows);
        await get().loadScans();
        get().addNotification('Scan réseau importé', `${inserted} lignes importées.`, 'import');
        return inserted;
      },

      removeScan: async (id) => {
        await deleteScan(id);
        set((s) => ({ scans: s.scans.filter((x) => x.id !== id) }));
      },

      loadScanHistory: async () => {
        const scanHistory = await fetchScanImportHistory();
        set({ scanHistory });
      },

      removeScanSnapshot: async (id) => {
        await deleteScanImportSnapshot(id);
        set((s) => ({ scanHistory: s.scanHistory.filter((h) => h.id !== id) }));
      },

      clearAllScans: async () => {
        await clearScans();
        set({ scans: [] });
      },

      recordScanSnapshot: async (stats) => {
        await insertScanImportSnapshot(stats);
        await get().loadScanHistory();
      },
    }),
    {
      name: 'gss-app-storage', // clé localStorage — conserve la session + un cache local
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        situations: state.situations,
        equipes: state.equipes,
        importHistory: state.importHistory,
        employees: state.employees,
        leaves: state.leaves,
        loans: state.loans,
        vehicles: state.vehicles,
        materiels: state.materiels,
      }),
      // Après un refresh : on garde la session (pas de retour forcé au login),
      // puis on resynchronise avec Supabase en tâche de fond.
      onRehydrateStorage: () => (state) => {
        if (state?.user) {
          state.loadAll();
          if (state.user.role === 'admin') {
            state.loadEmployees();
            state.loadVehicles();
            state.loadMateriels();
          }
        }
      },
    },
  ),
);