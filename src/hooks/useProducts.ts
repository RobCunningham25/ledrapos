import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';

export function useProducts() {
  const { venueId } = useVenue();

  const { data: products = [], isLoading, error, refetch } = useQuery({
    queryKey: ['products', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liquor_products')
        .select('*')
        .eq('venue_id', venueId)
        .order('category')
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: !!venueId,
  });

  return { products, isLoading, error, refetch };
}
