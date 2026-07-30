import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getEquipeColor } from '@/utils';
import { calcDelai, isHorsDelai, countPoteaux, MERGED_TYPES } from '@/utils/stats';
import {
  Card,
  CardHeader,
  Button,
  TypeBadge,
  StatusBadge,
  ZoneChip,
  EquipeTag,
  Modal,
  NOKSheet,
  OKSheet,
  Select,
  Textarea,
  EmptyState,
} from '@/components/ui';
import type { OKSheetValues } from '@/components/ui';
import { useToast } from '@/components/ui';
import { errMsg } from '@/utils';

export default function SituationsPage() {
  const situations = useAppStore((s) => s.situations);
  const equipes = useAppStore((s) => s.equipes);
  const scans = useAppStore((s) => s.scans);
  const loadScans = useAppStore((s) => s.loadScans);
  const user = useAppStore((s) => s.user)!;
  const markOK = useAppStore((s) => s.markOK);
  const markNonOK = useAppStore((s) => s.markNonOK);
  const addSituationManual = useAppStore((s) => s.addSituationManual);
  const { showToast } = useToast();

  const isAdmin = user.role === 'admin' || user.role === 'superviseur';

  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('');
  const [fEquipe, setFEquipe] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fDate, setFDate] = useState('');
  // Vue par défaut : seulement les situations pas encore décidées (en attente / en
  // cours) — le bouton pour voir tout l'historique a été retiré ; l'historique
  // reste accessible via les filtres Statut ou Date, qui lèvent cette restriction.
  const showEnCoursOnly = true;
  const [fgpOpen, setFgpOpen] = useState(false);
  const [nokFgp, setNokFgp] = useState('');
  const [nokId, setNokId] = useState('');
  const [nokInitialComment, setNokInitialComment] = useState('');
  const [nokOpen, setNokOpen] = useState(false);

  const [okOpen, setOkOpen] = useState(false);
  const [okId, setOkId] = useState('');
  const [okFgp, setOkFgp] = useState('');
  const [okInitialValues, setOkInitialValues] = useState<OKSheetValues>({
    poteau: 0,
    equipe: '',
    motif: '',
    dateClt: '',
    rxDbm: '',
    rangingM: '',
    scanStatut: 'NON SCANE',
  });

  // Urgence form
  const allZones = useMemo(() => [...new Set(situations.map((s) => s.zone))].sort(), [situations]);

  // ── Correspondance Scans Réseau ↔ Situations : ONU Name == FGP ──
  // On charge les scans une seule fois (silencieux si déjà en mémoire) pour pouvoir
  // afficher l'état réseau (scanné/non scanné, qualité signal) de chaque FGP.
  useEffect(() => {
    if (isAdmin && scans.length === 0) loadScans();
  }, [isAdmin]);
  // Normalisation utilisée des DEUX côtés (clé de la map ET lookup) : trim + majuscules.
  // Sans ça, une différence de casse ou un espace superflu entre s.fgp (Situations) et
  // sc.onuName (Scans) fait échouer silencieusement la correspondance → colonnes réseau
  // vides ("—") alors que le FGP existe bel et bien dans le fichier de scan.
  const normalizeKey = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();
  const scanByFgp = useMemo(() => {
    const map = new Map<string, (typeof scans)[number]>();
    scans.forEach((sc) => {
      if (sc.onuName) map.set(normalizeKey(sc.onuName), sc);
    });
    return map;
  }, [scans]);
  const [fgpValue, setFgpValue] = useState('');
  const [fgpType, setFgpType] = useState('DRG');
  const [fgpZone, setFgpZone] = useState('');
  const [fgpMotif, setFgpMotif] = useState('');
  const [fgpEquipe, setFgpEquipe] = useState('');

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      situations.filter((s) => {
        if (search && !s.fgp.includes(search) && !s.zone.toLowerCase().includes(search.toLowerCase())) return false;
        if (fType === '__installation__' && !MERGED_TYPES.includes(s.type)) return false;
        else if (fType === '__derangement__' && s.type !== 'DRG') return false;
        else if (fType && fType !== '__installation__' && fType !== '__derangement__' && s.type !== fType) return false;
        if (fEquipe && s.equipe?.toLowerCase() !== fEquipe.toLowerCase()) return false;
        if (fStatus && s.status !== fStatus) return false;
        if (fDate && (s.dateDepo || s.dateMessage) !== fDate) return false;
        // Vue par défaut : seulement les situations pas encore décidées (en attente / en
        // cours) — OK et NON OK sont des issues finales, désactivable via le bouton.
        if (showEnCoursOnly && !fStatus && !fDate) {
          if (s.status !== 'pending' && s.status !== 'in_progress') return false;
        }
        return true;
      }),
    [situations, search, fType, fEquipe, fStatus, fDate, showEnCoursOnly],
  );

  // Colonnes réduites tant qu'on est dans la vue "en cours" par défaut (sans filtre
  // statut/date explicite) — vue simplifiée pour aller à l'essentiel au quotidien.
  const isEnCoursView = showEnCoursOnly && !fStatus && !fDate;

  // Remise à la page 1 quand un filtre change — ajustée PENDANT le rendu (pattern
  // recommandé par React) plutôt que dans un useEffect, qui provoquerait un rendu
  // supplémentaire inutile ("Calling setState synchronously within an effect").
  const filterKey = `${search}|${fType}|${fEquipe}|${fStatus}|${fDate}|${showEnCoursOnly}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const openOkSheet = (s: (typeof situations)[number]) => {
    const sc = scanByFgp.get(s.fgp);
    const defaultPoteau = s.poteau && s.poteau > 0 ? s.poteau : countPoteaux(s.motif);
    const today = new Date().toISOString().slice(0, 10);
    setOkId(s.id);
    setOkFgp(s.fgp);
    setOkInitialValues({
      poteau: defaultPoteau || 0,
      equipe: s.equipe || '',
      motif: s.motif || '',
      dateClt: s.dateClt || today,
      rxDbm: s.rxDbm ?? sc?.rxPower ?? '',
      rangingM: s.rangingM ?? sc?.ranging ?? '',
      scanStatut: s.scanStatut ?? sc?.result ?? 'NON SCANE',
    });
    setOkOpen(true);
  };

  const handleOkConfirm = async (values: OKSheetValues) => {
    try {
      await markOK(okId, {
        poteau: values.poteau,
        equipe: values.equipe,
        motif: values.motif,
        dateClt: values.dateClt,
        rxDbm: values.rxDbm === '' ? undefined : values.rxDbm,
        rangingM: values.rangingM === '' ? undefined : values.rangingM,
        scanStatut: values.scanStatut,
      });
      setOkOpen(false);
      showToast(`FGP ${okFgp} marqué OK `, 'success');
    } catch (err: unknown) {
      showToast("Échec — non enregistré : " + errMsg(err), 'error');
    }
  };
  const handleMarkNOK = (id: string, fgp: string, existingComment = '') => {
    setNokId(id);
    setNokFgp(fgp);
    setNokInitialComment(existingComment);
    setNokOpen(true);
  };
  const handleNOKConfirm = async (comment: string) => {
    try {
      await markNonOK(nokId, comment);
      setNokOpen(false);
      showToast(`FGP ${nokFgp} — NON OK enregistré`, 'warning');
    } catch (err: unknown) {
      showToast("Échec — non enregistré : " + errMsg(err), 'error');
    }
  };

  const submitFgp = async () => {
    if (!fgpValue.trim()) {
      showToast('Le numéro FGP est obligatoire', 'error');
      return;
    }
    if (!fgpType.trim()) {
      showToast('Le type est obligatoire', 'error');
      return;
    }
    const zone = fgpZone || allZones[0];
    await addSituationManual(fgpValue.trim(), fgpType, zone, fgpMotif.trim(), fgpEquipe || undefined);
    setFgpOpen(false);
    setFgpValue('');
    setFgpMotif('');
    setFgpEquipe('');
    showToast(`FGP ${fgpValue.trim()} créé → ${fgpEquipe || 'auto-assigné'} `, 'success');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Situations</h1>
          <p className="text-slate-400 text-sm">
            {filtered.length} / {situations.length} situations
            {showEnCoursOnly && !fStatus && !fDate && <span className="text-blue-600 font-medium"> — en cours seulement</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" icon="" onClick={() => setFgpOpen(true)}>
              Créer un FGP
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-48">
              <span className="text-slate-400"></span>
              <input
                className="bg-transparent text-sm focus:outline-none flex-1"
                placeholder="Rechercher FGP, zone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={fType} onChange={(e) => setFType(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous types</option>
              <option value="__installation__">Installation (CPL/TRL/CMI/CLS/RLR/CST/ANS)</option>
              <option value="__derangement__">Dérangement (DRG)</option>
              {['CPL', 'DRG', 'TRL', 'CST', 'ANS', 'CLS', 'CMI', 'RLR'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select value={fEquipe} onChange={(e) => setFEquipe(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Toutes équipes</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous statuts</option>
              <option value="pending">En attente</option>
              <option value="in_progress">En cours</option>
              <option value="ok">OK</option>
              <option value="non_ok">NON OK</option>
              <option value="urgent">Urgent</option>
            </Select>
            <input
              type="date"
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
              title="Filtrer par date de dépôt"
            />
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState icon="" text="Aucune situation trouvée" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {(isEnCoursView
                    ? ['FGP', 'Type', 'Date Message', 'Zone', 'Statut', 'Actions']
                    : [
                        'FGP',
                        'Type',
                        'Date Message',
                        'Service Dest.',
                        'Zone',
                        'Date Dépôt',
                        'Date Mise en Service',
                        'Motif',
                        'Poteau',
                        'Équipe',
                        'Délai',
                        'Conformité',
                        'Réseau',
                        'ONU Install Time',
                        'Port ID',
                        'ONU ID',
                        'SN/MAC',
                        'Rx (dBm)',
                        'Ranging (m)',
                        'Remarque',
                        'Clôturé par',
                        'Statut',
                        'Actions',
                      ]
                  ).map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((s) => {
                  const sc = scanByFgp.get(normalizeKey(s.fgp));
                  return (
                  <tr
                    key={s.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${s.isUrgent ? 'bg-orange-50/30' : ''}`}
                  >
                    <td className="px-3 py-3 font-bold text-slate-800">
                      {s.fgp}
                      {s.isUrgent && <span className="ml-1 text-orange-500 text-xs"></span>}
                    </td>
                    <td className="px-3 py-3">
                      <TypeBadge type={s.type} />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateMessage || '—'}</td>
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-400">{s.serviceDestination || '—'}</td>
                    )}
                    <td className="px-3 py-3">
                      <ZoneChip zone={s.zone} />
                    </td>
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateDepo || '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{s.dateClt || '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-500 max-w-40 truncate" title={s.status === 'non_ok' && s.comment ? s.comment : s.motif}>
                      {s.status === 'non_ok' && s.comment ? (
                        <span className="text-red-600 font-medium">{s.comment}</span>
                      ) : (
                        s.motif || '—'
                      )}
                    </td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">
                      {(() => {
                        const nb = s.poteau && s.poteau > 0 ? s.poteau : countPoteaux(s.motif);
                        return nb > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">{nb}</span>
                        ) : (
                          '—'
                        );
                      })()}
                    </td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3">
                      <EquipeTag name={s.equipe || '—'} color={getEquipeColor(s.equipe, equipes)} />
                    </td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">
                      {s.status === 'non_ok' && MERGED_TYPES.includes(s.type)
                        ? '—'
                        : s.dateDepo || s.dateMessage
                          ? `${calcDelai(s)}j`
                          : '—'}
                    </td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">
                      {!(s.status === 'non_ok' && MERGED_TYPES.includes(s.type)) && (s.dateDepo || s.dateMessage) ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${isHorsDelai(s) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                        >
                          {isHorsDelai(s) ? 'HorsDélais' : 'TLID'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">
                      {(() => {
                        if (!sc) return <span className="text-slate-300">—</span>;
                        if (sc.result !== 'SCANNE') {
                          return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">Non scanné</span>;
                        }
                        const rx = sc.rxPower;
                        const quality = rx == null ? null : rx >= -22 ? 'Excellent' : rx >= -25 ? 'Moyen' : 'Dégradé';
                        const color =
                          quality === 'Excellent'
                            ? 'bg-green-100 text-green-700'
                            : quality === 'Moyen'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700';
                        return (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${color}`} title={rx != null ? `${rx} dBm` : ''}>
                            {quality ?? 'Scanné'}
                          </span>
                        );
                      })()}
                    </td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{sc?.timeAddedToNms || '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">{sc?.portId ?? '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">{sc?.onuId ?? '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-400">{sc?.snMac || '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">{sc?.rxPower != null ? sc.rxPower : '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-center">{sc?.ranging != null ? sc.ranging : '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-400 max-w-32 truncate">{sc?.remarque || '—'}</td>
                    )}
                    {!isEnCoursView && (
                    <td className="px-3 py-3 text-xs text-slate-500">{s.closedBy || '—'}</td>
                    )}
                    <td className="px-3 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        {s.status !== 'ok' && (
                          <button
                            onClick={() => openOkSheet(s)}
                            title="Marquer OK"
                            className="px-3 py-2 text-xs font-bold rounded-lg transition-colors active:scale-95 bg-green-100 hover:bg-green-600 hover:text-white text-green-700"
                          >
                            OK
                          </button>
                        )}
                        {s.status !== 'non_ok' && (
                          <button
                            onClick={() => handleMarkNOK(s.id, s.fgp, '')}
                            title="Marquer NON OK"
                            className="px-3 py-2 text-xs font-bold rounded-lg transition-colors active:scale-95 bg-red-100 hover:bg-red-600 hover:text-white text-red-700"
                          >
                            NOK
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-3 py-3 border-t border-slate-100 flex-wrap gap-2">
            <p className="text-xs text-slate-400">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Précédent
              </Button>
              <span className="text-xs text-slate-500 font-medium px-1">
                Page {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Créer un FGP Modal */}
      <Modal open={fgpOpen} onClose={() => setFgpOpen(false)} title="Créer un FGP">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">FGP *</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={fgpValue}
              onChange={(e) => setFgpValue(e.target.value)}
              placeholder="ex: 223344"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type</label>
            <Select className="w-full" value={fgpType} onChange={(e) => setFgpType(e.target.value)}>
              {['DRG', 'CPL', 'TRL', 'CST', 'ANS', 'CLS', 'CMI', 'RLR'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Zone</label>
            <Select className="w-full" value={fgpZone || allZones[0]} onChange={(e) => setFgpZone(e.target.value)}>
              {allZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">
              Affecter à l'équipe <span className="text-slate-300 font-normal">(optionnel — sinon auto par zone)</span>
            </label>
            <Select className="w-full" value={fgpEquipe} onChange={(e) => setFgpEquipe(e.target.value)}>
              <option value="">Auto (par zone)</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name} — {e.leader}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Motif (Tel client + Problème)</label>
            <Textarea
              rows={4}
              value={fgpMotif}
              onChange={(e) => setFgpMotif(e.target.value)}
              placeholder={'Client: 46464646\nPas de signal fibre'}
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setFgpOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitFgp}>Créer le FGP</Button>
          </div>
        </div>
      </Modal>

      {/* NOK sheet */}
      <NOKSheet
        open={nokOpen}
        fgp={nokFgp}
        initialComment={nokInitialComment}
        onClose={() => setNokOpen(false)}
        onConfirm={handleNOKConfirm}
      />

      {/* OK sheet — clôture avec détails (poteau, équipe, motif, date, Rx, Ranging) */}
      <OKSheet
        open={okOpen}
        fgp={okFgp}
        initialValues={okInitialValues}
        equipesOptions={equipes}
        onClose={() => setOkOpen(false)}
        onConfirm={handleOkConfirm}
      />
    </div>
  );
}