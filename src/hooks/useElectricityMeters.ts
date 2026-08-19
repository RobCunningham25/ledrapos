import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import type { Tables } from '@/integrations/supabase/types';

export type ElectricityMeterWithMember = Tables<'electricity_meters'> & {
  member: Pick<Tables<'members'>, 'id' | 'first_name' | 'last_name' | 'membership_number'> | null;
};

export function useElectricityMeters() {
  const { venueId } = useVenue();

  const { data: meters = [], isLoading, error, refetch } = useQuery({
    queryKey: ['electricity-meters', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('electricity_meters')
        .select('*, member:members(id, first_name, last_name, membership_number)')
        .eq('venue_id', venueId)
        .order('unit_label');

      if (error) throw error;
      return data as ElectricityMeterWithMember[];
    },
    enabled: !!venueId,
  });

  return { meters, isLoading, error, refetch };
}
