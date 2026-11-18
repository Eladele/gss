import { create } from 'zustand';
import {
  BAREME_DEFAUT,
  ENTETE_DEFAUT,
  REGLAGES_DEFAUT,
  enregistrerBareme,
  enregistrerEntete,
  enregistrerReglages,
  fetchParametres,
  type Bareme,
  type EnteteVirement,
  type Reglages,
} from '@/lib/parametresService';
import { REGLAGES_PROGRAMME, appliquerBareme } from '@/utils/points';
import { appliquerEnteteVirement } from '@/utils/leaves';
import { appliquerJoursFeries } from '@/utils/stats';

/** Réglages généraux appliqués aux calculs (heure du soir, renvoi des non faites, jours fériés) */
function appliquerReglages(r: Reglages) {
  REGLAGES_PROGRAMME.heureSoir = r.heureProgrammeSoir;
  REGLAGES_PROGRAMME.joursNonFaites = r.joursNonFaites;
  appliquerJoursFeries(r.joursFeries);
}

// Paramètres de l'administrateur, chargés une fois à l'ouverture de l'application (avant
// l'affichage des pages) puis appliqués aux calculs de points et à l'export du virement.
interface ParametresState {
  bareme: Bareme;
  entete: EnteteVirement;
  reglages: Reglages;
  pret: boolean;
  charger: () => Promise<void>;
  sauverBareme: (parId: string, b: Bareme) => Promise<void>;
  sauverEntete: (parId: string, e: EnteteVirement) => Promise<void>;
  sauverReglages: (r: Reglages) => Promise<void>;
}

export const useParametresStore = create<ParametresState>((set) => ({
  bareme: { ...BAREME_DEFAUT },
  entete: { ...ENTETE_DEFAUT, banques: {} },
  reglages: { ...REGLAGES_DEFAUT },
  pret: false,
  charger: async () => {
    const p = await fetchParametres();
    appliquerBareme(p.bareme);
    appliquerEnteteVirement(p.entete);
    appliquerReglages(p.reglages);
    set({ bareme: p.bareme, entete: p.entete, reglages: p.reglages, pret: true });
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
  sauverReglages: async (r) => {
    const enregistre = await enregistrerReglages(r);
    appliquerReglages(enregistre);
    set({ reglages: enregistre });
  },
}));
