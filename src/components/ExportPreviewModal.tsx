import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { SOCIETE } from '@/utils/leaves';
import type { ExportPreview, PreviewVirementSheet, PreviewRecapSheet } from '@/utils/leaves';

const C = { accent: '#0A7F94', dark: '#075A68', band: '#EAF5F7', total: '#D6EDF1', info: '#F4FAFB', border: '#B9DCE2' };
const fmt = (n?: number) => (n == null ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const cell = { border: `1px solid ${C.border}` };

function VirementView({ s, logo, signature }: { s: PreviewVirementSheet; logo: string; signature: string }) {
  const heads = ['Ordre', 'Mle', 'NOM et PRENOM', 'Banque', s.banque === 'BPM' ? 'Numéro de compte' : 'RIB', 'Montant (MRU)'];
  return (
    <div className="bg-white shadow border border-slate-200 mx-auto p-6 text-[13px] text-slate-800" style={{ maxWidth: 820, fontFamily: '"Times New Roman", serif' }}>
      <img src={logo} alt="GSS" className="h-16 mb-2" />
      <div className="py-1.5 px-3 mb-3" style={{ background: C.info, borderLeft: `3px solid ${C.dark}` }}>
        <p>{SOCIETE.siege}</p>
        <p>{SOCIETE.rc}</p>
        <p className="font-bold">{SOCIETE.nif}</p>
      </div>
      <p className="text-right italic">Nouakchott, le {s.dateStr}</p>
      <h2 className="text-center font-bold text-xl py-2 mb-3" style={{ color: C.dark, borderBottom: `2px solid ${C.accent}` }}>
        ORDRE DE VIREMENT N° {s.ordreNum}
      </h2>
      <p className="text-center font-bold">A</p>
      <p className="text-center font-bold mb-2">{SOCIETE.destinataire}</p>
      <p>{SOCIETE.compte} <strong style={{ color: C.dark }}>{fmt(s.total)} MRU</strong></p>
      <p>En chiffres : <strong style={{ color: C.dark }}>{fmt(s.total)} MRU</strong></p>
      <p>En lettres : <strong>{s.totalLettres}</strong></p>
      <p className="font-bold underline mt-2">Motif : Paiement employés pour le mois de {s.motifMois}</p>
      <p>En faveur de nos employés conformément au tableau suivant :</p>
      <p>Nombre : <strong>{s.rows.length}</strong></p>

      <table className="w-full border-collapse mt-3 text-xs">
        <thead>
          <tr style={{ background: C.accent }}>
            {heads.map((h) => (
              <th key={h} className="px-2 py-1.5 text-white font-bold text-center" style={cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? C.band : undefined }}>
              <td className="px-2 py-1 text-center" style={cell}>{r.ordre}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.mle}</td>
              <td className="px-2 py-1" style={cell}>{r.name}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.banque}</td>
              <td className="px-2 py-1 text-center whitespace-nowrap" style={{ ...cell, fontFamily: 'Arial, sans-serif' }}>{r.rib}</td>
              <td className="px-2 py-1 text-right" style={cell}>{fmt(r.montant)}</td>
            </tr>
          ))}
          <tr className="font-bold" style={{ background: C.total, color: C.dark }}>
            <td colSpan={5} className="px-2 py-1.5 text-right" style={{ ...cell, borderTop: `2px solid ${C.dark}` }}>TOTAL</td>
            <td className="px-2 py-1.5 text-right" style={{ ...cell, borderTop: `2px solid ${C.dark}` }}>{fmt(s.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8 text-center">
        <p className="font-bold underline text-sm" style={{ color: C.dark }}>{SOCIETE.signataire}</p>
        <img src={signature} alt="Signature" className="h-14 mx-auto mt-1" />
      </div>
    </div>
  );
}

function RecapView({ s }: { s: PreviewRecapSheet }) {
  const heads = ['Ordre', 'Mle', 'Nom et prénom', 'Poste', 'Ville', 'Équipe', 'Banque', 'RIB / N° compte', 'Montant (MRU)', 'Remarque'];
  return (
    <div className="bg-white shadow border border-slate-200 p-4 overflow-x-auto" style={{ fontFamily: '"Times New Roman", serif' }}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ background: C.accent }}>
            {heads.map((h) => (
              <th key={h} className="px-2 py-1.5 text-white font-bold text-center whitespace-nowrap" style={cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? C.band : undefined }}>
              <td className="px-2 py-1 text-center" style={cell}>{r.ordre}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.mle}</td>
              <td className="px-2 py-1" style={cell}>{r.name}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.poste}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.ville}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.equipe}</td>
              <td className="px-2 py-1 text-center" style={cell}>{r.banque}</td>
              <td className="px-2 py-1 text-center whitespace-nowrap" style={cell}>{r.rib}</td>
              <td className="px-2 py-1 text-right" style={cell}>{fmt(r.montant)}</td>
              <td className="px-2 py-1 font-bold" style={{ ...cell, color: r.remarque ? C.dark : undefined }}>{r.remarque}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExportPreviewModal({
  open, preview, onClose, onConfirm,
}: {
  open: boolean;
  preview: ExportPreview | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setActive(0);
  }, [open]);

  if (!open || !preview) return null;
  const sheet = preview.sheets[active];

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-slate-100 rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white rounded-t-xl">
          <h3 className="font-black text-slate-900">Aperçu avant export</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        {preview.sheets.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-sm">Aucune feuille à exporter (aucun employé présent sur ce mois).</p>
        ) : (
          <>
            <div className="flex gap-1.5 px-5 pt-3 flex-wrap">
              {preview.sheets.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => setActive(i)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-t-lg ${i === active ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {sheet.kind === 'virement'
                ? <VirementView s={sheet} logo={preview.logo} signature={preview.signature} />
                : <RecapView s={sheet} />}
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 px-5 py-3 border-t border-slate-200 bg-white rounded-b-xl">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button onClick={confirm} disabled={busy || preview.sheets.length === 0}>
            {busy ? 'Génération…' : 'Télécharger le fichier Excel'}
          </Button>
        </div>
      </div>
    </div>
  );
}