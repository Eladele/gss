import { useEffect, useState } from 'react';
import { Download, Monitor, MoreVertical, Share, Smartphone, Sparkles, X } from 'lucide-react';

// ─── Détection « application déjà installée » ─────────────────────────────────
// Le bouton disparaît complètement quand :
//   • l'application tourne installée (PWA / APK : affichage « standalone », iOS écran d'accueil,
//     application Android de confiance) ;
//   • elle vient d'être installée sur cet appareil (événement « appinstalled », mémorisé) ;
//   • le navigateur sait qu'elle est installée (getInstalledRelatedApps, Chrome Android / ordinateur).

/* eslint-disable @typescript-eslint/no-explicit-any */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const CLE_INSTALLEE = 'gss_app_installee';
let invite: InstallPrompt | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

const lireMemo = () => {
  try {
    return localStorage.getItem(CLE_INSTALLEE) === '1';
  } catch {
    return false;
  }
};
const ecrireMemo = (v: boolean) => {
  try {
    if (v) localStorage.setItem(CLE_INSTALLEE, '1');
    else localStorage.removeItem(CLE_INSTALLEE);
  } catch {
    /* stockage indisponible */
  }
};

const estEnModeApplication = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.startsWith('android-app://'));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invite = e as InstallPrompt;
    // le navigateur propose l'installation : elle n'est donc plus installée (désinstallée depuis)
    ecrireMemo(false);
    prevenir();
  });
  window.addEventListener('appinstalled', () => {
    invite = null;
    ecrireMemo(true);
    prevenir();
  });
}

function useInstallation() {
  const [, maj] = useState(0);
  const [connueDuNavigateur, setConnue] = useState(false);
  useEffect(() => {
    const f = () => maj((n) => n + 1);
    abonnes.add(f);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', f);
    const nav = navigator as any;
    if (typeof nav.getInstalledRelatedApps === 'function') {
      nav
        .getInstalledRelatedApps()
        .then((apps: unknown[]) => setConnue(apps.length > 0))
        .catch(() => undefined);
    }
    return () => {
      abonnes.delete(f);
      mq.removeEventListener?.('change', f);
    };
  }, []);
  return {
    installee: estEnModeApplication() || connueDuNavigateur || (lireMemo() && !invite),
    invite,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Bouton « Installer l'application » (PWA / APK). N'apparaît pas si l'application est déjà installée.
 * variant : compact (barre du haut), full (bouton plein), sidebar (menu latéral).
 */
export function InstallApkButton({ className = '', variant = 'compact' }: { className?: string; variant?: 'compact' | 'full' | 'sidebar' }) {
  const { installee, invite: prompt } = useInstallation();
  const [aide, setAide] = useState(false);

  if (installee) return null;

  const installer = async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        const choix = await prompt.userChoice;
        if (choix.outcome === 'accepted') {
          invite = null;
          ecrireMemo(true);
          prevenir();
          return;
        }
      } catch {
        /* invite refusée par le navigateur : on montre l'aide */
      }
    }
    setAide(true);
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={installer}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 ${className}`}
        >
          <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-emerald-950 text-xs">Installer l’application</span>
            <span className="block text-[10px] text-emerald-700">Android, iPhone, ordinateur</span>
          </span>
        </button>
      ) : variant === 'full' ? (
        <button
          type="button"
          onClick={installer}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 ${className}`}
        >
          <Download className="w-4 h-4" />
          <span>Installer l’application</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={installer}
          title="Installer l’application GSS"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 active:scale-95 ${className}`}
        >
          <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="hidden sm:inline">Installer</span>
        </button>
      )}

      {aide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60" onClick={() => setAide(false)}>
          <div
            className="bg-white w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Installer l’application GSS"
          >
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">Installer l’application GSS</h3>
                <p className="text-xs text-slate-500">Une icône sur l’écran d’accueil, comme une application</p>
              </div>
              <button type="button" onClick={() => setAide(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100" aria-label="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600">
              {prompt && (
                <button
                  type="button"
                  onClick={installer}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" /> Installer maintenant
                </button>
              )}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 text-sm mb-1.5 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-600" /> Android (Chrome)
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Menu <MoreVertical className="inline w-3.5 h-3.5" /> en haut à droite.
                  </li>
                  <li>
                    « <b>Installer l’application</b> » (ou « Ajouter à l’écran d’accueil »).
                  </li>
                </ol>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="font-bold text-amber-900 mb-1.5">Fichier APK Android</p>
                <a
                  href="/gss.apk"
                  download="gss.apk"
                  className="w-full py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold rounded-lg flex items-center justify-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" /> Télécharger gss.apk
                </a>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 text-sm mb-1.5 flex items-center gap-2">
                  <Share className="w-4 h-4 text-blue-600" /> iPhone / iPad (Safari)
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Bouton « Partager » (carré avec une flèche).</li>
                  <li>« Sur l’écran d’accueil », puis « Ajouter ».</li>
                </ol>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-semibold text-slate-700 mb-1 flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-slate-500" /> Ordinateur (Chrome / Edge)
                </p>
                <p>Icône d’installation à droite de la barre d’adresse, puis « Installer ».</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
