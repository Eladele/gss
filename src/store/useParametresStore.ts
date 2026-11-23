import { create } from 'zustand';
import {
  BAREME_DEFAUT,
  BAREME_OT_DEFAUT,
  ENTETE_DEFAUT,
  MOTIFS_DEFAUT,
  REGLAGES_DEFAUT,
  enregistrerBareme,
  enregistrerMotifs,
  enregistrerBaremeOt,
  enregistrerEntete,
  enregistrerReglages,
  fetchParametres,
  type Bareme,
  type BaremeOT,
  type EnteteVirement,
  type MotifsProgramme,
  type Reglages,
} from '@/lib/parametresService';
import { appliquerMotifs } from '@/utils/programme';
import { REGLAGES_PROGRAMME, appliquerBareme, appliquerBaremeOt } from '@/utils/points';
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
  baremeOt: BaremeOT;
  entete: EnteteVirement;
  reglages: Reglages;
  motifs: MotifsProgramme;
  pret: boolean;
  charger: () => Promise<void>;
  sauverBareme: (parId: string, b: Bareme) => Promise<void>;
  sauverBaremeOt: (b: BaremeOT) => Promise<void>;
  sauverEntete: (parId: string, e: EnteteVirement) => Promise<void>;
  sauverReglages: (r: Reglages) => Promise<void>;
  sauverMotifs: (m: MotifsProgramme) => Promise<void>;
}

export const useParametresStore = create<ParametresState>((set) => ({
  bareme: { ...BAREME_DEFAUT },
  baremeOt: { ...BAREME_OT_DEFAUT },
  entete: { ...ENTETE_DEFAUT, banques: {} },
  reglages: { ...REGLAGES_DEFAUT },
  motifs: MOTIFS_DEFAUT,
  pret: false,
  charger: async () => {
    const p = await fetchParametres();
    appliquerBareme(p.bareme);
    appliquerBaremeOt(p.baremeOt);
    appliquerEnteteVirement(p.entete);
    appliquerReglages(p.reglages);
    appliquerMotifs(p.motifs.nonFait, p.motifs.fait);
    set({ bareme: p.bareme, baremeOt: p.baremeOt, entete: p.entete, reglages: p.reglages, motifs: p.motifs, pret: true });
  },
  sauverBareme: async (parId, b) => {
    const enregistre = await enregistrerBareme(parId, b);
    appliquerBareme(enregistre);
    set({ bareme: enregistre });
  },
  sauverBaremeOt: async (b) => {
    const enregistre = await enregistrerBaremeOt(b);
    appliquerBaremeOt(enregistre);
    set({ baremeOt: enregistre });
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
  sauverMotifs: async (m) => {
    const enregistre = await enregistrerMotifs(m);
    appliquerMotifs(enregistre.nonFait, enregistre.fait);
    set({ motifs: enregistre });
  },
}));
