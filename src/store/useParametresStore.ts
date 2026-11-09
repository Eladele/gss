import { create } from 'zustand';
import {
  BAREME_DEFAUT,
  ENTETE_DEFAUT,
  enregistrerBareme,
  enregistrerEntete,
  fetchParametres,
  type Bareme,
  type EnteteVirement,
} from '@/lib/parametresService';
import { appliquerBareme } from '@/utils/points';
import { appliquerEnteteVirement } from '@/utils/leaves';

// Paramètres de l'administrateur, chargés une fois à l'ouverture de l'application (avant
// l'affichage des pages) puis appliqués aux calculs de points et à l'export du virement.
interface ParametresState {
  bareme: Bareme;
  entete: EnteteVirement;
  pret: boolean;
  charger: () => Promise<void>;
  sauverBareme: (parId: string, b: Bareme) => Promise<void>;
  sauverEntete: (parId: string, e: EnteteVirement) => Promise<void>;
}

export const useParametresStore = create<ParametresState>((set) => ({
  bareme: { ...BAREME_DEFAUT },
  entete: { ...ENTETE_DEFAUT, banques: {} },
  pret: false,
  charger: async () => {
    const p = await fetchParametres();
    appliquerBareme(p.bareme);
    appliquerEnteteVirement(p.entete);
    set({ bareme: p.bareme, entete: p.entete, pret: true });
  },
  sauverBareme: async (parId, b) => {
    const enregistre = await enregistrerBareme(parId, b);
    appliquerBareme(enregistre);
    set({ bareme: enregistre });
  },
  sauverEntete: async (parId, e) => {
    const enregistre = await enregistrerEntete(parId, e);
    appliquerEnteteVirement(enregistre);
    set({ entete: enregistre });
  },
}));
