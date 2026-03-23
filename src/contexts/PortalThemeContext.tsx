import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';
import { useVenue } from '@/contexts/VenueContext';
import { PORTAL_THEME } from '@/constants/portalTheme';

export interface PortalTheme {
  primaryColor: string;
  accentColor: string;
  tertiaryColor: string;
  heroGradient: string;
  pageBackground: string;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  dangerColor: string;
  warningColor: string;
  successColor: string;
  buttonRadius: string;
  cardRadius: string;
  venueName: string;
  logoUrl: string | null;
  welcomeMessage: string;
  tagline: string;
}

const PortalThemeContext = createContext<PortalTheme | undefined>(undefined);

export function PortalThemeProvider({ children }: { children: ReactNode }) {
  const { venue } = useVenue();

  const theme = useMemo<PortalTheme>(() => ({
    primaryColor: venue?.primary_color ?? PORTAL_THEME.navy,
    accentColor: venue?.accent_color ?? PORTAL_THEME.teal,
    tertiaryColor: venue?.tertiary_color ?? PORTAL_THEME.gold,
    heroGradient: venue?.hero_gradient ?? PORTAL_THEME.heroGradient,
    pageBackground: venue?.page_background ?? PORTAL_THEME.pageBg,
    cardBackground: venue?.card_background ?? PORTAL_THEME.cardBg,
    cardBorder: venue?.card_border ?? PORTAL_THEME.cardBorder,
    cardShadow: venue?.card_shadow ?? PORTAL_THEME.cardShadow,
    textPrimary: venue?.text_primary ?? PORTAL_THEME.textPrimary,
    textSecondary: venue?.text_secondary ?? PORTAL_THEME.textSecondary,
    textMuted: venue?.text_muted ?? PORTAL_THEME.textMuted,
    dangerColor: venue?.danger_color ?? PORTAL_THEME.danger,
    warningColor: venue?.warning_color ?? PORTAL_THEME.amber,
    successColor: venue?.success_color ?? PORTAL_THEME.success,
    buttonRadius: venue?.button_radius ?? PORTAL_THEME.buttonRadius,
    cardRadius: venue?.card_radius ?? PORTAL_THEME.cardRadius,
    venueName: venue?.name ?? 'Club',
    logoUrl: venue?.logo_url ?? null,
    welcomeMessage: venue?.welcome_message ?? '',
    tagline: venue?.tagline ?? '',
  }), [venue]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--portal-primary', theme.primaryColor);
    root.style.setProperty('--portal-accent', theme.accentColor);
    root.style.setProperty('--portal-tertiary', theme.tertiaryColor);
    root.style.setProperty('--portal-hero-gradient', theme.heroGradient);
    root.style.setProperty('--portal-page-bg', theme.pageBackground);
    root.style.setProperty('--portal-card-bg', theme.cardBackground);
    root.style.setProperty('--portal-card-border', theme.cardBorder);
    root.style.setProperty('--portal-card-shadow', theme.cardShadow);
    root.style.setProperty('--portal-text-primary', theme.textPrimary);
    root.style.setProperty('--portal-text-secondary', theme.textSecondary);
    root.style.setProperty('--portal-text-muted', theme.textMuted);
    root.style.setProperty('--portal-danger', theme.dangerColor);
    root.style.setProperty('--portal-warning', theme.warningColor);
    root.style.setProperty('--portal-success', theme.successColor);
    root.style.setProperty('--portal-button-radius', theme.buttonRadius);
    root.style.setProperty('--portal-card-radius', theme.cardRadius);

    return () => {
      // Cleanup CSS vars when unmounted
      const vars = [
        '--portal-primary', '--portal-accent', '--portal-tertiary', '--portal-hero-gradient',
        '--portal-page-bg', '--portal-card-bg', '--portal-card-border', '--portal-card-shadow',
        '--portal-text-primary', '--portal-text-secondary', '--portal-text-muted',
        '--portal-danger', '--portal-warning', '--portal-success',
        '--portal-button-radius', '--portal-card-radius',
      ];
      vars.forEach(v => root.style.removeProperty(v));
    };
  }, [theme]);

  return (
    <PortalThemeContext.Provider value={theme}>
      {children}
    </PortalThemeContext.Provider>
  );
}

export function usePortalTheme() {
  const context = useContext(PortalThemeContext);
  if (!context) {
    throw new Error('usePortalTheme must be used within a PortalThemeProvider');
  }
  return context;
}
