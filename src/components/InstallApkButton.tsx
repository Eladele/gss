import React, { useEffect, useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  MoreVertical,
  X,
  CheckCircle2,
  Monitor,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

let globalDeferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e;
  });
}

export function InstallApkButton({
  className = '',
  variant = 'compact',
}: {
  className?: string;
  variant?: 'compact' | 'full' | 'sidebar';
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(globalDeferredPrompt);
  const [showModal, setShowModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('android');

  useEffect(() => {
    // Détection de l'état standalone (déjà installé)
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Détection de l'appareil
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      setPlatform('ios');
    } else if (/android/i.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    const handler = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e;
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const prompt = deferredPrompt || globalDeferredPrompt;
    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          globalDeferredPrompt = null;
          setDeferredPrompt(null);
          return;
        }
      } catch (err) {
        console.warn('Erreur déclenchement prompt install:', err);
      }
    }
    // Si prompt non disponible ou refusé, afficher la boîte de dialogue d'aide & téléchargement
    setShowModal(true);
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 cursor-pointer shadow-xs ${className}`}
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-emerald-950 text-xs">Installer version APK</p>
            <p className="text-[10px] text-emerald-700">Application Android & iOS</p>
          </div>
        </button>
      ) : variant === 'full' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 ${className}`}
        >
          <Download className="w-4 h-4" />
          <span>Installer version APK</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 hover:border-emerald-400 shadow-xs transition-all active:scale-95 cursor-pointer ${className}`}
          title="Installer l'application GSS (Version APK)"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="hidden min-[420px]:inline">Installer version APK</span>
          <span className="min-[420px]:hidden font-bold">Installer APK</span>
          {isStandalone && (
            <span
              className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
              title="Application déjà installée"
            />
          )}
        </button>
      )}

      {/* Modal d'instructions d'installation APK / PWA */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Installer l'application GSS</h3>
                  <p className="text-xs text-slate-500">Version APK / Application Mobile</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenu */}
            <div className="mt-4 space-y-4">
              {/* Bouton d'installation directe si prompt disponible */}
              {(deferredPrompt || globalDeferredPrompt) && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-900 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    Installation automatique prête sur cet appareil !
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const p = deferredPrompt || globalDeferredPrompt;
                      if (p) {
                        await p.prompt();
                        setShowModal(false);
                      }
                    }}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Installer directement maintenant
                  </button>
                </div>
              )}

              {/* État si déjà en mode standalone */}
              {isStandalone && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Vous utilisez actuellement la version installée de GSS.</span>
                </div>
              )}

              {/* Guide Android */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 text-sm">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>Pour Android (Chrome / Navigateur)</span>
                </div>
                <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>
                    Appuyez sur le menu <MoreVertical className="inline w-3.5 h-3.5 text-slate-700" />{' '}
                    (les <strong>3 points en haut à droite</strong> de Chrome).
                  </li>
                  <li>
                    Appuyez sur <strong>« Installer l'application »</strong> (ou{' '}
                    <em>« Ajouter à l'écran d'accueil »</em>).
                  </li>
                  <li>
                    L'application GSS s'installe comme un <strong>APK officiel</strong> sur votre
                    smartphone avec son icône.
                  </li>
                </ol>
              </div>

              {/* Téléchargement direct APK si fichier dédié */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                <p className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  Téléchargement direct du fichier APK
                </p>
                <p className="text-[11px] text-amber-800 mb-2.5">
                  Si vous préférez installer directement le fichier package Android (.apk) :
                </p>
                <a
                  href="/gss.apk"
                  download="gss.apk"
                  className="w-full py-2 px-3 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold rounded-lg text-xs transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-amber-700" />
                  Télécharger le fichier gss.apk
                </a>
              </div>

              {/* Guide iOS */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 text-sm">
                  <Share className="w-4 h-4 text-blue-600" />
                  <span>Pour iPhone / iPad (Safari)</span>
                </div>
                <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Dans Safari, appuyez sur le bouton <strong>Partager</strong> (icône carré avec flèche vers le haut).</li>
                  <li>Faites défiler vers le bas et sélectionnez <strong>« Sur l'écran d'accueil »</strong>.</li>
                  <li>Appuyez sur <strong>« Ajouter »</strong> en haut à droite.</li>
                </ol>
              </div>

              {/* Guide PC / Desktop */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <div className="flex items-center gap-2 font-semibold text-slate-700 mb-1">
                  <Monitor className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sur Ordinateur (Chrome / Edge)</span>
                </div>
                <p className="text-[11px]">
                  Cliquez sur l'icône d'installation dans la barre d'adresse du navigateur (à droite de l'URL) puis sur « Installer ».
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

