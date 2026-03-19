import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FavouriteProduct {
  id: string;
  name: string;
  brand: string | null;
  size: string | null;
  category: string;
  selling_price_cents: number;
  stock_level: number;
  min_stock_level: number;
  is_available: boolean;
  is_active: boolean;
}

export function useMemberFavourites(memberId: string | null, venueId: string) {
  const [favouriteProducts, setFavouriteProducts] = useState<FavouriteProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!memberId) {
      setFavouriteProducts([]);
      return;
    }

    let cancelled = false;
    const fetch = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('member_favorites')
        .select('product_id, liquor_products(id, name, brand, size, category, selling_price_cents, stock_level, min_stock_level, is_available, is_active)')
        .eq('member_id', memberId)
        .eq('venue_id', venueId);

      if (!cancelled && data) {
        const products = data
          .map((d: any) => d.liquor_products)
          .filter((p: any) => p && p.is_active && p.is_available);
        setFavouriteProducts(products);
      }
      if (!cancelled) setIsLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [memberId, venueId]);

  return { favouriteProducts, isLoading };
}
