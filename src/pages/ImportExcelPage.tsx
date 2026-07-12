import { useRef, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useAppStore } from '@/store/useAppStore';
import { ZONE_EQUIPE_MAP } from '@/data';
import { getEquipeColor } from '@/utils';
import { Card, CardHeader, CardTitle, Button, TypeBadge, ZoneChip, EquipeTag, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui';
import type { Situation } from '@/types';

export default function ImportExcelPage() {
  const importSituations = useAppStore(s => s.importSituations);
  const importHistory    = useAppStore(s => s.importHistory);
  const equipes          = useAppStore(s => s.equipes);
  const { showToast }    = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);
  const [preview, setPreview]     = useState<Situation[]>([]);
  const [fileName, setFileName]   = useState('');
  const [loading, setLoading]     = useState(false);

  // ── Carte dynamique zone → équipe (Supabase en priorité, fallback statique) ──
  const zoneEquipeMap = useMemo(() => {
    const map: Record<string, string> = { ...ZONE_EQUIPE_MAP }; // fallback statique
    equipes.forEach(eq => {
      (eq.zones ?? []).forEach(z => {
        if (z) map[z.trim().toUpperCase()] = eq.name;
      });
    });
    return map;
  }, [equipes]);

  // Résout l'équipe à partir de la zone (insensible à la casse)
  const resolveEquipe = (zone: string, equipeFromFile: string): string => {
    if (equipeFromFile && equipeFromFile !== 'undefined' && equipeFromFile !== 'NaN') return equipeFromFile.trim();
    const key = zone.trim().toUpperCase();
    return zoneEquipeMap[key] ?? zoneEquipeMap[zone] ?? '';
  };

  const parseFile = (file: File) => {
    setLoading(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result as string, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { showToast('Fichier vide ou invalide', 'error'); setLoading(false); return; }

        const header = data[0].map((h: any) => String(h ?? '').trim().toUpperCase());
        const col = (keywords: string[]) => header.findIndex((h: string) => keywords.some(k => h.includes(k)));

        const colDate   = col(['DATE DEP', 'DATE_DEP', 'DATEDEPO']);
        const colType   = col(['TYPE']);
        const colFgp    = col(['FGP']);
        const colZone   = col(['ZONE']);
        const colMotif  = col(['MOTIF']);
        const colEquipe = col(['EQUIPE', 'ÉQUIPE']);
        const colDateClt= col(['DATE CLT', 'DATE_CLT', 'DATECLT']);
        const colDelai  = col(['DELAI', 'DÉLAI']);

        const rows: Situation[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[colFgp] || !row[colType]) continue;
          const fgp   = String(row[colFgp]).trim();
          const type  = String(row[colType] ?? '').trim();
          const zone  = String(row[colZone] ?? '').trim();
          const motif = String(row[colMotif] ?? '').trim();
          const equipeFromFile = colEquipe >= 0 ? String(row[colEquipe] ?? '').trim() : '';

          // ── Auto-distribution : résolution zone → équipe via Supabase ──
          const equipe = resolveEquipe(zone, equipeFromFile);

          const parseDate = (val: any) => {
            if (!val) return '';
            if (val instanceof Date) return val.toISOString().slice(0, 10);
            return String(val).slice(0, 10);
          };

          rows.push({
            id: `imp-${i}-${Date.now()}`,
            fgp, zone, motif, equipe,
            type: type as Situation['type'],
            dateDepo: parseDate(colDate >= 0 ? row[colDate] : null),
            dateClt:  parseDate(colDateClt >= 0 ? row[colDateClt] : null),
            delai: colDelai >= 0 ? parseFloat(row[colDelai]) || 0 : 0,
            status: 'pending',
            comment: '',
          });
        }

        setPreview(rows);
        const assigned   = rows.filter(r => r.equipe).length;
        const unassigned = rows.length - assigned;
        showToast(
          unassigned === 0
            ? `${rows.length} lignes lues — toutes affectées à une équipe ✓`
            : `${rows.length} lignes lues — ${assigned} affectées, ${unassigned} sans équipe (zone inconnue)`,
          unassigned === 0 ? 'success' : 'warning'
        );
      } catch (err: any) {
        showToast('Erreur lecture: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) parseFile(file);
    else showToast('Format invalide. Utiliser .xlsx ou .xls', 'error');
  };

  const confirmImport = () => {
    const assigned   = preview.filter(r => r.equipe).length;
    const unassigned = preview.length - assigned;
    importSituations(preview, fileName);
    setPreview([]); setFileName('');
    showToast(
      `✅ ${preview.length} situations importées — ${assigned} distribuées automatiquement${
        unassigned > 0 ? ` · ${unassigned} sans équipe (vérifier les zones)` : ''
      }`,
      unassigned > 0 ? 'warning' : 'success'
    );
  };

  // Stats de la preview
  const previewStats = useMemo(() => {
    const byEquipe: Record<string, number> = {};
    preview.forEach(r => {
      const key = r.equipe || '❓ Non affectée';
      byEquipe[key] = (byEquipe[key] ?? 0) + 1;
    });
    return byEquipe;
  }, [preview]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Import Programme Excel</h1>
        <p className="text-slate-400 text-sm mt-0.5">Format accepté: DATE DEPO · TYPE · FGP · ZONE · MOTIF · EQUIPE</p>
      </div>

      {/* Upload zone */}
      <Card className="p-6">
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="text-5xl mb-3">{loading ? '⏳' : '📊'}</div>
          <p className="text-slate-600 font-medium">{loading ? 'Lecture en cours...' : <><strong className="text-blue-700">Cliquer ou glisser</strong> votre fichier Excel ici</>}</p>
          <p className="text-slate-400 text-sm mt-1">Formats: .xlsx, .xls</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }} />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div>
                <span className="font-semibold text-slate-700">{preview.length} lignes détectées</span>
                <span className="text-slate-400 text-sm ml-2">— {fileName}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setPreview([]); setFileName(''); }}>Annuler</Button>
                <Button variant="success" size="sm" onClick={confirmImport}>✅ Confirmer Import</Button>
              </div>
            </div>

            {/* ── Résumé de distribution par équipe ── */}
            <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xs font-bold text-blue-700 mb-2">📊 Distribution automatique par équipe</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(previewStats).map(([eq, count]) => (
                  <span
                    key={eq}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      eq.startsWith('❓') ? 'bg-orange-100 text-orange-700' : 'bg-white border border-blue-200 text-blue-800'
                    }`}
                  >
                    <span>{eq}</span>
                    <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">{count}</span>
                  </span>
                ))}
              </div>
              {previewStats['❓ Non affectée'] && (
                <p className="text-xs text-orange-600 mt-2">
                  ⚠️ {previewStats['❓ Non affectée']} situation(s) sans équipe — zones non reconnues dans Supabase
                </p>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['#','FGP','Type','Zone','Motif','Équipe','Date Dépôt','Délai'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((row, i) => (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-800">{row.fgp}</td>
                      <td className="px-3 py-2"><TypeBadge type={row.type} /></td>
                      <td className="px-3 py-2"><ZoneChip zone={row.zone} /></td>
                      <td className="px-3 py-2 text-xs text-slate-400 max-w-24 truncate">{row.motif || '—'}</td>
                      <td className="px-3 py-2"><EquipeTag name={row.equipe || '?'} color={getEquipeColor(row.equipe)} /></td>
                      <td className="px-3 py-2 text-xs text-slate-400">{row.dateDepo || '—'}</td>
                      <td className="px-3 py-2 text-xs text-center">{row.delai}j</td>
                    </tr>
                  ))}
                  {preview.length > 100 && (
                    <tr><td colSpan={8} className="text-center py-3 text-slate-400 text-xs">... et {preview.length - 100} lignes supplémentaires</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* History */}
      <Card>
        <CardHeader><CardTitle>📁 Historique des Imports</CardTitle></CardHeader>
        {importHistory.length === 0 ? (
          <EmptyState icon="📂" text="Aucun import récent" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Fichier</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Lignes</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Par</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.map(h => (
                <tr key={h.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">📊 {h.fileName}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{h.date}</td>
                  <td className="px-4 py-3"><strong>{h.count}</strong> lignes</td>
                  <td className="px-4 py-3"><EquipeTag name={h.by} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
