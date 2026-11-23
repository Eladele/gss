// Éditeur de la marque d'une entreprise : identité (nom, logo, slogan, spécialités), couleurs,
// police et taille de l'écriture, pages du menu (affichées / masquées / renommées), avec aperçu.
// Utilisé pour sa propre entreprise (Personnalisation) et pour un client (Entreprises).
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, Input, Select, useToast } from '@/components/ui';
import { LogoMarque } from '@/components/LogoMarque';
import {
  CATALOGUE_PAGES,
  CATALOGUE_RUBRIQUES,
  MARQUE_DEFAUT,
  PAGES_VERROUILLEES,
  POLICES,
  chargerPolice,
  libellePage,
  nuancier,
  pageActive,
  preparerLogo,
  type Marque,
  type PageId,
} from '@/lib/marque';
import { errMsg } from '@/utils';

const PALETTES: { nom: string; c1: string; c2: string }[] = [
  { nom: 'GSS', c1: '#1565C0', c2: '#00BCD4' },
  { nom: 'Émeraude', c1: '#0F766E', c2: '#22C55E' },
  { nom: 'Rubis', c1: '#B91C1C', c2: '#F59E0B' },
  { nom: 'Violet', c1: '#6D28D9', c2: '#EC4899' },
  { nom: 'Orange', c1: '#C2410C', c2: '#FACC15' },
  { nom: 'Nuit', c1: '#1E293B', c2: '#38BDF8' },
  { nom: 'Forêt', c1: '#166534', c2: '#A3E635' },
  { nom: 'Océan', c1: '#0369A1', c2: '#14B8A6' },
];

const TAILLES: { v: number; nom: string }[] = [
  { v: 14, nom: 'Petite' },
  { v: 15, nom: 'Réduite' },
  { v: 16, nom: 'Normale' },
  { v: 17, nom: 'Grande' },
  { v: 18, nom: 'Très grande' },
];

const label = 'block text-xs font-semibold text-slate-500 mb-1.5';

interface Props {
  initiale: Marque;
  onEnregistrer: (m: Marque) => Promise<void>;
  /** appelé à chaque modification (aperçu en direct sur l'application) */
  onChange?: (m: Marque) => void;
  /** nom de l'entreprise modifiée, si ce n'est pas la sienne */
  pour?: string;
}

export function EditeurMarque({ initiale, onEnregistrer, onChange, pour }: Props) {
  const { showToast } = useToast();
  const [m, setM] = useState<Marque>(initiale);
  const [saving, setSaving] = useState(false);
  const [specialite, setSpecialite] = useState('');
  const fichier = useRef<HTMLInputElement>(null);
  const modifie = JSON.stringify(m) !== JSON.stringify(initiale);

  const maj = (patch: Partial<Marque>) => {
    const n = { ...m, ...patch };
    setM(n);
    onChange?.(n);
  };
  useEffect(() => chargerPolice(m.police), [m.police]);

  const choisirLogo = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { dataUrl, ratio } = await preparerLogo(f);
      maj({ logo: dataUrl, logoRatio: ratio });
    } catch (e) {
      showToast(errMsg(e), 'error');
    }
  };
  const ajouterSpecialite = () => {
    const s = specialite.trim();
    if (!s || m.specialites.includes(s)) return setSpecialite('');
    maj({ specialites: [...m.specialites, s].slice(0, 12) });
    setSpecialite('');
  };
  const majPage = (id: PageId, patch: Partial<{ actif: boolean; libelle: string }>) => {
    const avant = m.pages[id] ?? { actif: true, libelle: '' };
    maj({ pages: { ...m.pages, [id]: { ...avant, ...patch } } });
  };
  const enregistrer = async () => {
    if (!m.nom.trim()) return showToast("Donnez un nom à l'entreprise", 'error');
    setSaving(true);
    try {
      await onEnregistrer(m);
      showToast(pour ? `Personnalisation de ${pour} enregistrée ✅` : 'Personnalisation enregistrée ✅', 'success');
    } catch (e) {
      showToast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  const reinitialiser = () => maj({ ...MARQUE_DEFAUT, pages: {}, rubriques: {}, specialites: [] });

  const rubriques = [...new Set(CATALOGUE_PAGES.map((p) => p.rubrique))];
  const n = nuancier(m.couleurPrincipale);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={enregistrer} disabled={saving || !modifie} icon={<Save className="w-4 h-4" />}>
          {saving ? 'Enregistrement…' : modifie ? 'Enregistrer' : 'Enregistré'}
        </Button>
        <Button variant="outline" onClick={() => (setM(initiale), onChange?.(initiale))} disabled={!modifie || saving}>
          Annuler les modifications
        </Button>
        <Button variant="ghost" onClick={reinitialiser} icon={<RotateCcw className="w-4 h-4" />}>
          Revenir à GSS
        </Button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* Identité */}
          <Card>
            <CardHeader>
              <CardTitle>Identité</CardTitle>
            </CardHeader>
            <div className="p-4 sm:p-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="m-nom">Nom court (badge, pieds de page)</label>
                <Input id="m-nom" value={m.nom} maxLength={24} onChange={(e) => maj({ nom: e.target.value })} placeholder="GSS" />
              </div>
              <div>
                <label className={label} htmlFor="m-complet">Nom complet</label>
                <Input id="m-complet" value={m.nomComplet} maxLength={120} onChange={(e) => maj({ nomComplet: e.target.value })} placeholder="Gestion Situations & Supervision" />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="m-slogan">Phrase sous « Connexion »</label>
                <Input id="m-slogan" value={m.slogan} maxLength={120} onChange={(e) => maj({ slogan: e.target.value })} placeholder="Program Manager · FTTH" />
              </div>
              <div className="sm:col-span-2">
                <span className={label}>Logo (exports Excel / PDF, écran de connexion, barre du haut)</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="h-20 min-w-32 px-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                    <LogoMarque taille="lg" marque={m} />
                  </div>
                  <input ref={fichier} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => choisirLogo(e.target.files?.[0])} />
                  <Button variant="outline" size="sm" onClick={() => fichier.current?.click()} icon={<ImagePlus className="w-4 h-4" />}>
                    {m.logo ? 'Changer le logo' : 'Choisir un logo'}
                  </Button>
                  {m.logo && (
                    <Button variant="ghost" size="sm" onClick={() => maj({ logo: '', logoRatio: MARQUE_DEFAUT.logoRatio })} icon={<Trash2 className="w-4 h-4" />}>
                      Retirer
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Sans logo : badge au nom court, dans les couleurs choisies (et logo GSS dans les exports).</p>
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="m-spec">Spécialités (affichées à la connexion)</label>
                <div className="flex gap-2">
                  <Input
                    id="m-spec"
                    value={specialite}
                    onChange={(e) => setSpecialite(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ajouterSpecialite())}
                    placeholder="ex. FTTH, Cuivre, Génie civil, Maintenance réseau…"
                  />
                  <Button variant="outline" onClick={ajouterSpecialite}>
                    Ajouter
                  </Button>
                </div>
                {m.specialites.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.specialites.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                        {s}
                        <button type="button" aria-label={`Retirer ${s}`} onClick={() => maj({ specialites: m.specialites.filter((x) => x !== s) })} className="p-0.5 rounded-full hover:bg-slate-200">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Couleurs et écriture */}
          <Card>
            <CardHeader>
              <CardTitle>Couleurs et écriture</CardTitle>
            </CardHeader>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {(
                  [
                    ['couleurPrincipale', 'Couleur principale (boutons, liens, menu actif)'],
                    ['couleurSecondaire', 'Couleur secondaire (dégradé du badge, accents)'],
                  ] as const
                ).map(([k, txt]) => (
                  <div key={k}>
                    <label className={label} htmlFor={`m-${k}`}>{txt}</label>
                    <div className="flex items-center gap-2">
                      <input id={`m-${k}`} type="color" value={m[k]} onChange={(e) => maj({ [k]: e.target.value })} className="w-11 h-10 rounded-lg border border-slate-200 bg-white p-1 cursor-pointer" />
                      <Input value={m[k]} maxLength={7} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && maj({ [k]: e.target.value })} className="font-mono" />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <span className={label}>Palettes toutes prêtes</span>
                <div className="flex flex-wrap gap-2">
                  {PALETTES.map((p) => (
                    <button
                      key={p.nom}
                      type="button"
                      onClick={() => maj({ couleurPrincipale: p.c1, couleurSecondaire: p.c2 })}
                      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-xs font-semibold ${m.couleurPrincipale.toLowerCase() === p.c1.toLowerCase() && m.couleurSecondaire.toLowerCase() === p.c2.toLowerCase() ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <span className="w-5 h-5 rounded-full" style={{ background: `linear-gradient(135deg, ${p.c1} 50%, ${p.c2} 50%)` }} />
                      {p.nom}
                    </button>
                  ))}
                </div>
                <div className="flex mt-3 rounded-lg overflow-hidden h-6 border border-slate-200" title="Nuances générées pour l'interface">
                  {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => (
                    <span key={k} className="flex-1" style={{ background: n[k] }} />
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="m-police">Police de l'écriture</label>
                  <Select id="m-police" value={m.police} onChange={(e) => maj({ police: e.target.value })} className="w-full">
                    {POLICES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                        {p === 'Cairo' || p === 'Tajawal' ? ' (arabe + latin)' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <span className={label}>Taille de l'écriture</span>
                  <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-xl">
                    {TAILLES.map((x) => (
                      <button
                        key={x.v}
                        type="button"
                        onClick={() => maj({ taille: x.v })}
                        className={`py-1.5 rounded-lg font-bold ${m.taille === x.v ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                        style={{ fontSize: x.v * 0.72 }}
                        title={x.nom}
                      >
                        A
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{TAILLES.find((x) => x.v === m.taille)?.nom ?? `${m.taille} px`} — toute l'application s'agrandit ou se réduit.</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Menus */}
          <Card>
            <CardHeader>
              <CardTitle>Pages et menus</CardTitle>
            </CardHeader>
            <p className="px-4 sm:px-5 text-[11px] text-slate-400 -mt-1">
              Décochez une page pour la retirer du menu de tous les utilisateurs ; donnez-lui un autre nom si besoin. Chaque rôle ne voit toujours que ses propres pages.
            </p>
            <div className="p-4 sm:p-5 space-y-5">
              <div className="grid sm:grid-cols-3 gap-3">
                {CATALOGUE_RUBRIQUES.map((r) => (
                  <div key={r.id}>
                    <label className={label} htmlFor={`m-rub-${r.id}`}>Rubrique « {r.libelle} »</label>
                    <Input id={`m-rub-${r.id}`} value={m.rubriques[r.id] ?? ''} placeholder={r.libelle} maxLength={40} onChange={(e) => maj({ rubriques: { ...m.rubriques, [r.id]: e.target.value } })} />
                  </div>
                ))}
              </div>
              {rubriques.map((rub) => (
                <div key={rub}>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">{rub}</p>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                    {CATALOGUE_PAGES.filter((p) => p.rubrique === rub).map((p) => {
                      const actif = pageActive(m, p.id);
                      const verrou = PAGES_VERROUILLEES.includes(p.id);
                      return (
                        <div key={p.id} className={`flex items-center gap-3 px-3 py-2 ${actif ? '' : 'bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 shrink-0"
                            checked={actif}
                            disabled={verrou}
                            onChange={(e) => majPage(p.id, { actif: e.target.checked })}
                            aria-label={`Afficher ${p.libelle}`}
                          />
                          <span className={`text-sm w-40 shrink-0 truncate ${actif ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{p.libelle}</span>
                          <Input
                            value={m.pages[p.id]?.libelle ?? ''}
                            placeholder="Nom affiché (par défaut)"
                            maxLength={40}
                            disabled={!actif}
                            onChange={(e) => majPage(p.id, { libelle: e.target.value })}
                            className="text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Aperçu */}
        <div className="lg:sticky lg:top-20 space-y-3">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Aperçu</p>
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm" style={{ fontFamily: `'${m.police}', system-ui, sans-serif`, fontSize: m.taille * 0.85 }}>
            <div className="bg-white border-b border-slate-200 flex items-center gap-2 px-3" style={{ height: '3.2em' }}>
              <LogoMarque marque={m} />
              <span style={{ fontWeight: 600, fontSize: '0.9em' }} className="text-slate-800 truncate">
                {libellePage(m, 'dashboard', 'Dashboard')}
              </span>
            </div>
            <div className="flex">
              <div className="bg-white border-r border-slate-200 py-2" style={{ width: '9.5em', fontSize: '0.8em' }}>
                {CATALOGUE_PAGES.filter((p) => pageActive(m, p.id))
                  .slice(0, 7)
                  .map((p, i) => (
                    <div key={p.id} className="mx-1.5 my-0.5 px-2 py-1 rounded-md truncate" style={i === 0 ? { background: n[50], color: n[700], fontWeight: 600 } : { color: '#475569' }}>
                      {libellePage(m, p.id, p.libelle)}
                    </div>
                  ))}
              </div>
              <div className="flex-1 p-3 space-y-2 min-w-0">
                <div style={{ fontWeight: 900, fontSize: '1.15em' }} className="text-slate-900 truncate">
                  {m.nomComplet || m.nom}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: n[100], color: n[800], fontSize: '0.75em', fontWeight: 700 }}>
                    En cours
                  </span>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: `color-mix(in oklab, ${m.couleurSecondaire} 18%, white)`, color: m.couleurSecondaire, fontSize: '0.75em', fontWeight: 700 }}>
                    Accent
                  </span>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2" style={{ fontSize: '0.8em' }}>
                  <div className="text-slate-400">Fiches faites</div>
                  <div style={{ fontWeight: 900, fontSize: '1.6em', color: m.couleurPrincipale }}>128</div>
                </div>
                <button type="button" className="w-full rounded-lg text-white" style={{ background: m.couleurPrincipale, padding: '0.5em', fontWeight: 600, fontSize: '0.85em' }}>
                  Bouton principal
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center space-y-2" style={{ fontFamily: `'${m.police}', system-ui, sans-serif` }}>
            <LogoMarque taille="lg" marque={m} />
            <p className="font-bold text-slate-900">Connexion</p>
            {m.slogan && <p className="text-xs text-slate-400">{m.slogan}</p>}
            {m.specialites.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1">
                {m.specialites.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: n[50], color: n[700] }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
