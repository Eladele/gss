import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Equipe, User, Ville } from '@/types';

/** Noms courts d'une ville dans les fichiers (NDB, NKTT…) */
const NOMS_VILLE: Record<string, string[]> = {
  Nouakchott: ['nouakchott', 'nktt', 'nkc'],
  Nouadhibou: ['nouadhibou', 'ndb'],
  Kaédi: ['kaedi', 'keadi'],
  Rosso: ['rosso'],
};
const sansAccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/** « NDB », « Nouadhibou », « nouadhibou » → même ville */
export const memeVille = (texte: string | null | undefined, ville: string) =>
  !!texte && (NOMS_VILLE[ville] ?? [sansAccent(ville)]).includes(sansAccent(texte));

/** Ville d'une équipe (Nouakchott si non renseignée) */
export const villeEquipe = (e: Pick<Equipe, 'ville'>) => e.ville ?? 'Nouakchott';

/** Équipe de supervision (« SUPERVISION NDB ») : un compte, pas une équipe de terrain */
export const estEquipeSupervision = (nom?: string | null) => /^\s*supervision\b/i.test(nom ?? '');

/**
 * Ville d'un superviseur régional, d'après l'équipe de son compte : « SUPERVISION NDB » (ville NDB)
 * → Nouadhibou. Une supervision de Nouakchott garde toutes les villes.
 */
export function villeDeSupervision(user: Pick<User, 'teamId' | 'teamName'>, equipes: Equipe[]): Ville | undefined {
  const eq = equipes.find(
    (e) => (!!user.teamId && e.id === user.teamId) || (!!user.teamName && e.name.trim().toLowerCase() === user.teamName.trim().toLowerCase()),
  );
  if (!eq || !estEquipeSupervision(eq.name)) return undefined;
  const ville = villeEquipe(eq);
  return ville === 'Nouakchott' ? undefined : ville;
}

/**
 * Périmètre de l'utilisateur connecté. Un superviseur régional (ville attribuée dans
 * Paramètres, ex. Nouadhibou) ne voit et ne gère que les équipes de sa ville et leurs zones ;
 * sans ville : tout.
 */
export function usePerimetre() {
  const ville = useAppStore((s) => s.user?.villeScope);
  const toutes = useAppStore((s) => s.equipes);
  return useMemo(() => {
    // superviseur régional : les équipes de terrain de sa ville (pas l'équipe « SUPERVISION … »)
    const equipes = ville ? toutes.filter((e) => villeEquipe(e) === ville && !estEquipeSupervision(e.name)) : toutes;
    const noms = new Set(equipes.map((e) => e.name.trim().toLowerCase()));
    const zones = new Set(equipes.flatMap((e) => e.zones ?? []).map((z) => z.trim().toUpperCase()));
    const equipeOk = (nom?: string | null) => !ville || noms.has((nom ?? '').trim().toLowerCase());
    const zoneOk = (zone?: string | null) => !ville || zones.has((zone ?? '').trim().toUpperCase());
    return {
      /** ville du superviseur régional, sinon undefined */
      ville,
      /** équipes gérées (toutes sans restriction) */
      equipes,
      /** toutes les équipes (vue générale du tableau de bord) */
      toutes,
      equipeOk,
      zoneOk,
      /** fiche ou situation du périmètre : son équipe, à défaut sa zone */
      ficheOk: (o: { equipe?: string | null; zone?: string | null }) => !ville || (o.equipe ? equipeOk(o.equipe) : zoneOk(o.zone)),
      /** chantier du périmètre : sa ville, sa zone ou son équipe */
      chantierOk: (c: { ville?: string | null; zone?: string | null; equipeNom?: string | null }) =>
        !ville || memeVille(c.ville, ville) || (!!c.zone && zoneOk(c.zone)) || (!!c.equipeNom && equipeOk(c.equipeNom)),
    };
  }, [ville, toutes]);
}
