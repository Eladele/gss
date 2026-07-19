import React, { useEffect, useState, createContext, useContext, useCallback } from 'react';
import type { SituationStatus, SituationType } from '@/types';
import { statusLabel, statusColors, typeColors } from '@/utils';

// ─── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: SituationStatus }) {
  const c = statusColors(status);
  const icons: Record<SituationStatus, string> = {
    pending: '⏳', in_progress: '🔄', ok: '✓', non_ok: '✗', urgent: '⚠',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {icons[status]} {statusLabel(status)}
    </span>
  );
}

// ─── TypeBadge ────────────────────────────────────────────────────────────────
export function TypeBadge({ type }: { type: SituationType }) {
  const c = typeColors(type);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${c.bg} ${c.text}`}>
      {type}
    </span>
  );
}

// ─── ZoneChip ─────────────────────────────────────────────────────────────────
export function ZoneChip({ zone }: { zone: string }) {
  return (
    <span className="inline-block bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-xs font-mono font-bold border border-blue-200">
      {zone}
    </span>
  );
}

// ─── EquipeTag ────────────────────────────────────────────────────────────────
export function EquipeTag({ name, color }: { name: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white"
      style={{ background: color ?? '#546E7A' }}
    >
      {name}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost';
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...props }: BtnProps) {
  const base = 'inline-flex items-center gap-2 font-semibold rounded-lg cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-blue-700 hover:bg-blue-800 text-white shadow-sm',
    success: 'bg-green-700 hover:bg-green-800 text-white shadow-sm',
    danger:  'bg-red-700  hover:bg-red-800  text-white shadow-sm',
    warning: 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm',
    outline: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700',
    ghost:   'bg-transparent hover:bg-slate-100 text-slate-600',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-base',
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
      {children}
    </div>
  );
}
export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap ${className}`}>{children}</div>;
}
export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold text-slate-800 text-sm">{children}</h3>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-modal-in">
        <h2 className="text-lg font-bold text-slate-800 mb-5">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ─── NOKSheet (mobile bottom sheet) ──────────────────────────────────────────
export function NOKSheet({ open, fgp, onClose, onConfirm }: { open: boolean; fgp: string; onClose: () => void; onConfirm: (comment: string) => void }) {
  const [comment, setComment] = useState('');
  useEffect(() => { if (open) setComment(''); }, [open]);
  const valid = comment.trim().length >= 3;
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl p-5 shadow-2xl animate-slide-up">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <p className="font-bold text-red-700 text-base mb-1">NON OK — FGP {fgp}</p>
        <p className="text-xs text-slate-500 mb-3">Commentaire obligatoire ✱</p>
        <textarea
          className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500 bg-slate-50"
          rows={4}
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Ex: Pas de signal fibre, client absent, poteau cassé..."
          autoFocus
        />
        <div className="flex gap-3 mt-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button variant="danger" className="flex-1" disabled={!valid} onClick={() => { onConfirm(comment.trim()); }}>
            ✗ Confirmer NON OK
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; message: string; type: 'success' | 'error' | 'warning' | 'info'; }
interface ToastCtx { showToast: (msg: string, type?: Toast['type']) => void; }

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const bgs = { success: 'bg-green-700', error: 'bg-red-700', warning: 'bg-orange-600', info: 'bg-slate-800' };
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`${bgs[t.type]} text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 min-w-64 animate-fade-in`}>
            {icons[t.type]} {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ value, label, icon, accent }: { value: number | string; label: string; icon: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: accent ?? '#1565C0' }} />
      <div className="text-3xl font-black text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1 font-medium">{label}</div>
      <div className="absolute top-4 right-4 text-2xl opacity-10">{icon}</div>
    </div>
  );
}

// ─── Input / Select / Textarea ────────────────────────────────────────────────
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white ${props.className ?? ''}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white ${props.className ?? ''}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white resize-none ${props.className ?? ''}`} />;
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-5xl mb-3 opacity-30">{icon}</div>
      <p className="text-slate-400 text-sm">{text}</p>
    </div>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color ?? '#1565C0' }} />
    </div>
  );
}
