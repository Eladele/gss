import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getEquipeColor } from '@/utils';
import { ProgressBar, ZoneChip, EmptyState } from '@/components/ui';

function CreateEquipeModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const addEquipe = useAppStore(s => s.addEquipe);
  const [name, setName] = useState('');
  const [leader, setLeader] = useState('');
  const [color, setColor] = useState('#1565C0');
  const [elementsText, setElementsText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !leader.trim()) return;

    setLoading(true);
    const elements = elementsText.split(',').map(e => e.trim()).filter(Boolean);
    
    await addEquipe({
      name: name.trim(),
      leader: leader.trim(),
      color,
      elements,
      zones: []
    });

    setLoading(false);
    onClose();
    // reset form
    setName('');
    setLeader('');
    setColor('#1565C0');
    setElementsText('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-800">Créer une Équipe</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Nom de l'équipe</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} 
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                   placeholder="Ex: Equipe Alpha" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Chef d'équipe</label>
            <input required type="text" value={leader} onChange={e => setLeader(e.target.value)} 
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                   placeholder="Ex: Ahmed" />
            <p className="text-[10px] text-slate-400 mt-1">Un profil sera automatiquement créé pour le chef avec le mot de passe "chef2026".</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Éléments (séparés par des virgules)</label>
            <textarea value={elementsText} onChange={e => setElementsText(e.target.value)} rows={2}
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                   placeholder="Ex: Ali, Omar, Fatima" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Couleur</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} 
                   className="w-full h-10 p-1 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer" />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} 
                    className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
                    className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? 'Création...' : 'Créer l\'équipe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EquipesPage() {
  const situations = useAppStore(s => s.situations);
  const equipes    = useAppStore(s => s.equipes);
  const loading    = useAppStore(s => s.loading);
  const user       = useAppStore(s => s.user);
  
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canCreate = user?.role === 'superviseur' || user?.role === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="text-3xl animate-spin">⏳</span>
        <span className="ml-3">Chargement des équipes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Équipes</h1>
          <p className="text-slate-400 text-sm mt-0.5">{equipes.length} équipes · {situations.length} situations</p>
        </div>
        
        {canCreate && (
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
            <span>+</span> Créer une Équipe
          </button>
        )}
      </div>

      {equipes.length === 0 ? (
        <EmptyState icon="👥" text="Aucune équipe trouvée. Vérifiez que les données sont bien dans Supabase." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {equipes.map(eq => {
            const eqSits = situations.filter(s => s.equipe?.toLowerCase() === eq.name.toLowerCase());
            const ok   = eqSits.filter(s => s.status === 'ok').length;
            const nok  = eqSits.filter(s => s.status === 'non_ok').length;
            const pend = eqSits.filter(s => s.status === 'pending' || s.status === 'urgent').length;
            const pct  = eqSits.length ? Math.round(ok / eqSits.length * 100) : 0;

            return (
              <div key={eq.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1.5" style={{ background: eq.color }} />
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                      style={{ background: eq.color }}>
                      {eq.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 capitalize">{eq.name}</div>
                      <div className="text-xs text-slate-400">{eq.leader} (Chef)</div>
                    </div>
                    <div className="ml-auto text-2xl font-black" style={{ color: eq.color }}>{pct}%</div>
                  </div>

                  {/* Elements display */}
                  {(eq.elements ?? []).length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Éléments ({(eq.elements ?? []).length})
                      </p>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                        {(eq.elements ?? []).join(', ')}
                      </p>
                    </div>
                  )}

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center bg-green-50 rounded-lg p-2">
                      <div className="font-bold text-green-700 text-lg">{ok}</div>
                      <div className="text-[10px] text-green-600 font-medium">OK</div>
                    </div>
                    <div className="text-center bg-red-50 rounded-lg p-2">
                      <div className="font-bold text-red-700 text-lg">{nok}</div>
                      <div className="text-[10px] text-red-600 font-medium">NON OK</div>
                    </div>
                    <div className="text-center bg-slate-50 rounded-lg p-2">
                      <div className="font-bold text-slate-700 text-lg">{pend}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Restant</div>
                    </div>
                  </div>

                  <ProgressBar value={pct} color={eq.color} />

                  {/* Zones */}
                  {(eq.zones ?? []).length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Zones Couvertes ({(eq.zones ?? []).length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(eq.zones ?? []).map(z => <ZoneChip key={z} zone={z} />)}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mt-3">{eqSits.length} situations totales</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateEquipeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
