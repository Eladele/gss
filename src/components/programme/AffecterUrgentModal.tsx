import { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Cable, Check, Flame, Plus, Search, Wrench } from 'lucide-react';
import { Button, Modal, Select } from '@/components/ui';
import type { ProgrammeOT } from '@/types';
import { NATURE_CLASS, NATURE_LABEL, ligneLabel } from '@/utils/programme';
import {
  affecterUrgent,
  creerEtAffecterOtUrgent,
  rechercherFichesProgramme,
  type OtUrgentInput,
} from '@/lib/programmeService';
import { errMsg } from '@/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  equipeNames: string[];
  zoneEquipe: Record<string, string>;
  user: { id: string; name: string };
  fichesActuelles?: ProgrammeOT[];
  onSuccess: (msg: string) => void;
}

export function AffecterUrgentModal({
  open,
  onClose,
  equipeNames,
  zoneEquipe,
  user,
  fichesActuelles = [],
  onSuccess,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<'existant' | 'nouveau'>('existant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Onglet 1 : Déjà dans le programme ─────────────────────────────────────
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProgrammeOT[]>([]);
  const [selectedFiche, setSelectedFiche] = useState<ProgrammeOT | null>(null);
  const [targetEquipe, setTargetEquipe] = useState('');
  const [targetDate, setTargetDate] = useState(today);
  const [urgentMotif, setUrgentMotif] = useState('');

  // Recherche dans les fiches actuelles ou via la base
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedFiche(null);
      setSearchResults([]);
      setError('');
      return;
    }
  }, [open]);

  const handleSearch = async (val: string) => {
    setSearch(val);
    const q = val.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      return;
    }

    // Filtrer d'abord parmi les fiches chargées
    const locaux = fichesActuelles.filter(
      (f) =>
        f.fgp.toLowerCase().includes(q) ||
        f.numeroOt.toLowerCase().includes(q) ||
        f.clientNom.toLowerCase().includes(q) ||
        f.zone.toLowerCase().includes(q) ||
        f.telephones.some((t) => t.includes(q)),
    );

    if (locaux.length > 0) {
      setSearchResults(locaux.slice(0, 15));
      return;
    }

    // Sinon rechercher dans la base si au moins 2 caractères
    if (q.length >= 2) {
      setSearching(true);
      try {
        const rows = await rechercherFichesProgramme(q);
        setSearchResults(rows);
      } catch {
        // Ignorer l'erreur de frappe intermédiaire
      } finally {
        setSearching(false);
      }
    }
  };

  const handleSelectFiche = (f: ProgrammeOT) => {
    setSelectedFiche(f);
    setTargetEquipe(f.equipe || '');
    setTargetDate(f.dateProgramme || today);
    setUrgentMotif(f.motif || '');
  };

  const handleConfirmExistant = async () => {
    if (!selectedFiche) return setError('Veuillez sélectionner une fiche');
    if (!targetEquipe) return setError('Veuillez choisir une équipe');
    setLoading(true);
    setError('');
    try {
      await affecterUrgent(selectedFiche.id, targetEquipe, {
        dateProgramme: targetDate,
        isUrgent: true,
        par: user,
        motif: urgentMotif.trim() || undefined,
      });
      onSuccess(`Fiche ${ligneLabel(selectedFiche)} affectée en cas urgent à l’équipe ${targetEquipe}`);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // ─── Onglet 2 : Nouveau cas urgent ─────────────────────────────────────────
  const [nature, setNature] = useState<'derangement' | 'installation'>('derangement');
  const [fgp, setFgp] = useState('');
  const [numeroOt, setNumeroOt] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [telephones, setTelephones] = useState('');
  const [zone, setZone] = useState('');
  const [equipe, setEquipe] = useState('');
  const [dis, setDis] = useState('');
  const [ontSerial, setOntSerial] = useState('');
  const [cableFibreM, setCableFibreM] = useState<number | ''>('');
  const [motif, setMotif] = useState('');
  const [dateProgramme, setDateProgramme] = useState(today);

  // Auto-détection de l'équipe par zone
  const handleZoneChange = (z: string) => {
    setZone(z);
    const upper = z.trim().toUpperCase();
    if (zoneEquipe[upper] && !equipe) {
      setEquipe(zoneEquipe[upper]);
    }
  };

  const handleConfirmNouveau = async () => {
    if (!fgp.trim()) return setError('Le numéro FGP / Ligne est obligatoire');
    if (!equipe) return setError('Veuillez sélectionner une équipe');
    setLoading(true);
    setError('');
    try {
      const input: OtUrgentInput = {
        nature,
        fgp: fgp.trim(),
        numeroOt: numeroOt.trim() || undefined,
        clientNom: clientNom.trim() || undefined,
        telephones: telephones
          .split(/[/,;]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        zone: zone.trim(),
        equipe,
        dis: dis.trim() || undefined,
        ontSerial: ontSerial.trim() || undefined,
        cableFibreM: cableFibreM !== '' ? Number(cableFibreM) : undefined,
        motif: motif.trim() || (nature === 'derangement' ? 'Dérangement urgent' : 'Installation urgente'),
        dateProgramme,
      };

      const ot = await creerEtAffecterOtUrgent(input, user);
      onSuccess(`Nouveau cas urgent (${NATURE_LABEL[nature]}) ${ligneLabel(ot)} créé et affecté à ${equipe}`);
      // Réinitialiser formulaire
      setFgp('');
      setNumeroOt('');
      setClientNom('');
      setTelephones('');
      setZone('');
      setEquipe('');
      setDis('');
      setOntSerial('');
      setCableFibreM('');
      setMotif('');
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Affecter un Cas Urgent">
      <div className="space-y-4">
        {/* En-tête avec indicateur urgent */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-900 text-xs">
          <Flame className="w-4 h-4 text-orange-600 flex-shrink-0 animate-pulse" />
          <span>
            Le cas urgent sera priorisé immédiatement en tête du programme de l'équipe et signalé avec un badge d'urgence.
          </span>
        </div>

        {/* Sélecteur d'onglets */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setTab('existant');
              setError('');
            }}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-colors ${
              tab === 'existant' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Déjà dans le programme
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('nouveau');
              setError('');
            }}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-colors ${
              tab === 'nouveau' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Nouveau cas urgent
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── TAB 1 : DÉJÀ DANS LE PROGRAMME ─── */}
        {tab === 'existant' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="search-fiche" className="block text-xs font-semibold text-slate-600 mb-1">
                Rechercher la fiche dans le programme
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="search-fiche"
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Rechercher par FGP, n° OT, client, zone..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Liste des résultats de recherche */}
            {search.trim() && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                {searching && <p className="p-3 text-center text-xs text-slate-400">Recherche en cours…</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="p-3 text-center text-xs text-slate-400">Aucune fiche trouvée.</p>
                )}
                {!searching &&
                  searchResults.map((f) => {
                    const isSelected = selectedFiche?.id === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectFiche(f)}
                        className={`w-full text-left p-2.5 flex items-center justify-between gap-2 hover:bg-orange-50/50 transition-colors ${
                          isSelected ? 'bg-orange-50 border-l-4 border-orange-600' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${NATURE_CLASS[f.nature]}`}>
                              {NATURE_LABEL[f.nature]}
                            </span>
                            <span className="font-bold text-xs text-slate-800">{ligneLabel(f)}</span>
                            {f.clientNom && <span className="text-xs text-slate-600 truncate">{f.clientNom}</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {f.zone && `Zone ${f.zone} · `}
                            Équipe : <span className="font-semibold text-slate-700">{f.equipe || 'Sans équipe'}</span> · Statut : {f.statut}
                          </p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Fiche sélectionnée et formulaire d'affectation */}
            {selectedFiche && (
              <div className="p-3 rounded-lg bg-orange-50/60 border border-orange-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-600" />
                    Fiche sélectionnée : {ligneLabel(selectedFiche)}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${NATURE_CLASS[selectedFiche.nature]}`}>
                    {NATURE_LABEL[selectedFiche.nature]}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="affect-equipe" className="block font-semibold text-slate-700 mb-1">
                      Affecter à l'équipe *
                    </label>
                    <Select
                      id="affect-equipe"
                      value={targetEquipe}
                      onChange={(e) => setTargetEquipe(e.target.value)}
                      className="w-full text-xs"
                    >
                      <option value="">— Choisir l’équipe —</option>
                      {equipeNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="affect-date" className="block font-semibold text-slate-700 mb-1">
                      Date du programme
                    </label>
                    <input
                      id="affect-date"
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="affect-motif" className="block font-semibold text-slate-700 mb-1 text-xs">
                    Motif / Justification de l'urgence
                  </label>
                  <input
                    id="affect-motif"
                    type="text"
                    value={urgentMotif}
                    onChange={(e) => setUrgentMotif(e.target.value)}
                    placeholder="Ex: Panne totale client VIP, câble sectionné, rétablissement express…"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="pt-1 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFiche(null)}>
                    Annuler sélection
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={loading || !targetEquipe}
                    onClick={handleConfirmExistant}
                    icon={<Flame className="w-3.5 h-3.5" />}
                  >
                    {loading ? 'Affectation…' : 'Affecter en cas urgent'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2 : NOUVEAU CAS URGENT ─── */}
        {tab === 'nouveau' && (
          <div className="space-y-3">
            {/* Choix nature : Dérangement ou Installation */}
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Nature de l'intervention *</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNature('derangement')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    nature === 'derangement'
                      ? 'border-orange-500 bg-orange-50 text-orange-900 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Wrench className="w-4 h-4 text-orange-600" />
                  Dérangement urgent
                </button>
                <button
                  type="button"
                  onClick={() => setNature('installation')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    nature === 'installation'
                      ? 'border-sky-500 bg-sky-50 text-sky-900 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Cable className="w-4 h-4 text-sky-600" />
                  Installation urgente
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="new-fgp" className="block font-semibold text-slate-700 mb-1">
                  N° FGP / Ligne *
                </label>
                <input
                  id="new-fgp"
                  type="text"
                  value={fgp}
                  onChange={(e) => setFgp(e.target.value)}
                  placeholder="Ex: 441122 ou 223344"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="new-ot" className="block font-semibold text-slate-700 mb-1">
                  N° OT (optionnel)
                </label>
                <input
                  id="new-ot"
                  type="text"
                  value={numeroOt}
                  onChange={(e) => setNumeroOt(e.target.value)}
                  placeholder="Ex: 2026-10452 (vide = généré)"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="new-client" className="block font-semibold text-slate-700 mb-1">
                  Nom du client
                </label>
                <input
                  id="new-client"
                  type="text"
                  value={clientNom}
                  onChange={(e) => setClientNom(e.target.value)}
                  placeholder="Ex: Mohamed Ould Ahmed"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="new-tel" className="block font-semibold text-slate-700 mb-1">
                  Téléphone(s)
                </label>
                <input
                  id="new-tel"
                  type="text"
                  value={telephones}
                  onChange={(e) => setTelephones(e.target.value)}
                  placeholder="Ex: 46123456 / 22334455"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="new-zone" className="block font-semibold text-slate-700 mb-1">
                  Zone (ex: CA1Z02)
                </label>
                <input
                  id="new-zone"
                  type="text"
                  value={zone}
                  onChange={(e) => handleZoneChange(e.target.value)}
                  placeholder="Ex: CA1Z02"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="new-equipe" className="block font-semibold text-slate-700 mb-1">
                  Équipe affectée *
                </label>
                <Select
                  id="new-equipe"
                  value={equipe}
                  onChange={(e) => setEquipe(e.target.value)}
                  className="w-full text-xs"
                >
                  <option value="">— Choisir l’équipe —</option>
                  {equipeNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label htmlFor="new-dis" className="block font-semibold text-slate-700 mb-1">
                  DIS / PCO-Port
                </label>
                <input
                  id="new-dis"
                  type="text"
                  value={dis}
                  onChange={(e) => setDis(e.target.value)}
                  placeholder="Ex: 12-05-01"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="new-ont" className="block font-semibold text-slate-700 mb-1">
                  ONT (n° de série)
                </label>
                <input
                  id="new-ont"
                  type="text"
                  value={ontSerial}
                  onChange={(e) => setOntSerial(e.target.value)}
                  placeholder="Ex: HWTC12345678"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              {nature === 'installation' && (
                <div>
                  <label htmlFor="new-cable" className="block font-semibold text-slate-700 mb-1">
                    Câble fibre prévu (mètres)
                  </label>
                  <input
                    id="new-cable"
                    type="number"
                    min={0}
                    value={cableFibreM}
                    onChange={(e) => setCableFibreM(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex: 80"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}

              <div>
                <label htmlFor="new-date" className="block font-semibold text-slate-700 mb-1">
                  Date du programme
                </label>
                <input
                  id="new-date"
                  type="date"
                  value={dateProgramme}
                  onChange={(e) => setDateProgramme(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-motif" className="block font-semibold text-slate-700 mb-1 text-xs">
                Motif / Détails de l'urgence
              </label>
              <input
                id="new-motif"
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex: Client sans connexion depuis 2 jours, VIP réclamation, urgence direction…"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={loading || !fgp.trim() || !equipe}
                onClick={handleConfirmNouveau}
                icon={<Flame className="w-3.5 h-3.5" />}
              >
                {loading ? 'Création…' : 'Créer et affecter le cas urgent'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

