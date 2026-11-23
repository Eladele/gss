import { useMarqueStore } from '@/store/useMarqueStore';
import type { Marque } from '@/lib/marque';

/**
 * Logo de l'entreprise : son image si elle en a une, sinon un badge à son nom dans ses couleurs.
 * `marque` permet d'afficher une autre marque (aperçu de la personnalisation, entreprises clientes).
 */
export function LogoMarque({ taille = 'sm', marque, onClick }: { taille?: 'sm' | 'md' | 'lg'; marque?: Marque; onClick?: () => void }) {
  const courante = useMarqueStore((s) => s.affichee);
  const m = marque ?? courante;
  const h = taille === 'lg' ? 64 : taille === 'md' ? 40 : 30;
  if (m.logo) {
    return (
      <img
        src={m.logo}
        alt={m.nom}
        onClick={onClick}
        className={`object-contain shrink-0 ${onClick ? 'cursor-pointer' : ''} ${taille === 'lg' ? 'mx-auto' : ''}`}
        style={{ height: h, maxWidth: taille === 'lg' ? 220 : 110 }}
      />
    );
  }
  const grand = taille === 'lg';
  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center justify-center text-white font-black tracking-wider shrink-0 ${grand ? 'rounded-2xl px-4 text-xl' : taille === 'md' ? 'rounded-xl px-3 text-base' : 'rounded-lg px-2.5 text-sm'} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ height: h, minWidth: h, background: `linear-gradient(135deg, ${m.couleurPrincipale}, ${m.couleurSecondaire})` }}
    >
      {m.nom}
    </div>
  );
}
