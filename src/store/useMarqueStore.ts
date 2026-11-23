import { create } from 'zustand';
import {
  ABONNEMENT_DEFAUT,
  MARQUE_DEFAUT,
  appliquerMarque,
  enregistrerMarque,
  lireMarque,
  marqueEnCache,
  type Abonnement,
  type Marque,
} from '@/lib/marque';

// Marque de l'entreprise (logo, couleurs, police, menus) : appliquée dès l'ouverture de
// l'application — d'abord celle gardée sur l'appareil, puis celle de la base.
interface MarqueState {
  marque: Marque;
  /** marque à l'écran : l'enregistrée, ou celle en cours de personnalisation (aperçu en direct) */
  affichee: Marque;
  abonnement: Abonnement;
  chargee: boolean;
  charger: () => Promise<void>;
  sauver: (m: Marque) => Promise<void>;
  /** aperçu en direct pendant la personnalisation (sans enregistrer) */
  apercu: (m: Marque) => void;
  /** fin de l'aperçu : revient à la marque enregistrée */
  finApercu: () => void;
}

const depart = marqueEnCache() ?? MARQUE_DEFAUT;
appliquerMarque(depart);

export const useMarqueStore = create<MarqueState>((set, get) => ({
  marque: depart,
  affichee: depart,
  abonnement: ABONNEMENT_DEFAUT,
  chargee: false,
  charger: async () => {
    try {
      const { marque, abonnement } = await lireMarque();
      appliquerMarque(marque);
      set({ marque, affichee: marque, abonnement, chargee: true });
    } catch {
      // table absente ou hors ligne : on garde la marque connue
      set({ chargee: true });
    }
  },
  sauver: async (m) => {
    const propre = await enregistrerMarque(m);
    appliquerMarque(propre);
    set({ marque: propre, affichee: propre });
  },
  apercu: (m) => {
    appliquerMarque(m, false);
    set({ affichee: m });
  },
  finApercu: () => {
    appliquerMarque(get().marque);
    set({ affichee: get().marque });
  },
}));
