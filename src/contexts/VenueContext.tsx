import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VenueContextType {
  venueId: string;
  venueName: string;
  venueLoading: boolean;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

export function VenueProvider({ children }: { children: ReactNode }) {
  const [venue, setVenue] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchVenue() {
      const { data, error: fetchError } = await supabase
        .from('venues')
        .select('id, name, slug')
        .eq('slug', 'vca')
        .single();

      if (fetchError || !data) {
        setError(true);
      } else {
        setVenue(data);
      }
      setLoading(false);
    }
    fetchVenue();
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-lg font-semibold text-destructive">Venue not found</p>
      </div>
    );
  }

  if (loading || !venue) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <VenueContext.Provider value={{ venueId: venue.id, venueName: venue.name, venueLoading: loading }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error('useVenue must be used within a VenueProvider');
  }
  return context;
}
