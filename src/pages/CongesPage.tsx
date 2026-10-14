import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
    Card, CardHeader, CardTitle, Button, Modal, Select, Input, Textarea,
    EmptyState, StatCard, useToast,
} from '@/components/ui';
import { buildExportPreview, exportEmployesPresentsExcel } from '@/utils/leaves';
import { ExportPreviewModal } from '@/components/ExportPreviewModal';
import { SignaturePad } from '@/components/signaturePad';
import { DEFAULT_SIGNATURE } from '@/utils/signature';
import { BANQUES } from '@/data';
import type { Employee, LeaveType, LeaveRecord } from '@/types';
import type { ExportPreview } from '@/utils/leaves';

// ─── Constants ─────────────────────────────────────────────────────────────
const SOLDE_ANNUEL = 22;

const LEAVE_LABELS: Record<LeaveType, string> = {
    annuel: 'Congé annuel',
    maladie: 'Congé maladie',
    sans_solde: 'Sans solde',
    exceptionnel: 'Exceptionnel',
    maternite: 'Maternité',
    autre: 'Autre',
};

const LEAVE_COLORS: Record<LeaveType, { bg: string; text: string; border: string }> = {
    annuel:       { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
    maladie:      { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
    sans_solde:   { bg: 'bg-slate-100', text: 'text-slate-600',  border: 'border-slate-200' },
    exceptionnel: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
    maternite:    { bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200' },
    autre:        { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const AVATAR_PALETTE = ['#1565C0', '#2E7D32', '#E9A93B', '#8E24AA', '#00838F', '#C62828', '#546E7A'];
function colorFor(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function initials(name: string) {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function daysBetween(a: string, b: string): number {
    if (!a || !b) return 0;
    const d1 = new Date(a), d2 = new Date(b);
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
}
function isOnLeaveToday(l: LeaveRecord): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d1 = new Date(l.dateDebut);
    const d2 = new Date(l.dateFin);
    return d1 <= today && today <= d2;
}
function formatDate(iso: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Boutons actions réutilisables ──────────────────────────────────────────
function BtnEdit({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all hover:shadow-sm"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Modifier
        </button>
    );
}
function BtnDelete({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all hover:shadow-sm"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Supprimer
        </button>
    );
}
function BtnAddConge({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-all hover:shadow-sm"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Congé
        </button>
    );
}

// ─── Section tabs ───────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'employes' | 'historique' | 'export';

export default function CongesPage() {
    const employees          = useAppStore((s) => s.employees);
    const leaves             = useAppStore((s) => s.leaves);
    const loans              = useAppStore((s) => s.loans);
    const loadEmployees      = useAppStore((s) => s.loadEmployees);
    const addLeave           = useAppStore((s) => s.addLeave);
    const editLeave          = useAppStore((s) => s.editLeave);
    const removeLeave        = useAppStore((s) => s.removeLeave);
    const editEmployee       = useAppStore((s) => s.editEmployee);
    const removeEmployee     = useAppStore((s) => s.removeEmployee);
    const directorSignature  = useAppStore((s) => s.directorSignature);
    const setDirectorSignature = useAppStore((s) => s.setDirectorSignature);
    const { showToast } = useToast();

    useEffect(() => { loadEmployees(); }, []);

    // ── Tabs ──────────────────────────────────────────────────────────────────
    const [tab, setTab] = useState<Tab>('dashboard');

    // ── Filtres dashboard ─────────────────────────────────────────────────────
    const [dashSearch, setDashSearch] = useState('');
    const [dashVille, setDashVille]   = useState('');

    // ── Filtres onglet Employés ───────────────────────────────────────────────
    const [searchEmp, setSearchEmp]   = useState('');
    const [empVille, setEmpVille]     = useState('');

    // ── Filtres historique ────────────────────────────────────────────────────
    const [filterType, setFilterType]         = useState<LeaveType | ''>('');
    const [filterMonth, setFilterMonth]       = useState('');
    const [filterEmpSearch, setFilterEmpSearch] = useState('');

    // ── Modal congé ───────────────────────────────────────────────────────────
    const [congeModal, setCongeModal]       = useState(false);
    const [congeEmployee, setCongeEmployee] = useState<Employee | null>(null);
    const [editingLeave, setEditingLeave]   = useState<LeaveRecord | null>(null);
    const [leaveForm, setLeaveForm]         = useState({ type: 'annuel' as LeaveType, dateDebut: '', dateFin: '', motif: '' });

    // ── Modal employé (modifier) ──────────────────────────────────────────────
    const [empModal, setEmpModal]       = useState(false);
    const [editingEmp, setEditingEmp]   = useState<Employee | null>(null);
    const [empForm, setEmpForm]         = useState<Partial<Employee>>({ actif: true });

    // ── Export ────────────────────────────────────────────────────────────────
    const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [exportOrdre, setExportOrdre] = useState('020/DG/GSS/2026');
    const FEUILLES_DISPO = ['BPM', 'Caisse', 'SGM', 'Récap'];
    const [feuilles, setFeuilles]       = useState<string[]>(FEUILLES_DISPO);
    const toggleFeuille = (f: string) =>
        setFeuilles((p) => p.includes(f) ? p.filter((x) => x !== f) : [...p, f]);
    const [sigModal, setSigModal]       = useState(false);
    const [preview, setPreview]         = useState<ExportPreview | null>(null);

    // ── Derived ───────────────────────────────────────────────────────────────
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

    const enCongeAujourdHui = useMemo(() => leaves.filter(isOnLeaveToday), [leaves]);
    const enCongeIds = useMemo(() => new Set(enCongeAujourdHui.map(l => l.employeeId)), [enCongeAujourdHui]);

    /** Liste des villes disponibles */
    const villes = useMemo(() =>
        [...new Set(employees.map(e => e.ville).filter(Boolean))].sort() as string[]
    , [employees]);

    /** Solde annuel restant */
    const soldeFor = (empId: string) => {
        const taken = leaves.filter(l => l.employeeId === empId && l.type === 'annuel').reduce((a, l) => a + l.jours, 0);
        return SOLDE_ANNUEL - taken;
    };

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const actifs    = employees.filter(e => e.actif);
        const poste = (e: Employee) => (e.poste ?? '').toLowerCase();
        return {
            enConge:      enCongeAujourdHui.length,
            presents:     actifs.filter(e => !enCongeIds.has(e.id)).length,
            totalConges:  leaves.length,
            joursConsommes: leaves.filter(l => l.type === 'annuel').reduce((a, l) => a + l.jours, 0),
            chefs:        actifs.filter(e => poste(e).includes('chef')).length,
            techniciens:  actifs.filter(e => poste(e).includes('technicien')).length,
            superviseurs: actifs.filter(e => poste(e).includes('superviseur')).length,
        };
    }, [enCongeAujourdHui, employees, leaves, enCongeIds]);

    // ── Présents filtrés (dashboard) ──────────────────────────────────────────
    const presentsFiltered = useMemo(() => {
        return employees.filter(e => {
            if (!e.actif || enCongeIds.has(e.id)) return false;
            if (dashVille && e.ville !== dashVille) return false;
            if (dashSearch) {
                const q = dashSearch.toLowerCase();
                return e.name.toLowerCase().includes(q) ||
                    (e.mle ?? '').includes(dashSearch) ||
                    (e.equipeNom ?? '').toLowerCase().includes(q);
            }
            return true;
        });
    }, [employees, enCongeIds, dashVille, dashSearch]);

    // ── Employés filtrés (onglet Employés) ────────────────────────────────────
    const filteredEmployees = useMemo(() =>
        employees.filter(e => {
            if (empVille && e.ville !== empVille) return false;
            if (!searchEmp) return true;
            const q = searchEmp.toLowerCase();
            return e.name.toLowerCase().includes(q) ||
                (e.mle ?? '').includes(searchEmp) ||
                (e.equipeNom ?? '').toLowerCase().includes(q);
        })
    , [employees, searchEmp, empVille]);

    // ── Congés filtrés (historique) ───────────────────────────────────────────
    const filteredLeaves = useMemo(() => {
        return leaves.filter(l => {
            if (filterType && l.type !== filterType) return false;
            if (filterMonth) {
                const [y, m] = filterMonth.split('-').map(Number);
                const start = new Date(y, m - 1, 1);
                const end   = new Date(y, m, 0, 23, 59, 59);
                const d1 = new Date(l.dateDebut), d2 = new Date(l.dateFin);
                if (!(d1 <= end && d2 >= start)) return false;
            }
            if (filterEmpSearch) {
                const emp = employees.find(e => e.id === l.employeeId);
                if (!emp) return false;
                const q = filterEmpSearch.toLowerCase();
                if (!emp.name.toLowerCase().includes(q) && !(emp.mle ?? '').includes(filterEmpSearch)) return false;
            }
            return true;
        });
    }, [leaves, filterType, filterMonth, filterEmpSearch, employees]);

    // ── Handlers congé ────────────────────────────────────────────────────────
    const openNewConge = (emp: Employee) => {
        setCongeEmployee(emp);
        setEditingLeave(null);
        setLeaveForm({ type: 'annuel', dateDebut: '', dateFin: '', motif: '' });
        setCongeModal(true);
    };
    const openEditConge = (leave: LeaveRecord, emp?: Employee) => {
        setCongeEmployee(emp ?? null);
        setEditingLeave(leave);
        setLeaveForm({ type: leave.type, dateDebut: leave.dateDebut, dateFin: leave.dateFin, motif: leave.motif ?? '' });
        setCongeModal(true);
    };
    const saveConge = async () => {
        if (!congeEmployee || !leaveForm.dateDebut || !leaveForm.dateFin) {
            showToast('Dates de début et fin obligatoires', 'error'); return;
        }
        const jours = daysBetween(leaveForm.dateDebut, leaveForm.dateFin);
        if (editingLeave) {
            await editLeave(editingLeave.id, { ...leaveForm, jours });
            showToast('Congé modifié ✅', 'success');
        } else {
            await addLeave({ employeeId: congeEmployee.id, ...leaveForm, jours });
            showToast('Congé enregistré ✅', 'success');
        }
        setCongeModal(false);
    };

    // ── Handlers employé ──────────────────────────────────────────────────────
    const openEditEmp = (emp: Employee) => {
        setEditingEmp(emp);
        setEmpForm({ ...emp });
        setEmpModal(true);
    };
    const saveEmp = async () => {
        if (!empForm.name?.trim()) { showToast('Le nom est obligatoire', 'error'); return; }
        if (editingEmp) await editEmployee(editingEmp.id, empForm);
        setEmpModal(false);
        showToast('Employé mis à jour ✅', 'success');
    };
    const handleDeleteEmp = (emp: Employee) => {
        if (confirm(`Supprimer ${emp.name} ? Cette action est irréversible.`)) {
            removeEmployee(emp.id);
            showToast(`${emp.name} supprimé`, 'success');
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const exportOpts = () => ({ month: exportMonth, employees, leaves, loans, ordreBase: exportOrdre, feuilles, signatureBase64: directorSignature });
    const handlePreview = () => {
        if (!feuilles.length) { showToast('Sélectionnez au moins une feuille', 'error'); return; }
        setPreview(buildExportPreview(exportOpts()));
    };
    const handleExport = async () => {
        if (!feuilles.length) { showToast('Sélectionnez au moins une feuille', 'error'); return; }
        await exportEmployesPresentsExcel(exportOpts());
        setPreview(null);
        showToast('Fichier Excel généré ✅', 'success');
    };

    // ── TAB CONFIG ────────────────────────────────────────────────────────────
    const TABS: { id: Tab; label: string; icon: string }[] = [
        { id: 'dashboard',  label: 'Tableau de bord', icon: '📊' },
        { id: 'export',     label: 'Export',           icon: '📤' },
        { id: 'employes',   label: 'Employés',         icon: '👥' },
        { id: 'historique', label: 'Historique',       icon: '📋' },
    ];

    return (
        <div className="space-y-5 animate-fade-in">
            {/* ── Page header ── */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">🌴 Gestion des Congés</h1>
                    <p className="text-slate-400 text-sm">Suivi en temps réel — employés en congé, historique & export Excel</p>
                </div>
                <Button onClick={() => setTab('employes')} icon="➕">Nouveau congé</Button>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <span>{t.icon}</span>{t.label}
                    </button>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════════
                TAB 1 — TABLEAU DE BORD
            ══════════════════════════════════════════════════════ */}
            {tab === 'dashboard' && (
                <div className="space-y-5">
                    {/* KPIs — ligne 1 : présence */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <StatCard value={kpis.enConge}       label="En congé aujourd'hui"    icon="🌴" accent="#E65100" />
                        <StatCard value={kpis.presents}      label="Présents aujourd'hui"    icon="✅" accent="#2E7D32" />
                        <StatCard value={kpis.totalConges}   label="Congés enregistrés"      icon="📋" accent="#1565C0" />
                        <StatCard value={kpis.joursConsommes} label="Jours annuels consommés" icon="📅" accent="#8E24AA" />
                    </div>
                    {/* KPIs — ligne 2 : postes */}
                    <div className="grid grid-cols-3 gap-4">
                        <StatCard value={kpis.chefs}       label="Chefs d'équipe"  icon="👑" accent="#E9A93B" />
                        <StatCard value={kpis.techniciens} label="Techniciens"     icon="🔧" accent="#00838F" />
                        <StatCard value={kpis.superviseurs} label="Superviseurs"   icon="🎯" accent="#546E7A" />
                    </div>

                    {/* En congé aujourd'hui */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                🌴 Employés actuellement en congé
                                <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">{kpis.enConge}</span>
                            </CardTitle>
                        </CardHeader>
                        {enCongeAujourdHui.length === 0 ? (
                            <EmptyState icon="✅" text="Aucun employé en congé aujourd'hui — tout le monde est présent !" />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-5">
                                {enCongeAujourdHui.map((l) => {
                                    const emp = employees.find(e => e.id === l.employeeId);
                                    const col = LEAVE_COLORS[l.type] ?? LEAVE_COLORS.autre;
                                    const daysLeft = Math.max(0, Math.round((new Date(l.dateFin).getTime() - today.getTime()) / 86400000));
                                    return (
                                        <div key={l.id} className={`rounded-2xl border ${col.border} p-4 ${col.bg} hover:shadow-md transition-all`}>
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: colorFor(emp?.name ?? 'X') }}>
                                                    {initials(emp?.name ?? '?')}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-bold text-sm truncate ${col.text}`}>{emp?.name ?? '—'}</p>
                                                    <p className="text-[11px] text-slate-400">{emp?.mle ? `Mle ${emp.mle}` : ''}{emp?.equipeNom ? ` · ${emp.equipeNom}` : ''}</p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.bg} ${col.text} border ${col.border}`}>
                                                    {LEAVE_LABELS[l.type]}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-500">{formatDate(l.dateDebut)} → {formatDate(l.dateFin)}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-bold ${col.text}`}>{l.jours}j</span>
                                                    <span className="text-slate-300">·</span>
                                                    <span className={`text-[11px] font-semibold ${daysLeft === 0 ? 'text-green-600' : 'text-slate-500'}`}>
                                                        {daysLeft === 0 ? 'Retour demain' : `Retour dans ${daysLeft}j`}
                                                    </span>
                                                </div>
                                            </div>
                                            {l.motif && <p className="text-[11px] text-slate-400 mt-2 italic truncate" title={l.motif}>{l.motif}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {/* Présents — avec barre de filtre */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2 flex-wrap w-full">
                                <CardTitle>
                                    ✅ Employés présents aujourd'hui
                                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">{presentsFiltered.length}</span>
                                </CardTitle>
                                <div className="ml-auto flex items-center gap-2 flex-wrap">
                                    {/* Recherche */}
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            className="bg-transparent text-sm focus:outline-none w-36"
                                            placeholder="Nom, Mle, équipe..."
                                            value={dashSearch}
                                            onChange={e => setDashSearch(e.target.value)}
                                        />
                                    </div>
                                    {/* Filtre ville */}
                                    <Select value={dashVille} onChange={e => setDashVille(e.target.value)} style={{ width: 'auto' }}>
                                        <option value="">Toutes les villes</option>
                                        {villes.map(v => <option key={v} value={v}>{v}</option>)}
                                    </Select>
                                    {(dashSearch || dashVille) && (
                                        <button onClick={() => { setDashSearch(''); setDashVille(''); }} className="text-xs text-blue-600 hover:underline">✕ Effacer</button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        {presentsFiltered.length === 0 ? (
                            <EmptyState icon="🔍" text="Aucun employé présent correspondant aux filtres" />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            {['Employé', 'Poste', 'Équipe', 'Ville', 'Solde congé', 'Action'].map(h => (
                                                <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {presentsFiltered.map(e => {
                                            const solde = soldeFor(e.id);
                                            return (
                                                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                                    <td className="px-3 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: colorFor(e.name) }}>
                                                                {initials(e.name)}
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-slate-800 text-xs">{e.name}</p>
                                                                <p className="text-[10px] text-slate-400">{e.mle ? `Mle ${e.mle}` : ''}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs text-slate-500 capitalize">{e.poste || '—'}</td>
                                                    <td className="px-3 py-2.5 text-xs text-slate-500">{e.equipeNom || '—'}</td>
                                                    <td className="px-3 py-2.5 text-xs text-slate-500">{e.ville || '—'}</td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${solde < 0 ? 'bg-red-100 text-red-700' : solde < 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                                            {solde}j restants
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <BtnAddConge onClick={() => openNewConge(e)} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 2 — EMPLOYÉS (modifier, supprimer, + congé)
            ══════════════════════════════════════════════════════ */}
            {tab === 'employes' && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2 flex-wrap w-full">
                            <CardTitle>👥 Employés — solde & statut congé</CardTitle>
                            <div className="ml-auto flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        className="bg-transparent text-sm focus:outline-none w-36"
                                        placeholder="Nom, Mle, équipe..."
                                        value={searchEmp}
                                        onChange={e => setSearchEmp(e.target.value)}
                                    />
                                </div>
                                <Select value={empVille} onChange={e => setEmpVille(e.target.value)} style={{ width: 'auto' }}>
                                    <option value="">Toutes les villes</option>
                                    {villes.map(v => <option key={v} value={v}>{v}</option>)}
                                </Select>
                                {(searchEmp || empVille) && (
                                    <button onClick={() => { setSearchEmp(''); setEmpVille(''); }} className="text-xs text-blue-600 hover:underline">✕ Effacer</button>
                                )}
                                <span className="text-xs text-slate-400">{filteredEmployees.length} employé(s)</span>
                            </div>
                        </div>
                    </CardHeader>
                    {filteredEmployees.length === 0 ? (
                        <EmptyState icon="👤" text="Aucun employé trouvé" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        {['Employé', 'Équipe / Ville', 'Statut', 'Solde annuel', 'Jours pris', 'Actions'].map(h => (
                                            <th key={h} className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEmployees.map(e => {
                                        const solde       = soldeFor(e.id);
                                        const pris        = leaves.filter(l => l.employeeId === e.id && l.type === 'annuel').reduce((a, l) => a + l.jours, 0);
                                        const enConge     = enCongeIds.has(e.id);
                                        const congeActuel = enCongeAujourdHui.find(l => l.employeeId === e.id);
                                        return (
                                            <tr key={e.id} className={`border-b border-slate-50 transition-colors ${enConge ? 'bg-orange-50/30' : 'hover:bg-slate-50/50'}`}>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="relative">
                                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: colorFor(e.name) }}>
                                                                {initials(e.name)}
                                                            </div>
                                                            {enConge && <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">🌴</span>}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-800">{e.name}</p>
                                                            <p className="text-[11px] text-slate-400">{e.mle ? `Mle ${e.mle}` : '—'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <p className="text-xs font-medium text-slate-700">{e.equipeNom || '—'}</p>
                                                    <p className="text-[11px] text-slate-400">{e.ville || '—'}</p>
                                                </td>
                                                <td className="px-3 py-3">
                                                    {enConge && congeActuel ? (
                                                        <div>
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">🌴 En congé</span>
                                                            <p className="text-[10px] text-slate-400 mt-0.5">jusqu'au {formatDate(congeActuel.dateFin)}</p>
                                                        </div>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${e.actif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {e.actif ? '✅ Présent' : 'Inactif'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                            <div className={`h-full rounded-full ${solde < 0 ? 'bg-red-400' : solde < 5 ? 'bg-amber-400' : 'bg-green-400'}`}
                                                                style={{ width: `${Math.max(0, Math.min(100, (solde / SOLDE_ANNUEL) * 100))}%` }} />
                                                        </div>
                                                        <span className={`text-xs font-bold ${solde < 0 ? 'text-red-600' : solde < 5 ? 'text-amber-600' : 'text-green-700'}`}>{solde}j</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-xs text-slate-500">{pris}j</td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <BtnEdit onClick={() => openEditEmp(e)} />
                                                        <BtnDelete onClick={() => handleDeleteEmp(e)} />
                                                        <BtnAddConge onClick={() => openNewConge(e)} />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 3 — HISTORIQUE DES CONGÉS
            ══════════════════════════════════════════════════════ */}
            {tab === 'historique' && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2 flex-wrap w-full">
                                <span className="text-sm font-semibold text-slate-600">🔍 Filtres</span>
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                                    <input
                                        className="bg-transparent text-sm focus:outline-none w-36"
                                        placeholder="Nom / matricule"
                                        value={filterEmpSearch}
                                        onChange={e => setFilterEmpSearch(e.target.value)}
                                    />
                                </div>
                                <Select value={filterType} onChange={e => setFilterType(e.target.value as LeaveType | '')} style={{ width: 'auto' }}>
                                    <option value="">Tous les types</option>
                                    {Object.entries(LEAVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                                <Input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-auto" />
                                {(filterType || filterMonth || filterEmpSearch) && (
                                    <button onClick={() => { setFilterType(''); setFilterMonth(''); setFilterEmpSearch(''); }} className="text-xs text-blue-600 hover:underline">✕ Effacer</button>
                                )}
                                <span className="ml-auto text-xs text-slate-400">{filteredLeaves.length} congé(s)</span>
                            </div>
                        </CardHeader>
                    </Card>
                    {filteredLeaves.length === 0 ? (
                        <EmptyState icon="📋" text="Aucun congé sur cette période" />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {[...filteredLeaves].sort((a, b) => new Date(b.dateDebut).getTime() - new Date(a.dateDebut).getTime()).map(l => {
                                const emp    = employees.find(e => e.id === l.employeeId);
                                const col    = LEAVE_COLORS[l.type] ?? LEAVE_COLORS.autre;
                                const active = isOnLeaveToday(l);
                                return (
                                    <div key={l.id} className={`rounded-2xl border p-4 bg-white hover:shadow-md transition-all ${active ? 'border-orange-300 ring-1 ring-orange-200' : 'border-slate-200'}`}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: colorFor(emp?.name ?? 'X') }}>
                                                    {initials(emp?.name ?? '?')}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-800 text-sm">{emp?.name ?? '—'}</p>
                                                    <p className="text-[10px] text-slate-400">{emp?.mle ? `Mle ${emp.mle}` : ''}{emp?.equipeNom ? ` · ${emp.equipeNom}` : ''}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {active && <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">EN COURS</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.bg} ${col.text} border ${col.border}`}>
                                                {LEAVE_LABELS[l.type]}
                                            </span>
                                            <span className="font-bold text-slate-700 text-sm">{l.jours}j</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mb-3">{formatDate(l.dateDebut)} → {formatDate(l.dateFin)}</div>
                                        {l.motif && <p className="text-[11px] text-slate-400 mb-3 italic truncate" title={l.motif}>{l.motif}</p>}
                                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                            <BtnEdit onClick={() => openEditConge(l, emp)} />
                                            <BtnDelete onClick={() => { if (confirm('Supprimer ce congé ?')) removeLeave(l.id); }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 4 — EXPORT EXCEL
            ══════════════════════════════════════════════════════ */}
            {tab === 'export' && (
                <div className="space-y-4 max-w-2xl">
                    <Card>
                        <CardHeader><CardTitle>📤 Export Ordre de virement</CardTitle></CardHeader>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-slate-500">
                                Génère un fichier Excel <strong>Ordre de virement</strong> pour les employés <strong>non en congé</strong> sur le mois sélectionné.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">Mois d'export</label>
                                    <Input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">N° d'ordre</label>
                                    <Input value={exportOrdre} onChange={e => setExportOrdre(e.target.value)} placeholder="020/DG/GSS/2026" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-2">Feuilles à exporter</label>
                                <div className="flex gap-3 flex-wrap">
                                    {FEUILLES_DISPO.map(f => (
                                        <label key={f} className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
                                            <input type="checkbox" checked={feuilles.includes(f)} onChange={() => toggleFeuille(f)} className="accent-blue-600 w-4 h-4" />
                                            <span>{f}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {(() => {
                                const [y, m] = exportMonth.split('-').map(Number);
                                const monthOf = (ds?: string) => { if (!ds) return null; const d = new Date(ds); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
                                const enCongeExport = new Set(leaves.filter(l => monthOf(l.dateDebut) === exportMonth).map(l => l.employeeId));
                                const presents = employees.filter(e => e.actif && !enCongeExport.has(e.id));
                                const total = presents.reduce((a, e) => a + (e.montant ?? 0), 0);
                                return (
                                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                                        <p className="text-sm font-semibold text-blue-800 mb-3">
                                            Aperçu — {new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                                        </p>
                                        <div className="grid grid-cols-3 gap-3 text-center">
                                            <div className="bg-white rounded-lg p-2 shadow-sm">
                                                <p className="text-2xl font-black text-blue-700">{presents.length}</p>
                                                <p className="text-[11px] text-blue-500">présents</p>
                                            </div>
                                            <div className="bg-white rounded-lg p-2 shadow-sm">
                                                <p className="text-2xl font-black text-orange-600">{enCongeExport.size}</p>
                                                <p className="text-[11px] text-blue-500">en congé</p>
                                            </div>
                                            <div className="bg-white rounded-lg p-2 shadow-sm">
                                                <p className="text-xl font-black text-green-700">{total.toLocaleString('fr-FR')}</p>
                                                <p className="text-[11px] text-blue-500">total MRU</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            <div className="flex gap-3 flex-wrap pt-2 border-t border-slate-100">
                                <Button variant="outline" onClick={() => setSigModal(true)}>✍️ Signature</Button>
                                <Button variant="outline" onClick={handlePreview}>👁️ Aperçu</Button>
                                <Button onClick={handleExport} icon="📥">Exporter Excel</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* ── Modal congé (ajouter / modifier) ── */}
            <Modal
                open={congeModal}
                onClose={() => setCongeModal(false)}
                title={`🌴 ${editingLeave ? 'Modifier le' : 'Nouveau'} congé${congeEmployee ? ` — ${congeEmployee.name}` : ''}`}
            >
                <div className="space-y-4">
                    {congeEmployee && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: colorFor(congeEmployee.name) }}>
                                {initials(congeEmployee.name)}
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800">{congeEmployee.name}</p>
                                <p className="text-xs text-slate-400">
                                    Solde restant :&nbsp;
                                    <strong className={soldeFor(congeEmployee.id) < 0 ? 'text-red-600' : 'text-green-700'}>
                                        {soldeFor(congeEmployee.id)} jours
                                    </strong>&nbsp;/ {SOLDE_ANNUEL}
                                </p>
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type de congé</label>
                        <Select className="w-full" value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value as LeaveType }))}>
                            {Object.entries(LEAVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Date de début</label>
                            <input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" value={leaveForm.dateDebut} onChange={e => setLeaveForm(f => ({ ...f, dateDebut: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Date de fin</label>
                            <input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" value={leaveForm.dateFin} onChange={e => setLeaveForm(f => ({ ...f, dateFin: e.target.value }))} />
                        </div>
                    </div>
                    {leaveForm.dateDebut && leaveForm.dateFin && (
                        <p className="text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-slate-500">
                            Durée calculée : <strong className="text-blue-700">{daysBetween(leaveForm.dateDebut, leaveForm.dateFin)} jours</strong>
                        </p>
                    )}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Motif / note (optionnel)</label>
                        <Textarea rows={2} value={leaveForm.motif} onChange={e => setLeaveForm(f => ({ ...f, motif: e.target.value }))} />
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button variant="outline" onClick={() => setCongeModal(false)}>Annuler</Button>
                        <Button onClick={saveConge}>{editingLeave ? 'Enregistrer les modifications' : 'Enregistrer le congé'}</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Modal employé (modifier seulement) ── */}
            <Modal open={empModal} onClose={() => setEmpModal(false)} title={`✏️ Modifier — ${editingEmp?.name ?? ''}`}>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Matricule</label>
                            <Input value={empForm.mle ?? ''} onChange={e => setEmpForm(f => ({ ...f, mle: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nom complet *</label>
                            <Input value={empForm.name ?? ''} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Poste</label>
                            <Input value={empForm.poste ?? ''} onChange={e => setEmpForm(f => ({ ...f, poste: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Téléphone</label>
                            <Input value={empForm.telephone ?? ''} onChange={e => setEmpForm(f => ({ ...f, telephone: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ville</label>
                            <Input value={empForm.ville ?? ''} onChange={e => setEmpForm(f => ({ ...f, ville: e.target.value }))} placeholder="NKTT, NDB..." />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Équipe (RH)</label>
                            <Input value={empForm.equipeNom ?? ''} onChange={e => setEmpForm(f => ({ ...f, equipeNom: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Banque</label>
                            <Select className="w-full" value={empForm.banque ?? ''} onChange={e => setEmpForm(f => ({ ...f, banque: e.target.value || undefined }))}>
                                <option value="">— Choisir —</option>
                                {BANQUES.map(b => <option key={b} value={b}>{b}</option>)}
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Montant net (MRU)</label>
                            <Input type="number" value={empForm.montant ?? ''} onChange={e => setEmpForm(f => ({ ...f, montant: parseFloat(e.target.value) || undefined }))} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">RIB</label>
                        <Input value={empForm.rib ?? ''} onChange={e => setEmpForm(f => ({ ...f, rib: e.target.value.replace(/\s+/g, '') }))} placeholder="23 chiffres sans espace" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Statut</label>
                        <Select value={empForm.actif ? '1' : '0'} onChange={e => setEmpForm(f => ({ ...f, actif: e.target.value === '1' }))}>
                            <option value="1">Actif</option>
                            <option value="0">Inactif</option>
                        </Select>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button variant="outline" onClick={() => setEmpModal(false)}>Annuler</Button>
                        <Button onClick={saveEmp}>Enregistrer</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Modal signature ── */}
            <Modal open={sigModal} onClose={() => setSigModal(false)} title="✍️ Signature du directeur">
                <SignaturePad
                    initialValue={directorSignature ?? DEFAULT_SIGNATURE}
                    onSave={async (b64) => { await setDirectorSignature(b64); setSigModal(false); showToast('Signature enregistrée ✅', 'success'); }}
                    onClear={() => setDirectorSignature(null)}
                />
            </Modal>

            {/* ── Modal aperçu export ── */}
            <ExportPreviewModal open={!!preview} preview={preview} onClose={() => setPreview(null)} onConfirm={handleExport} />
        </div>
    );
}
