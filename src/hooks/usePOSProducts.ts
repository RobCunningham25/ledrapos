import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';

export function usePOSProducts() {
  const { venueId } = useVenue();

  const { data: products = [], isLoading, error } = useQuery({
    queryKey: ['pos-products', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liquor_products')
        .select('*')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .eq('is_available', true)
        .order('category')
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: !!venueId,
  });

  return { products, isLoading, error };
}
