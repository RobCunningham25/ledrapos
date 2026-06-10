import { useVenue } from '@/contexts/VenueContext';
import { getCustomDomainConfig } from '@/config/customDomains';

export const useVenueNav = () => {
  const { venueSlug } = useVenue();
  const customDomain = getCustomDomainConfig();

  if (customDomain?.section === 'portal') {
    return {
      homePath: `/${venueSlug}`,
      posPath: `/${venueSlug}/pos`,
      adminLoginPath: `/${venueSlug}/admin/login`,
      adminPath: (sub?: string) => `/${venueSlug}/admin${sub ? `/${sub}` : ''}`,
      portalLoginPath: '/login',
      portalPath: (sub?: string) => (sub ? `/${sub}` : '/'),
    };
  }

  if (customDomain?.section === 'admin') {
    return {
      homePath: '/',
      posPath: `/${venueSlug}/pos`,
      adminLoginPath: '/login',
      adminPath: (sub?: string) => (sub ? `/${sub}` : '/'),
      portalLoginPath: `/${venueSlug}/portal/login`,
      portalPath: (sub?: string) => `/${venueSlug}/portal${sub ? `/${sub}` : ''}`,
    };
  }

  if (customDomain?.section === 'pos') {
    return {
      homePath: '/',
      posPath: '/',
      adminLoginPath: `/${venueSlug}/admin/login`,
      adminPath: (sub?: string) => `/${venueSlug}/admin${sub ? `/${sub}` : ''}`,
      portalLoginPath: `/${venueSlug}/portal/login`,
      portalPath: (sub?: string) => `/${venueSlug}/portal${sub ? `/${sub}` : ''}`,
    };
  }

  return {
    homePath: `/${venueSlug}`,
    posPath: `/${venueSlug}/pos`,
    adminLoginPath: `/${venueSlug}/admin/login`,
    adminPath: (sub?: string) => `/${venueSlug}/admin${sub ? `/${sub}` : ''}`,
    portalLoginPath: `/${venueSlug}/portal/login`,
    portalPath: (sub?: string) => `/${venueSlug}/portal${sub ? `/${sub}` : ''}`,
  };
};
