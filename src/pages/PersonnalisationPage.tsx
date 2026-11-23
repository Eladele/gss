// Personnalisation de l'application de SON entreprise (super-administrateur) : les changements
// s'affichent en direct dans toute l'application, et sont enregistrés pour tous les utilisateurs.
import { useEffect } from 'react';
import { Palette } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useMarqueStore } from '@/store/useMarqueStore';
import { EmptyState } from '@/components/ui';
import { EditeurMarque } from '@/components/parametres/EditeurMarque';

export default function PersonnalisationPage() {
  const user = useAppStore((s) => s.user)!;
  const { marque, chargee, sauver, apercu, finApercu } = useMarqueStore();
  // en quittant la page sans enregistrer : retour à la marque enregistrée
  useEffect(() => finApercu, [finApercu]);

  if (!user.superadmin) return <EmptyState icon="" text="Réservé au super-administrateur." />;
  if (!chargee) return <p className="py-10 text-center text-sm text-slate-400">Chargement…</p>;
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
          <Palette className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Personnalisation</h1>
          <p className="text-sm text-slate-500">Nom, logo, couleurs, écriture et menus de l'application — pour tous les utilisateurs de cette entreprise.</p>
        </div>
      </div>
      <EditeurMarque initiale={marque} onEnregistrer={sauver} onChange={apercu} />
    </div>
  );
}
