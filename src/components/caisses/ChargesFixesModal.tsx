import { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Fuel,
  Pencil,
  Phone,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Card, Input, Modal, Select, useToast } from '@/components/ui';
import { useCaisseStore } from '@/store/useCaisseStore';
import type { CaisseChargeFixe, CaisseCategorie } from '@/types';
import { CATEGORIES, mru } from '@/utils/caisse';
import { errMsg } from '@/utils';

const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5';

const JOURS_SEMAINE = [
  { val: 1, label: 'Lundi' },
  { val: 2, label: 'Mardi' },
  { val: 3, label: 'Mercredi' },
  { val: 4, label: 'Jeudi' },
  { val: 5, label: 'Vendredi' },
  { val: 6, label: 'Samedi' },
  { val: 7, label: 'Dimanche' },
];

export function ChargesFixesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { chargesFixes, caisses, triggerChargeFixe, saveChargeFixe, removeChargeFixe, checkChargesFixes } = useCaisseStore();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<Partial<CaisseChargeFixe> | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Caisse Betoul prioritaire par défaut
  const defaultCaisseId =
    caisses.find((c) => c.nom.toLowerCase().includes('betoul'))?.id || caisses[0]?.id || '';

  const handleTrigger = async (cf: CaisseChargeFixe) => {
    setTriggeringId(cf.id);
    try {
      await triggerChargeFixe(cf.id);
      showToast(`Demande de ${mru(cf.montant)} MRU créée pour Betoul`, 'success');
    } catch (e) {
      showToast(errMsg(e, 'Impossible de déclencher la charge'), 'error');
    } finally {
      setTriggeringId(null);
    }
  };

  const handleSave = async () => {
    if (!editing?.libelle?.trim()) return showToast('Indiquez un libellé', 'error');
    if (!editing.montant || editing.montant <= 0) return showToast('Indiquez un montant valide', 'error');
    const caisseId = editing.caisseId || defaultCaisseId;
    if (!caisseId) return showToast('Sélectionnez une caisse', 'error');

    try {
      await saveChargeFixe({
        id: editing.id,
        caisseId,
        libelle: editing.libelle.trim(),
        montant: Math.round(Number(editing.montant)),
        categorie: editing.categorie || 'carburant',
        chantier: editing.chantier || '',
        frequence: editing.frequence || 'hebdo',
        jourSemaine: editing.frequence === 'hebdo' ? Number(editing.jourSemaine || 1) : null,
        jourMois: editing.frequence === 'mensuel' ? Number(editing.jourMois || 1) : null,
        actif: editing.actif !== false,
      });
      showToast('Charge fixe enregistrée', 'success');
      setEditing(null);
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement cette charge fixe ?')) return;
    try {
      await removeChargeFixe(id);
      showToast('Charge fixe supprimée', 'success');
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };

  const handleCheckCalendar = async () => {
    setChecking(true);
    try {
      const count = await checkChargesFixes();
      if (count > 0) {
        showToast(`${count} demande${count > 1 ? 's ont été envoyées' : ' a été envoyée'} automatiquement à Betoul`, 'success');
      } else {
        showToast('Aucune charge fixe n’est due aujourd’hui (ou déjà demandée)', 'info');
      }
    } catch (e) {
      showToast(errMsg(e), 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Charges fixes & Demandes automatiques">
      <div className="space-y-4 max-w-xl">
        {/* Bannière explicative */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl p-3.5 flex gap-3 items-start">
          <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-700 leading-relaxed">
            <p className="font-bold text-slate-900 text-sm mb-0.5">Automatisation pour Betoul</p>
            Ces charges fixes génèrent automatiquement les demandes de carburant et de crédit pour Betoul :
            <span className="font-semibold text-blue-900"> Lundi matin (6 500)</span>,
            <span className="font-semibold text-blue-900"> Jeudi matin (3 200)</span>, et
            <span className="font-semibold text-blue-900"> 1er du mois (Rosso 3 000, Kaédi 3 000, Crédit 3 500)</span>.
          </div>
        </div>

        {/* Boutons d'action supérieurs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            icon={<RotateCcw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />}
            onClick={handleCheckCalendar}
            disabled={checking}
          >
            Vérifier aujourd’hui
          </Button>

          {!editing && (
            <Button
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() =>
                setEditing({
                  libelle: '',
                  montant: 0,
                  categorie: 'carburant',
                  chantier: '',
                  frequence: 'hebdo',
                  jourSemaine: 1,
                  caisseId: defaultCaisseId,
                  actif: true,
                })
              }
            >
              Nouvelle charge fixe
            </Button>
          )}
        </div>

        {/* Formulaire d'édition / création */}
        {editing ? (
          <Card className="p-4 border-blue-300 ring-2 ring-blue-50 space-y-3 bg-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-sm text-slate-800">
                {editing.id ? 'Modifier la charge fixe' : 'Créer une charge fixe'}
              </span>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="cf-libelle">Libellé</label>
                <Input
                  id="cf-libelle"
                  placeholder="ex: Carburant lundi"
                  value={editing.libelle ?? ''}
                  onChange={(e) => setEditing({ ...editing, libelle: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="cf-montant">Montant (MRU)</label>
                <Input
                  id="cf-montant"
                  inputMode="numeric"
                  placeholder="6500"
                  value={editing.montant ? String(editing.montant) : ''}
                  onChange={(e) =>
                    setEditing({ ...editing, montant: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass} htmlFor="cf-freq">Fréquence</label>
                <Select
                  id="cf-freq"
                  className="w-full"
                  value={editing.frequence ?? 'hebdo'}
                  onChange={(e) => setEditing({ ...editing, frequence: e.target.value as 'hebdo' | 'mensuel' })}
                >
                  <option value="hebdo">Hebdomadaire</option>
                  <option value="mensuel">Mensuelle</option>
                </Select>
              </div>

              {editing.frequence === 'hebdo' ? (
                <div>
                  <label className={labelClass} htmlFor="cf-jour-sem">Jour de la semaine</label>
                  <Select
                    id="cf-jour-sem"
                    className="w-full"
                    value={String(editing.jourSemaine ?? 1)}
                    onChange={(e) => setEditing({ ...editing, jourSemaine: Number(e.target.value) })}
                  >
                    {JOURS_SEMAINE.map((j) => (
                      <option key={j.val} value={j.val}>
                        {j.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <label className={labelClass} htmlFor="cf-jour-mois">Jour du mois</label>
                  <Select
                    id="cf-jour-mois"
                    className="w-full"
                    value={String(editing.jourMois ?? 1)}
                    onChange={(e) => setEditing({ ...editing, jourMois: Number(e.target.value) })}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d === 1 ? '1er du mois' : `${d} du mois`}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="cf-caisse">Caisse cible</label>
                <Select
                  id="cf-caisse"
                  className="w-full"
                  value={editing.caisseId ?? defaultCaisseId}
                  onChange={(e) => setEditing({ ...editing, caisseId: e.target.value })}
                >
                  {caisses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="cf-cat">Catégorie</label>
                <Select
                  id="cf-cat"
                  className="w-full"
                  value={editing.categorie ?? 'carburant'}
                  onChange={(e) => setEditing({ ...editing, categorie: e.target.value as CaisseCategorie })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelClass} htmlFor="cf-chantier">Chantier / Ville (optionnel)</label>
                <Input
                  id="cf-chantier"
                  placeholder="ex: Rosso, Kaédi..."
                  value={editing.chantier ?? ''}
                  onChange={(e) => setEditing({ ...editing, chantier: e.target.value })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.actif !== false}
                onChange={(e) => setEditing({ ...editing, actif: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Activer cette charge fixe (demande automatique planifiée)
            </label>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button size="sm" className="flex-1 justify-center" onClick={handleSave}>
                Enregistrer
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Liste des charges fixes */}
        <div className="space-y-2.5">
          {chargesFixes.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Aucune charge fixe enregistrée. Exécutez le script SQL ou créez-en une.
            </div>
          ) : (
            chargesFixes.map((cf) => {
              const caisse = caisses.find((c) => c.id === cf.caisseId);
              const isHebdo = cf.frequence === 'hebdo';
              const jourTxt = isHebdo
                ? JOURS_SEMAINE.find((j) => j.val === cf.jourSemaine)?.label || 'Lundi'
                : cf.jourMois === 1
                  ? '1er du mois'
                  : `${cf.jourMois} du mois`;

              return (
                <div
                  key={cf.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    cf.actif
                      ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        cf.categorie === 'communication'
                          ? 'bg-pink-100 text-pink-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {cf.categorie === 'communication' ? (
                        <Phone className="w-4 h-4" />
                      ) : (
                        <Fuel className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{cf.libelle}</span>
                        {cf.chantier && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {cf.chantier}
                          </span>
                        )}
                        {!cf.actif && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">
                            En pause
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {isHebdo ? `${jourTxt} matin` : jourTxt}
                        </span>
                        <span>· Caisse {caisse?.nom || 'Betoul'}</span>
                        {cf.dernierDeclenchement && (
                          <span className="text-slate-400">
                            · Dernier envoi : {cf.dernierDeclenchement}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-base font-black tabular-nums text-slate-900">
                        {mru(cf.montant)} <span className="text-xs font-semibold text-slate-400">MRU</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-700 hover:bg-blue-50 hover:border-blue-200"
                        icon={<Play className={`w-3.5 h-3.5 ${triggeringId === cf.id ? 'animate-pulse' : ''}`} />}
                        onClick={() => handleTrigger(cf)}
                        disabled={triggeringId === cf.id}
                        title="Envoyer la demande immédiatement à Betoul"
                      >
                        Demander
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEditing(cf)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cf.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
