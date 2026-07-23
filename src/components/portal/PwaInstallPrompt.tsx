import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useVenue } from '@/contexts/VenueContext';
import { usePortalTheme } from '@/contexts/PortalThemeContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import {
  BeforeInstallPromptEvent,
  injectPortalManifest,
  isIosBrowser,
  isStandaloneDisplay,
  registerPortalServiceWorker,
  resolvePwaIconUrl,
} from '@/utils/portalPwa';

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing — the banner just won't be remembered as dismissed
  }
}

/**
 * Injects the per-venue PWA manifest and shows a one-time "add to home screen"
 * banner: the native install prompt on Android/Chrome, or brief instructions
 * on iOS (which has no install API). Dismissing or installing sets a
 * localStorage flag so the banner never reappears.
 */
export default function PwaInstallPrompt() {
  const T = usePortalTheme();
  const { venueSlug } = useVenue();
  const { portalPath } = useVenueNav();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  const storageKey = `portal_pwa_prompt_${venueSlug}`;

  useEffect(() => {
    registerPortalServiceWorker();
    injectPortalManifest({
      venueName: T.venueName,
      shortName: venueSlug.toUpperCase(),
      themeColor: T.primaryColor,
      backgroundColor: T.pageBackground,
      startPath: portalPath(),
      logoUrl: resolvePwaIconUrl(venueSlug, T.logoUrl),
    }).catch(() => {});
    // portalPath is derived from venueSlug + hostname, both covered below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T.venueName, T.primaryColor, T.pageBackground, T.logoUrl, venueSlug]);

  useEffect(() => {
    if (readFlag(storageKey) || isStandaloneDisplay()) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setIosMode(false);
      setVisible(true);
    };
    const onInstalled = () => {
      writeFlag(storageKey, 'installed');
      setVisible(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    let iosTimer: number | undefined;
    if (isIosBrowser()) {
      iosTimer = window.setTimeout(() => {
        setIosMode(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, [storageKey]);

  const handleInstall = async () => {
    if (!deferred) return;
    setVisible(false);
    writeFlag(storageKey, 'prompted');
    await deferred.prompt();
    setDeferred(null);
  };

  const handleDismiss = () => {
    writeFlag(storageKey, 'dismissed');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed z-50 left-4 right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] lg:left-auto lg:right-6 lg:bottom-6 lg:w-[360px]"
      style={{
        background: 'var(--portal-card-bg)',
        border: '1px solid var(--portal-card-border)',
        borderRadius: 'var(--portal-card-radius)',
        boxShadow: '0 4px 16px rgba(43,35,25,0.16)',
        padding: 16,
      }}
    >
      <div className="flex items-start gap-3">
        {T.logoUrl && (
          <img src={T.logoUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
        )}
        <div className="flex-1">
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 4 }}>
            Add to Home Screen
          </p>
          <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.4 }}>
            {iosMode
              ? <>Tap the Share button in Safari, then choose <strong>Add to Home Screen</strong> for one-tap access to the {T.venueName} portal.</>
              : <>Install the {T.venueName} portal for one-tap access from your home screen.</>}
          </p>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            {iosMode ? (
              <button
                onClick={handleDismiss}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  background: 'var(--portal-primary)', color: '#FFFFFF',
                  border: 'none', borderRadius: 'var(--portal-button-radius)', cursor: 'pointer',
                }}
              >
                Got it
              </button>
            ) : (
              <>
                <button
                  onClick={handleInstall}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 600,
                    background: 'var(--portal-primary)', color: '#FFFFFF',
                    border: 'none', borderRadius: 'var(--portal-button-radius)', cursor: 'pointer',
                  }}
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500,
                    background: 'none', color: 'var(--portal-text-muted)',
                    border: 'none', borderRadius: 'var(--portal-button-radius)', cursor: 'pointer',
                  }}
                >
                  Not now
                </button>
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--portal-text-muted)', padding: 4, flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
