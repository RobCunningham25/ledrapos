import { createContext, useContext, ReactNode } from 'react';

interface VenueContextType {
  venueId: string;
  venueName: string;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

// Hardcoded to the seeded VCA venue — replaced with proper venue selection in a later phase
const VCA_VENUE_ID = 'eb1864cd-c9b3-4206-898d-d5300de149a5';

export function VenueProvider({ children }: { children: ReactNode }) {
  return (
    <VenueContext.Provider value={{ venueId: VCA_VENUE_ID, venueName: 'Vaal Cruising Association' }}>
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
