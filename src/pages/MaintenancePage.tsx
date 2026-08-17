import { EmptyState } from '@/components/ui';

export default function MaintenancePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Maintenance</h1>
        <p className="text-slate-400 text-sm">Suivi de la maintenance réseau — à venir.</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <EmptyState icon="" text="Cette page sera bientôt disponible" />
      </div>
    </div>
  );
}