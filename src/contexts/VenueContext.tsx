import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams, Outlet } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Venue = Tables<'venues'>;

interface VenueContextType {
  venue: Venue | null;
  venueId: string;
  venueSlug: string;
  venueName: string;
  venueLoading: boolean;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

export function VenueProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setVenue(null);

    async function fetchVenue() {
      const { data, error: fetchError } = await supabase
        .from('venues')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (fetchError || !data) {
        setError(true);
      } else {
        setVenue(data);
      }
      setLoading(false);
    }
    fetchVenue();
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#FAF8F5' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: '#2D2A26' }}>This venue could not be found</p>
          <a href="https://ledra.co.za" style={{ fontSize: 14, color: '#2A9D8F', marginTop: 12, display: 'inline-block' }}>
            Go to ledra.co.za
          </a>
        </div>
      </div>
    );
  }

  if (loading || !venue) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#FAF8F5' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <VenueContext.Provider value={{ venue, venueId: venue.id, venueSlug: venue.slug, venueName: venue.name, venueLoading: loading }}>
      {children}
    </VenueContext.Provider>
  );
}

/** Wrapper route component that reads :slug from URL and provides VenueContext */
export function VenueResolver() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#FAF8F5' }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#2D2A26' }}>Venue not found</p>
      </div>
    );
  }
  return (
    <VenueProvider slug={slug}>
      <Outlet />
    </VenueProvider>
  );
}

export function useVenue() {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error('useVenue must be used within a VenueProvider');
  }
  return context;
}
