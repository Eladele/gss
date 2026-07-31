import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, Button, Modal, Select, Input, EmptyState, StatCard, ProgressBar, useToast } from '@/components/ui';
import { errMsg } from '@/utils';
import { parseAvancementExcel, parseKmlOrKmz, type AvancementParsed, type KmlParsed } from '@/utils/deploiementImport';
import type { Chantier } from '@/types';

function pct(fait: number, prevu: number): number {
  if (!prevu) return 0;
  return Math.min(100, Math.round((fait / prevu) * 100));
}

// Avancement global = moyenne des métriques dont le "prévu" est renseigné (> 0),
// support (poteaux OU tranchée selon le mode) + boîtiers + câbles.
function avancementGlobal(c: Chantier): number {
  const parts: number[] = [];
  if (c.typeDeploiement === 'aerien') {
    if (c.poteauxPrevus > 0) parts.push(pct(c.poteauxPoses, c.poteauxPrevus));
  } else {
    if (c.tranchéePrevueM > 0) parts.push(pct(c.tranchéePoseeM, c.tranchéePrevueM));
    if (c.blocagePrevu > 0) parts.push(pct(c.blocageFait, c.blocagePrevu));
    if (c.ouverturePrevue > 0) parts.push(pct(c.ouvertureFaite, c.ouverturePrevue));
  }
  if (c.xBoxPrevus > 0) parts.push(pct(c.xBoxPoses, c.xBoxPrevus));
  if (c.hubBoxPrevus > 0) parts.push(pct(c.hubBoxPoses, c.hubBoxPrevus));
  if (c.subBoxPrevus > 0) parts.push(pct(c.subBoxPoses, c.subBoxPrevus));
  if (c.endBoxPrevus > 0) parts.push(pct(c.endBoxPoses, c.endBoxPrevus));
  if (c.cableMpoPrevuM > 0) parts.push(pct(c.cableMpoPoseM, c.cableMpoPrevuM));
  if (c.cableDistributionPrevuM > 0) parts.push(pct(c.cableDistributionPoseM, c.cableDistributionPrevuM));
  if (parts.length === 0) return 0;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

const STATUT_LABELS: Record<Chantier['statut'], string> = { en_cours: 'En cours', termine: 'Terminé', suspendu: 'Suspendu' };
const STATUT_STYLES: Record<Chantier['statut'], string> = {
  en_cours: 'bg-blue-100 text-blue-700',
  termine: 'bg-green-100 text-green-700',
  suspendu: 'bg-amber-100 text-amber-700',
};

const emptyForm = {
  nom: '',
  zone: '',
  ville: '',
  equipeNom: '',
  typeDeploiement: 'aerien' as Chantier['typeDeploiement'],
  statut: 'en_cours' as Chantier['statut'],
  dateDebut: '',
  dateFinPrevue: '',
  poteauxPrevus: 0,
  poteauxPoses: 0,
  tranchéePrevueM: 0,
  tranchéePoseeM: 0,
  blocagePrevu: 0,
  blocageFait: 0,
  ouverturePrevue: 0,
  ouvertureFaite: 0,
  closerMpoPrevu: 0,
  closerMpoFait: 0,
  closerDisPrevu: 0,
  closerDisFait: 0,
  xBoxPrevus: 0,
  xBoxPoses: 0,
  hubBoxPrevus: 0,
  hubBoxPoses: 0,
  subBoxPrevus: 0,
  subBoxPoses: 0,
  endBoxPrevus: 0,
  endBoxPoses: 0,
  cableMpoPrevuM: 0,
  cableMpoPoseM: 0,
  cableDistributionPrevuM: 0,
  cableDistributionPoseM: 0,
  notes: '',
};

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] text-slate-500 block mb-1">{label}</label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function MetricRow({ label, fait, prevu, unite = '' }: { label: string; fait: number; prevu: number; unite?: string }) {
  if (!prevu && !fait) return null;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
        <span>{label}</span>
        <span>
          {fait}
          {unite} / {prevu}
          {unite}
        </span>
      </div>
      <ProgressBar value={pct(fait, prevu)} />
    </div>
  );
}

export default function DeploiementPage() {
  const chantiers = useAppStore((s) => s.chantiers);
  const equipes = useAppStore((s) => s.equipes);
  const loadChantiers = useAppStore((s) => s.loadChantiers);
  const addChantier = useAppStore((s) => s.addChantier);
  const editChantier = useAppStore((s) => s.editChantier);
  const removeChantier = useAppStore((s) => s.removeChantier);
  const { showToast } = useToast();

  useEffect(() => {
    loadChantiers();
  }, []);

  const [search, setSearch] = useState('');
  const [fStatut, setFStatut] = useState('');
  const [fType, setFType] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Chantier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // ── Import Excel "Avancement de déploiement" et KML/KMZ (design réseau) ──
  const excelInputRef = useRef<HTMLInputElement>(null);
  const kmlInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<
    | { kind: 'excel'; data: AvancementParsed; zone: string; targetId: string }
    | { kind: 'kml'; data: KmlParsed; zone: string; targetId: string }
    | null
  >(null);
  const [importing, setImporting] = useState(false);

  const handleExcelFile = async (file: File) => {
    try {
      const data = await parseAvancementExcel(file);
      const match = data.zone ? chantiers.find((c) => c.zone?.toUpperCase() === data.zone) : undefined;
      setImportPreview({ kind: 'excel', data, zone: data.zone ?? '', targetId: match?.id ?? '__new__' });
    } catch (err: unknown) {
      showToast('Lecture impossible — ' + errMsg(err), 'error');
    }
  };

  const handleKmlFile = async (file: File) => {
    try {
      const data = await parseKmlOrKmz(file);
      const match = data.zone ? chantiers.find((c) => c.zone?.toUpperCase() === data.zone) : undefined;
      setImportPreview({ kind: 'kml', data, zone: data.zone ?? '', targetId: match?.id ?? '__new__' });
    } catch (err: unknown) {
      showToast('Lecture impossible — ' + errMsg(err), 'error');
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    if (!importPreview.zone.trim()) {
      showToast('Le code de zone est obligatoire', 'error');
      return;
    }
    setImporting(true);
    try {
      if (importPreview.kind === 'excel') {
        const d = importPreview.data;
        const patch: Partial<Chantier> = {
          typeDeploiement: d.typeDeploiement,
          poteauxPoses: d.poteaux,
          tranchéePoseeM: d.tranchee,
          blocageFait: d.blocage,
          ouvertureFaite: d.ouverture,
          closerMpoFait: d.closerMpo,
          closerDisFait: d.closerDis,
          xBoxPoses: d.xBox,
          hubBoxPoses: d.hubBox,
          subBoxPoses: d.subBox,
          endBoxPoses: d.endBox,
          cableMpoPoseM: d.cableMpo,
          cableDistributionPoseM: d.cableDistribution,
        };
        if (importPreview.targetId === '__new__') {
          await addChantier({ nom: `Zone ${importPreview.zone}`, zone: importPreview.zone, ...patch });
        } else {
          await editChantier(importPreview.targetId, { zone: importPreview.zone, ...patch });
        }
        showToast('Avancement importé', 'success');
      } else {
        const d = importPreview.data;
        const patch: Partial<Chantier> = {
          poteauxPrevus: d.poteauxPrevus,
          xBoxPrevus: d.xBoxPrevus,
          hubBoxPrevus: d.hubBoxPrevus,
          subBoxPrevus: d.subBoxPrevus,
          cableMpoPrevuM: d.cableMpoPrevuM,
          cableDistributionPrevuM: d.cableDistributionPrevuM,
        };
        if (importPreview.targetId === '__new__') {
          await addChantier({ nom: `Zone ${importPreview.zone}`, zone: importPreview.zone, ...patch });
        } else {
          await editChantier(importPreview.targetId, { zone: importPreview.zone, ...patch });
        }
        showToast('Cibles de design importées', 'success');
      }
      setImportPreview(null);
    } catch (err: unknown) {
      showToast('Échec — ' + errMsg(err), 'error');
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(
    () =>
      chantiers.filter((c) => {
        if (fStatut && c.statut !== fStatut) return false;
        if (fType && c.typeDeploiement !== fType) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return c.nom.toLowerCase().includes(q) || (c.zone ?? '').toLowerCase().includes(q) || (c.ville ?? '').toLowerCase().includes(q);
      }),
    [chantiers, search, fStatut, fType],
  );

  const stats = useMemo(() => {
    const enCours = chantiers.filter((c) => c.statut === 'en_cours');
    const avancementMoyen = enCours.length ? Math.round(enCours.reduce((s, c) => s + avancementGlobal(c), 0) / enCours.length) : 0;
    return {
      total: chantiers.length,
      aerien: chantiers.filter((c) => c.typeDeploiement === 'aerien').length,
      souterrain: chantiers.filter((c) => c.typeDeploiement === 'souterrain').length,
      avancementMoyen,
    };
  }, [chantiers]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (c: Chantier) => {
    setEditing(c);
    setForm({ ...emptyForm, ...c, zone: c.zone ?? '', ville: c.ville ?? '', equipeNom: c.equipeNom ?? '', dateDebut: c.dateDebut ?? '', dateFinPrevue: c.dateFinPrevue ?? '', notes: c.notes ?? '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nom.trim()) {
      showToast('Le nom du chantier est obligatoire', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) await editChantier(editing.id, form);
      else await addChantier(form);
      setModalOpen(false);
      showToast(editing ? 'Chantier mis à jour' : 'Chantier créé', 'success');
    } catch (err: unknown) {
      showToast('Échec — ' + errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Chantier) => {
    if (!confirm(`Supprimer le chantier "${c.nom}" ?`)) return;
    try {
      await removeChantier(c.id);
      showToast('Chantier supprimé', 'success');
    } catch (err: unknown) {
      showToast('Échec — ' + errMsg(err), 'error');
    }
  };

  const set = <K extends keyof typeof form>(key: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Chantiers de déploiement</h1>
          <p className="text-slate-400 text-sm">Avancement réseau — poteaux (aérien) ou tranchée/blocage/ouverture (souterrain), boîtiers, câbles.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleExcelFile(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => excelInputRef.current?.click()}>
            Importer avancement (Excel)
          </Button>
          <input
            ref={kmlInputRef}
            type="file"
            accept=".kml,.kmz"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleKmlFile(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => kmlInputRef.current?.click()}>
            Importer design (KML/KMZ)
          </Button>
          <Button onClick={openNew}>Nouveau chantier</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={stats.total} label="Chantiers au total" icon="" accent="#546E7A" />
        <StatCard value={stats.aerien} label="Aérien" icon="" accent="#1565C0" />
        <StatCard value={stats.souterrain} label="Souterrain" icon="" accent="#8E24AA" />
        <StatCard value={`${stats.avancementMoyen}%`} label="Avancement moyen (en cours)" icon="" accent="#E9A93B" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-48">
              <input className="bg-transparent text-sm focus:outline-none flex-1" placeholder="Nom, zone, ville..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={fType} onChange={(e) => setFType(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous types</option>
              <option value="aerien">Aérien</option>
              <option value="souterrain">Souterrain</option>
            </Select>
            <Select value={fStatut} onChange={(e) => setFStatut(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous statuts</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
              <option value="suspendu">Suspendu</option>
            </Select>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="" text="Aucun chantier enregistré" />
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const av = avancementGlobal(c);
              return (
                <div key={c.id} className="p-4 hover:bg-slate-50/50">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-800">{c.nom}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUT_STYLES[c.statut]}`}>{STATUT_LABELS[c.statut]}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${c.typeDeploiement === 'aerien' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'}`}>
                          {c.typeDeploiement === 'aerien' ? 'Aérien' : 'Souterrain'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{[c.zone, c.ville, c.equipeNom].filter(Boolean).join(' — ') || '—'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">
                        Modifier
                      </button>
                      <button onClick={() => handleDelete(c)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg">
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {c.typeDeploiement === 'aerien' ? (
                      <MetricRow label="Poteaux" fait={c.poteauxPoses} prevu={c.poteauxPrevus} />
                    ) : (
                      <>
                        <MetricRow label="Tranchée" fait={c.tranchéePoseeM} prevu={c.tranchéePrevueM} unite="m" />
                        <MetricRow label="Blocage" fait={c.blocageFait} prevu={c.blocagePrevu} />
                        <MetricRow label="Ouverture" fait={c.ouvertureFaite} prevu={c.ouverturePrevue} />
                        <MetricRow label="Closer MPO" fait={c.closerMpoFait} prevu={c.closerMpoPrevu} />
                        <MetricRow label="Closer DIS" fait={c.closerDisFait} prevu={c.closerDisPrevu} />
                      </>
                    )}
                    <MetricRow label="X-BOX" fait={c.xBoxPoses} prevu={c.xBoxPrevus} />
                    <MetricRow label="HUB-BOX" fait={c.hubBoxPoses} prevu={c.hubBoxPrevus} />
                    <MetricRow label="SUB-BOX" fait={c.subBoxPoses} prevu={c.subBoxPrevus} />
                    <MetricRow label="END-BOX" fait={c.endBoxPoses} prevu={c.endBoxPrevus} />
                    <MetricRow label="Câble MPO" fait={c.cableMpoPoseM} prevu={c.cableMpoPrevuM} unite="m" />
                    <MetricRow label="Câble Distribution" fait={c.cableDistributionPoseM} prevu={c.cableDistributionPrevuM} unite="m" />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Avancement global : {av}%</span>
                    <div className="flex-1">
                      <ProgressBar value={av} />
                    </div>
                  </div>
                  {c.notes && <p className="text-xs text-slate-400 mt-2 italic">{c.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Modifier ${editing.nom}` : 'Nouveau chantier'}>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom du chantier *</label>
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Zone (code)</label>
              <Input value={form.zone} onChange={(e) => set('zone', e.target.value)} placeholder="ex: CA3Z05" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ville</label>
              <Input value={form.ville} onChange={(e) => set('ville', e.target.value)} placeholder="NKTT, NDB, KEADI..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type de déploiement</label>
              <Select className="w-full" value={form.typeDeploiement} onChange={(e) => set('typeDeploiement', e.target.value as Chantier['typeDeploiement'])}>
                <option value="aerien">Aérien (poteaux)</option>
                <option value="souterrain">Souterrain (tranchée)</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Statut</label>
              <Select className="w-full" value={form.statut} onChange={(e) => set('statut', e.target.value as Chantier['statut'])}>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
                <option value="suspendu">Suspendu</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Équipe</label>
              <Select className="w-full" value={form.equipeNom} onChange={(e) => set('equipeNom', e.target.value)}>
                <option value="">-- Sélectionner --</option>
                {equipes.map((e) => (
                  <option key={e.id} value={e.name}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Date de début</label>
              <Input type="date" value={form.dateDebut} onChange={(e) => set('dateDebut', e.target.value)} />
            </div>
          </div>

          {form.typeDeploiement === 'aerien' ? (
            <>
              <p className="text-xs font-bold text-slate-500 pt-2">Poteaux</p>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Prévus" value={form.poteauxPrevus} onChange={(v) => set('poteauxPrevus', v)} />
                <NumField label="Posés" value={form.poteauxPoses} onChange={(v) => set('poteauxPoses', v)} />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-500 pt-2">Tranchée / Génie civil</p>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Tranchée prévue (m)" value={form.tranchéePrevueM} onChange={(v) => set('tranchéePrevueM', v)} />
                <NumField label="Tranchée posée (m)" value={form.tranchéePoseeM} onChange={(v) => set('tranchéePoseeM', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Blocage prévu" value={form.blocagePrevu} onChange={(v) => set('blocagePrevu', v)} />
                <NumField label="Blocage fait" value={form.blocageFait} onChange={(v) => set('blocageFait', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Ouverture prévue" value={form.ouverturePrevue} onChange={(v) => set('ouverturePrevue', v)} />
                <NumField label="Ouverture faite" value={form.ouvertureFaite} onChange={(v) => set('ouvertureFaite', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Closer MPO prévu" value={form.closerMpoPrevu} onChange={(v) => set('closerMpoPrevu', v)} />
                <NumField label="Closer MPO fait" value={form.closerMpoFait} onChange={(v) => set('closerMpoFait', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Closer DIS prévu" value={form.closerDisPrevu} onChange={(v) => set('closerDisPrevu', v)} />
                <NumField label="Closer DIS fait" value={form.closerDisFait} onChange={(v) => set('closerDisFait', v)} />
              </div>
            </>
          )}

          <p className="text-xs font-bold text-slate-500 pt-2">Boîtiers</p>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="X-BOX prévus" value={form.xBoxPrevus} onChange={(v) => set('xBoxPrevus', v)} />
            <NumField label="X-BOX posés" value={form.xBoxPoses} onChange={(v) => set('xBoxPoses', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="HUB-BOX prévus" value={form.hubBoxPrevus} onChange={(v) => set('hubBoxPrevus', v)} />
            <NumField label="HUB-BOX posés" value={form.hubBoxPoses} onChange={(v) => set('hubBoxPoses', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="SUB-BOX prévus" value={form.subBoxPrevus} onChange={(v) => set('subBoxPrevus', v)} />
            <NumField label="SUB-BOX posés" value={form.subBoxPoses} onChange={(v) => set('subBoxPoses', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="END-BOX prévus" value={form.endBoxPrevus} onChange={(v) => set('endBoxPrevus', v)} />
            <NumField label="END-BOX posés" value={form.endBoxPoses} onChange={(v) => set('endBoxPoses', v)} />
          </div>

          <p className="text-xs font-bold text-slate-500 pt-2">Câbles</p>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Câble MPO prévu (m)" value={form.cableMpoPrevuM} onChange={(v) => set('cableMpoPrevuM', v)} />
            <NumField label="Câble MPO posé (m)" value={form.cableMpoPoseM} onChange={(v) => set('cableMpoPoseM', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Câble Distribution prévu (m)" value={form.cableDistributionPrevuM} onChange={(v) => set('cableDistributionPrevuM', v)} />
            <NumField label="Câble Distribution posé (m)" value={form.cableDistributionPoseM} onChange={(v) => set('cableDistributionPoseM', v)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Notes</label>
            <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm resize-none" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? '...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Aperçu / confirmation d'import (Excel avancement ou KML/KMZ design) ── */}
      <Modal open={!!importPreview} onClose={() => setImportPreview(null)} title={importPreview?.kind === 'excel' ? 'Importer un avancement' : 'Importer un design réseau'}>
        {importPreview && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2">
              Valeurs lues automatiquement — vérifie-les avant de confirmer, la détection peut varier selon le fichier.
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Code de zone *</label>
              <Input value={importPreview.zone} onChange={(e) => setImportPreview((p) => (p ? { ...p, zone: e.target.value.toUpperCase() } : p))} placeholder="ex: CA3Z05" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Chantier cible</label>
              <Select
                className="w-full"
                value={importPreview.targetId}
                onChange={(e) => setImportPreview((p) => (p ? { ...p, targetId: e.target.value } : p))}
              >
                <option value="__new__">-- Créer un nouveau chantier --</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.zone || 'sans zone'})
                  </option>
                ))}
              </Select>
            </div>

            {importPreview.kind === 'excel' ? (
              <>
                <p className="text-xs font-bold text-slate-500 pt-1">
                  Type détecté : {importPreview.data.typeDeploiement === 'aerien' ? 'Aérien' : 'Souterrain'} — valeurs "posées" (avancement réel)
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {importPreview.data.typeDeploiement === 'aerien' ? (
                    <div>Poteaux : <strong>{importPreview.data.poteaux}</strong></div>
                  ) : (
                    <>
                      <div>Tranchée : <strong>{importPreview.data.tranchee}m</strong></div>
                      <div>Blocage : <strong>{importPreview.data.blocage}</strong></div>
                      <div>Ouverture : <strong>{importPreview.data.ouverture}</strong></div>
                      <div>Closer MPO : <strong>{importPreview.data.closerMpo}</strong></div>
                      <div>Closer DIS : <strong>{importPreview.data.closerDis}</strong></div>
                    </>
                  )}
                  <div>X-BOX : <strong>{importPreview.data.xBox}</strong></div>
                  <div>HUB-BOX : <strong>{importPreview.data.hubBox}</strong></div>
                  <div>SUB-BOX : <strong>{importPreview.data.subBox}</strong></div>
                  <div>END-BOX : <strong>{importPreview.data.endBox}</strong></div>
                  <div>Câble MPO : <strong>{importPreview.data.cableMpo}m</strong></div>
                  <div>Câble Distribution : <strong>{importPreview.data.cableDistribution}m</strong></div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-500 pt-1">Cibles ("prévu") lues depuis le design</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Poteaux (hors drop cable) : <strong>{importPreview.data.poteauxPrevus}</strong></div>
                  <div>X-BOX : <strong>{importPreview.data.xBoxPrevus}</strong></div>
                  <div>HUB-BOX : <strong>{importPreview.data.hubBoxPrevus}</strong></div>
                  <div>SUB-BOX (+ END-BOX) : <strong>{importPreview.data.subBoxPrevus}</strong></div>
                  <div>Câble MPO : <strong>{importPreview.data.cableMpoPrevuM}m</strong></div>
                  <div>Câble Distribution : <strong>{importPreview.data.cableDistributionPrevuM}m</strong></div>
                </div>
                <p className="text-[11px] text-amber-600">Le KML ne distingue pas toujours SUB-BOX et END-BOX — total combiné ici, à répartir manuellement si besoin.</p>
              </>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setImportPreview(null)}>
                Annuler
              </Button>
              <Button onClick={confirmImport} disabled={importing}>
                {importing ? '...' : 'Confirmer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}