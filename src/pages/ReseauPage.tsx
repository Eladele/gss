import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, CardTitle, Button, Modal, Select, Input, EmptyState, useToast } from '@/components/ui';
import { errMsg } from '@/utils';
import type { NoeudReseau, TypeNoeudReseau } from '@/types';

const TYPE_LABELS: Record<TypeNoeudReseau, string> = {
  olt: 'OLT',
  closure_mpo: 'Closure MPO',
  x_box: 'X-BOX',
  closure_dis: 'Closure DIS',
  hub_box: 'HUB-BOX',
  sp: 'Splitter (SP)',
  sub_box: 'SUB-BOX',
  end_box: 'END-BOX',
};

const TYPE_ICON: Record<TypeNoeudReseau, string> = {
  olt: '🖧',
  closure_mpo: '⛓',
  x_box: '▣',
  closure_dis: '⛓',
  hub_box: '▤',
  sp: '◁',
  sub_box: '▥',
  end_box: '◆',
};

const LEVEL_ORDER: TypeNoeudReseau[] = ['olt', 'closure_mpo', 'x_box', 'closure_dis', 'hub_box', 'sp', 'sub_box', 'end_box'];

const BOX_TYPES: TypeNoeudReseau[] = ['olt', 'x_box', 'hub_box'];

function ChainNode({
  node,
  selected,
  childByPort,
  onSelect,
  onSelectPort,
  onDelete,
}: {
  node: NoeudReseau;
  selected: boolean;
  childByPort: Map<number, NoeudReseau>;
  onSelect: (n: NoeudReseau) => void;
  onSelectPort: (child: NoeudReseau) => void;
  onDelete: (n: NoeudReseau) => void;
}) {
  const isBox = BOX_TYPES.includes(node.type);

  if (isBox) {
    return (
      <div
        onClick={() => onSelect(node)}
        className={`rounded-lg border-2 border-dashed px-3 py-3 w-40 shrink-0 relative group cursor-pointer transition-colors ${
          selected ? 'border-blue-400 bg-blue-950/40' : 'border-teal-400/70 bg-slate-800/60 hover:border-teal-300'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node);
          }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title="Supprimer"
        >
          ×
        </button>
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-900/60 border border-blue-400 text-blue-300 text-base mx-auto mb-2">
          {TYPE_ICON[node.type]}
        </div>
        {node.type === 'hub_box' && node.nbPorts > 0 && (
          <div className="grid grid-cols-2 gap-1 mb-2">
            {Array.from({ length: node.nbPorts }).map((_, i) => {
              const portNum = i + 1;
              const child = childByPort.get(portNum);
              return (
                <button
                  key={i}
                  disabled={!child}
                  title={child ? `Voir ${child.nom}` : 'Port libre'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (child) onSelectPort(child);
                  }}
                  className={`h-4 rounded-full text-[8px] font-bold flex items-center justify-center transition-transform ${
                    child ? 'bg-teal-400 text-slate-900 hover:scale-110 cursor-pointer' : 'bg-slate-700 text-slate-400 cursor-default'
                  }`}
                >
                  {portNum}
                </button>
              );
            })}
          </div>
        )}
        {node.type !== 'hub_box' && childByPort.size > 0 && (
          <div className="grid grid-cols-2 gap-1 mb-2">
            {Array.from(childByPort.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([portNum, child]) => (
                <button
                  key={portNum}
                  title={`Voir ${child.nom}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPort(child);
                  }}
                  className="h-4 rounded-full text-[8px] font-bold flex items-center justify-center bg-teal-400 text-slate-900 hover:scale-110 cursor-pointer transition-transform"
                >
                  {portNum}
                </button>
              ))}
          </div>
        )}
        {node.type === 'hub_box' && (
          <div className="mb-2">
            <div className="grid grid-cols-2 gap-1 mb-1">
              {['V1', 'V2'].map((v) => (
                <div key={v} className="h-4 rounded-full text-[8px] font-bold flex items-center justify-center bg-slate-700 text-slate-400">
                  {v}
                </div>
              ))}
            </div>
            <div className="h-4 rounded text-[8px] font-bold flex items-center justify-center bg-slate-700 text-slate-400 w-1/2">S1</div>
          </div>
        )}
        <p className="text-center text-[11px] font-bold text-teal-200 truncate" title={node.nom}>
          {node.nom}
        </p>
      </div>
    );
  }

  return (
    <div onClick={() => onSelect(node)} className="flex flex-col items-center shrink-0 cursor-pointer group relative w-24">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node);
        }}
        className="absolute -top-1 right-4 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        title="Supprimer"
      >
        ×
      </button>
      <div className="flex items-center gap-0">
        <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[8px] font-bold ${selected ? 'bg-blue-500 border-blue-300 text-white' : 'bg-teal-500 border-teal-300 text-slate-900'}`}>
          E
        </div>
        <div
          className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-lg -mx-1 ${
            selected ? 'border-blue-400 bg-blue-950/60 text-blue-300' : 'border-teal-400 bg-slate-800/80 text-teal-300'
          }`}
        >
          {TYPE_ICON[node.type]}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const child = childByPort.get(1);
            if (child) onSelectPort(child);
          }}
          disabled={!childByPort.get(1)}
          title={childByPort.get(1) ? `Voir ${childByPort.get(1)!.nom}` : 'Rien de branché'}
          className={`w-4 h-4 rounded-full border flex items-center justify-center text-[8px] font-bold ${
            childByPort.get(1) ? 'hover:scale-125 cursor-pointer' : 'cursor-default opacity-60'
          } ${selected ? 'bg-blue-500 border-blue-300 text-white' : 'bg-teal-500 border-teal-300 text-slate-900'}`}
        >
          S
        </button>
      </div>
      <p className="text-center text-[10px] font-bold text-teal-200 mt-1 truncate w-full" title={node.nom}>
        {node.nom}
      </p>
    </div>
  );
}

function Connector({ node }: { node: NoeudReseau }) {
  const hasDistances = node.cableDistanceReelleM != null || node.cableLongueurM != null;
  return (
    <div className="flex flex-col items-center justify-center shrink-0 w-16 -mt-4">
      {node.cableSn && <span className="text-[9px] text-teal-400 whitespace-nowrap mb-0.5 truncate max-w-[90px]">{node.cableSn}</span>}
      {hasDistances && (
        <span className="text-[9px] text-teal-300 whitespace-nowrap leading-tight text-center mb-0.5">
          {node.cableDistanceReelleM != null ? `${node.cableDistanceReelleM}m` : '—'}
          <br />
          {node.cableLongueurM != null ? `${node.cableLongueurM}m` : ''}
        </span>
      )}
      <div className="h-px w-full bg-teal-500/50" />
    </div>
  );
}

const emptyForm = {
  type: 'x_box' as TypeNoeudReseau,
  nom: '',
  sn: '',
  parentId: '',
  parentPort: 0,
  cableSn: '',
  cableLongueurM: 0,
  cableDistanceReelleM: 0,
  nbPorts: 8,
  portsOccupes: 0,
  coordonnees: '',
  puissanceOptiqueDbm: 0,
};

export default function ReseauPage() {
  const chantiers = useAppStore((s) => s.chantiers);
  const reseauNoeuds = useAppStore((s) => s.reseauNoeuds);
  const loadChantiers = useAppStore((s) => s.loadChantiers);
  const loadReseauNoeuds = useAppStore((s) => s.loadReseauNoeuds);
  const addReseauNoeud = useAppStore((s) => s.addReseauNoeud);
  const removeReseauNoeud = useAppStore((s) => s.removeReseauNoeud);
  const { showToast } = useToast();

  const [zone, setZone] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (chantiers.length === 0) loadChantiers();
  }, []);

  useEffect(() => {
    if (!zone && chantiers.length > 0) setZone(chantiers[0].zone ?? '');
  }, [chantiers]);

  useEffect(() => {
    if (zone) loadReseauNoeuds(zone);
    setSelectedId(null);
  }, [zone]);

  const nodesForZone = useMemo(() => reseauNoeuds.filter((n) => n.zone === zone), [reseauNoeuds, zone]);
  const byId = useMemo(() => new Map(nodesForZone.map((n) => [n.id, n])), [nodesForZone]);
  const root = useMemo(() => nodesForZone.find((n) => !n.parentId), [nodesForZone]);
  const selected = (selectedId ? byId.get(selectedId) : undefined) ?? root;
  const selectedParent = selected?.parentId ? byId.get(selected.parentId) : undefined;
  const selectedChildren = useMemo(
    () => (selected ? nodesForZone.filter((n) => n.parentId === selected.id).sort((a, b) => (a.parentPort ?? 0) - (b.parentPort ?? 0)) : []),
    [nodesForZone, selected],
  );

  // Ports occupés d'un nœud → l'enfant qui y est branché (pour rendre chaque
  // port cliquable et naviguer directement dessus, comme dans l'outil NCE).
  // Quand on clique un port de HUB-BOX, on veut voir directement toute la
  // chaîne (3 SUB-BOX + 1 END-BOX terminal), pas boîtier par boîtier — on
  // déroule automatiquement tant que chaque nœud n'a qu'un seul enfant en
  // cascade (SUB-BOX/END-BOX), et on sélectionne le dernier de la chaîne.
  const selectChainEnd = (start: NoeudReseau) => {
    let cur = start;
    while (true) {
      const children = nodesForZone.filter((n) => n.parentId === cur.id);
      if (children.length === 1 && (children[0].type === 'sub_box' || children[0].type === 'end_box')) {
        cur = children[0];
      } else {
        break;
      }
    }
    setSelectedId(cur.id);
  };

  const childPortMap = (node: NoeudReseau): Map<number, NoeudReseau> => {
    const map = new Map<number, NoeudReseau>();
    nodesForZone.forEach((n) => {
      if (n.parentId === node.id && n.parentPort != null) map.set(n.parentPort, n);
    });
    return map;
  };

  // Chaîne des ancêtres, de la racine jusqu'au nœud sélectionné (façon "resource
  // chain" NCE — on affiche le fil parent → sélection, puis les enfants directs
  // en éventail à la suite).
  const ancestorChain = useMemo(() => {
    if (!selected) return [];
    const chain: NoeudReseau[] = [];
    let cur: NoeudReseau | undefined = selected;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  }, [selected, byId]);

  const openNew = () => {
    setForm({ ...emptyForm, parentId: selectedId ?? '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (!zone) {
      showToast('Sélectionne une zone', 'error');
      return;
    }
    if (form.type !== 'olt' && !form.nom.trim()) {
      showToast('Le nom du nœud est obligatoire', 'error');
      return;
    }
    setSaving(true);
    try {
      await addReseauNoeud({
        zone,
        type: form.type,
        nom: form.nom.trim() || TYPE_LABELS[form.type],
        sn: form.sn || undefined,
        parentId: form.parentId || null,
        parentPort: form.parentPort || undefined,
        cableSn: form.cableSn || undefined,
        cableLongueurM: form.cableLongueurM || undefined,
        cableDistanceReelleM: form.cableDistanceReelleM || undefined,
        nbPorts: form.nbPorts,
        portsOccupes: form.portsOccupes,
        coordonnees: form.coordonnees || undefined,
        puissanceOptiqueDbm: form.puissanceOptiqueDbm || undefined,
      });
      setModalOpen(false);
      showToast('Nœud ajouté', 'success');
    } catch (err: unknown) {
      showToast('Échec — ' + errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (n: NoeudReseau) => {
    if (!confirm(`Supprimer "${n.nom}" ? Les nœuds enfants seront supprimés aussi.`)) return;
    try {
      await removeReseauNoeud(n.id);
      if (selectedId === n.id) setSelectedId(null);
      showToast('Nœud supprimé', 'success');
    } catch (err: unknown) {
      showToast('Échec — ' + errMsg(err), 'error');
    }
  };

  const freeRatio = selected && selected.nbPorts > 0 ? Math.round(((selected.nbPorts - selected.portsOccupes) / selected.nbPorts) * 100) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Arborescence Réseau</h1>
          <p className="text-slate-400 text-sm">
            OLT → Closures → X-BOX → HUB-BOX → SP → SUB-BOX → END-BOX. Clique un boîtier pour recentrer la chaîne dessus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={zone} onChange={(e) => setZone(e.target.value)} style={{ width: 'auto' }}>
            {chantiers.map((c) => (
              <option key={c.id} value={c.zone ?? ''}>
                {c.zone} — {c.nom}
              </option>
            ))}
          </Select>
          <Button onClick={openNew}>{selected ? `Ajouter sous ${selected.nom}` : 'Ajouter un nœud'}</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{zone || 'Aucune zone sélectionnée'}</CardTitle>
        </CardHeader>
        {nodesForZone.length === 0 ? (
          <EmptyState icon="" text="Aucun nœud enregistré pour cette zone" />
        ) : (
          <div className="bg-slate-900 p-8 overflow-x-auto">
            {/* Seul le chemin racine → sélection s'affiche — les enfants d'un nœud
                n'apparaissent qu'après un clic explicite sur le port qui y mène. */}
            <div className="flex items-center min-w-max">
              {ancestorChain.map((n, i) => (
                <div key={n.id} className="flex items-center">
                  {i > 0 && <Connector node={n} />}
                  <ChainNode
                    node={n}
                    selected={n.id === selected?.id}
                    childByPort={childPortMap(n)}
                    onSelect={(node) => setSelectedId(node.id)}
                    onSelectPort={(child) => selectChainEnd(child)}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ─── Panneau de détail (façon NCE) — visible quand un nœud est sélectionné ── */}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>
              Détail — {selected.nom} <span className="text-slate-400 font-normal text-sm">({TYPE_LABELS[selected.type]})</span>
            </CardTitle>
          </CardHeader>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Nom</p>
                <p className="text-slate-700">{selected.nom}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Type</p>
                <p className="text-slate-700">{TYPE_LABELS[selected.type]}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">SN</p>
                <p className="text-slate-700">{selected.sn || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Coordonnées</p>
                <p className="text-slate-700">{selected.coordonnees || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Câble entrant</p>
                <p className="text-slate-700">{selected.cableSn || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Distance réelle / Câble posé</p>
                <p className="text-slate-700">
                  {selected.cableDistanceReelleM ?? '—'}m / {selected.cableLongueurM ?? '—'}m
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Puissance optique</p>
                <p className="text-slate-700">{selected.puissanceOptiqueDbm != null ? `${selected.puissanceOptiqueDbm} dBm` : '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Raccordé via</p>
                <p className="text-slate-700">{selectedParent ? `${selectedParent.nom} — port ${selected.parentPort ?? '?'}` : '—'}</p>
              </div>
              {freeRatio !== null && (
                <div>
                  <p className="text-[11px] text-slate-400 uppercase font-bold">Ports disponibles</p>
                  <p className={`font-bold ${freeRatio < 20 ? 'text-red-600' : freeRatio < 50 ? 'text-amber-600' : 'text-green-600'}`}>
                    {freeRatio}% ({selected.nbPorts - selected.portsOccupes}/{selected.nbPorts})
                  </p>
                </div>
              )}
            </div>

            {selected.nbPorts > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">Structure interne</p>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: selected.nbPorts }).map((_, i) => {
                    const portNum = i + 1;
                    const occupied = i < selected.portsOccupes;
                    return (
                      <div
                        key={i}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                          occupied ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        {portNum}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-500 mr-1" /> Occupé
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-300 ml-4 mr-1" /> Libre
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">Port Connection Details</p>
              {selected.nbPorts === 0 ? (
                <p className="text-xs text-slate-400">Ce type de nœud n'a pas de ports.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Port No', 'Type', 'Nom', 'Câble'].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-bold text-slate-400 uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: selected.nbPorts }).map((_, i) => {
                        const portNum = i + 1;
                        const child = selectedChildren.find((c) => c.parentPort === portNum);
                        return (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700">{portNum}</td>
                            <td className="px-3 py-2 text-slate-500">{child ? TYPE_LABELS[child.type] : '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{child ? child.nom : <span className="text-slate-300">Libre</span>}</td>
                            <td className="px-3 py-2 text-slate-500">{child?.cableSn || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Ajouter un nœud réseau">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type</label>
            <Select className="w-full" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TypeNoeudReseau }))}>
              {LEVEL_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom</label>
            <Input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="ex: CA3Z05H1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Numéro de série (SN)</label>
            <Input value={form.sn} onChange={(e) => setForm((f) => ({ ...f, sn: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Parent (nœud en amont)</label>
              <Select className="w-full" value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                <option value="">-- Aucun (racine, ex: OLT) --</option>
                {nodesForZone.map((n) => (
                  <option key={n.id} value={n.id}>
                    {TYPE_LABELS[n.type]} — {n.nom}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Port du parent</label>
              <Input type="number" value={form.parentPort} onChange={(e) => setForm((f) => ({ ...f, parentPort: Number(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Câble (SN)</label>
              <Input value={form.cableSn} onChange={(e) => setForm((f) => ({ ...f, cableSn: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Distance réelle (m)</label>
              <Input
                type="number"
                value={form.cableDistanceReelleM}
                onChange={(e) => setForm((f) => ({ ...f, cableDistanceReelleM: Number(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Câble posé (m)</label>
              <Input type="number" value={form.cableLongueurM} onChange={(e) => setForm((f) => ({ ...f, cableLongueurM: Number(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nombre de ports</label>
              <Input type="number" value={form.nbPorts} onChange={(e) => setForm((f) => ({ ...f, nbPorts: Number(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ports occupés</label>
              <Input type="number" value={form.portsOccupes} onChange={(e) => setForm((f) => ({ ...f, portsOccupes: Number(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Coordonnées GPS</label>
              <Input value={form.coordonnees} onChange={(e) => setForm((f) => ({ ...f, coordonnees: e.target.value }))} placeholder="lat, lng" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Puissance optique (dBm)</label>
              <Input
                type="number"
                step="0.01"
                value={form.puissanceOptiqueDbm}
                onChange={(e) => setForm((f) => ({ ...f, puissanceOptiqueDbm: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? '...' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}