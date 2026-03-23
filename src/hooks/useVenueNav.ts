import { useVenue } from '@/contexts/VenueContext';

export const useVenueNav = () => {
  const { venueSlug } = useVenue();
  return {
    homePath: `/${venueSlug}`,
    posPath: `/${venueSlug}/pos`,
    adminLoginPath: `/${venueSlug}/admin/login`,
    adminPath: (sub?: string) => `/${venueSlug}/admin${sub ? `/${sub}` : ''}`,
    portalLoginPath: `/${venueSlug}/portal/login`,
    portalPath: (sub?: string) => `/${venueSlug}/portal${sub ? `/${sub}` : ''}`,
  };
};
