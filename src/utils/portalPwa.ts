// PWA support for the member portal.
//
// The platform is multi-tenant (path-based slugs + per-venue custom domains),
// so a static manifest.json can't describe any one venue. Instead we build the
// manifest at runtime from venue branding and inject it as a blob URL. Icons
// are rendered onto a canvas from the venue logo (with an initials fallback)
// because manifest icons must be raster-friendly and venues only store a
// single logo_url.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PortalManifestOptions {
  venueName: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  /** Portal home path, e.g. '/' on a custom domain or '/vca/portal' on the shared domain */
  startPath: string;
  logoUrl: string | null;
}

/**
 * PWA icon source per venue slug. Icons are drawn onto a canvas and read back
 * with `toDataURL()`, which taints the canvas on iOS Safari when the source is
 * an SVG — silently forcing the initials fallback on iPhones. A raster PNG
 * never taints, so venues whose display logo is an SVG point here at a PNG copy
 * of the same artwork for the app icon only (the on-screen header keeps the SVG).
 */
const PWA_ICON_BY_SLUG: Record<string, string> = {
  vca: '/vca-logo.png',
};

/** Icon source for the PWA manifest: a raster override if one exists, else the venue logo. */
export function resolvePwaIconUrl(slug: string, logoUrl: string | null): string | null {
  return PWA_ICON_BY_SLUG[slug] ?? logoUrl;
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari legacy flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  const isIosDevice =
    /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS 13+ reports as Mac but has touch
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return isIosDevice;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Loads the venue logo for canvas drawing. SVGs without explicit width/height
 * (viewBox only) render at zero size on a canvas in some browsers, so those
 * are fetched, given explicit dimensions from their viewBox, and re-served
 * from a blob URL.
 */
async function loadLogoImage(url: string): Promise<HTMLImageElement> {
  if (!/\.svg(\?|#|$)/i.test(url)) return loadImage(url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg.getAttribute('width') || !svg.getAttribute('height')) {
    const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const w = vb.length === 4 && vb[2] > 0 ? vb[2] : 512;
    const h = vb.length === 4 && vb[3] > 0 ? vb[3] : 512;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
  }
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await loadImage(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function drawInitials(
  ctx: CanvasRenderingContext2D,
  size: number,
  venueName: string,
  color: string,
) {
  const initials = venueName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('') || 'C';
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(size / (initials.length >= 3 ? 3.2 : 2.6))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2 + size * 0.02);
}

async function buildIconDataUrl(
  logoUrl: string | null,
  backgroundColor: string,
  initialsColor: string,
  venueName: string,
  size: number,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  let drewLogo = false;
  if (logoUrl) {
    try {
      const img = await loadLogoImage(new URL(logoUrl, window.location.origin).href);
      const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
      // 20% padding per side keeps the logo inside the maskable safe zone
      const box = size * 0.6;
      let w = box;
      let h = box;
      if (ratio > 1) h = box / ratio;
      else w = box * ratio;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      drewLogo = true;
    } catch {
      // Cross-origin block, 404, unsupported format — fall through to initials
    }
  }
  if (!drewLogo) drawInitials(ctx, size, venueName, initialsColor);

  return canvas.toDataURL('image/png');
}

let currentManifestUrl: string | null = null;

/**
 * Builds a per-venue web app manifest and injects it as <link rel="manifest">.
 * All URLs are absolute because relative URLs inside a blob manifest do not
 * resolve against the page.
 */
export async function injectPortalManifest(opts: PortalManifestOptions): Promise<void> {
  const startUrl = new URL(opts.startPath, window.location.origin).href;

  // The app icon draws on white, not the navy theme colour: tenant flag logos
  // have dark areas that vanish against navy. White keeps the full flag visible;
  // the initials fallback flips to the theme colour so it stays legible on white.
  const iconBackground = '#FFFFFF';
  const [icon192, icon512] = await Promise.all([
    buildIconDataUrl(opts.logoUrl, iconBackground, opts.themeColor, opts.venueName, 192),
    buildIconDataUrl(opts.logoUrl, iconBackground, opts.themeColor, opts.venueName, 512),
  ]);

  const manifest = {
    id: startUrl,
    name: `${opts.venueName} Portal`,
    short_name: opts.shortName,
    description: `Member portal for ${opts.venueName}`,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: opts.backgroundColor,
    theme_color: opts.themeColor,
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  const url = URL.createObjectURL(blob);

  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = url;

  if (currentManifestUrl) URL.revokeObjectURL(currentManifestUrl);
  currentManifestUrl = url;

  let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    document.head.appendChild(themeMeta);
  }
  themeMeta.content = opts.themeColor;
}

export function registerPortalServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Non-fatal: the portal works identically without it
  });
}
