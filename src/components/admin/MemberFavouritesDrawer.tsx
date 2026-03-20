import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Check, Plus, Search } from 'lucide-react';
import { CATEGORY_COLORS } from '@/constants/productCategories';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
}

interface FavProduct {
  id: string;
  product_id: string;
  product_name: string;
  product_category: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
}

interface Props {
  member: Member;
  onClose: () => void;
}

export default function MemberFavouritesDrawer({ member, onClose }: Props) {
  const { venueId } = useVenue();
  const [favourites, setFavourites] = useState<FavProduct[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavourites = useCallback(async () => {
    const { data } = await supabase
      .from('member_favorites')
      .select('id, product_id, liquor_products(name, category)')
      .eq('member_id', member.id)
      .eq('venue_id', venueId);

    if (data) {
      setFavourites(data.map((d: any) => ({
        id: d.id,
        product_id: d.product_id,
        product_name: d.liquor_products?.name || '',
        product_category: d.liquor_products?.category || '',
      })));
    }
    setLoading(false);
  }, [member.id, venueId]);

  useEffect(() => { fetchFavourites(); }, [fetchFavourites]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const pattern = `%${search.trim()}%`;
      const { data } = await supabase
        .from('liquor_products')
        .select('id, name, category')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .ilike('name', pattern)
        .limit(20);
      setSearchResults(data || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [search, venueId]);

  const handleAdd = async (product: Product) => {
    // Optimistically add to favourites list
    const tempId = `temp-${product.id}`;
    setFavourites(prev => [...prev, {
      id: tempId,
      product_id: product.id,
      product_name: product.name,
      product_category: product.category,
    }]);

    const { error } = await supabase
      .from('member_favorites')
      .insert({ venue_id: venueId, member_id: member.id, product_id: product.id });

    if (error) {
      // If unique constraint violation (23505), just refresh to get the real id
      // For any other error, also just refresh
    }
    // Refresh to get correct ids
    fetchFavourites();
  };

  const handleRemove = async (fav: FavProduct) => {
    // Optimistically remove from list
    setFavourites(prev => prev.filter(f => f.id !== fav.id));

    await supabase
      .from('member_favorites')
      .delete()
      .eq('id', fav.id);
  };

  const favProductIds = new Set(favourites.map(f => f.product_id));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-card z-50 shadow-xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground">
            Favourites — {member.first_name} {member.last_name}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4 h-full">
            {/* Current favourites */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Current Favourites</h3>
              {favourites.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">No favourites yet</p>
              )}
              <div className="space-y-1">
                {favourites.map(f => (
                  <div key={f.id} className="flex items-center gap-2 py-2 px-2 rounded hover:bg-accent/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{f.product_name}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0"
                      style={{ borderColor: CATEGORY_COLORS[f.product_category], color: CATEGORY_COLORS[f.product_category] }}
                    >
                      {f.product_category}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => handleRemove(f)}
                      className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add favourite */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Add Favourite</h3>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {searchResults.map(p => {
                  const isFav = favProductIds.has(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 py-2 px-2 rounded hover:bg-accent/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{p.name}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                        style={{ borderColor: CATEGORY_COLORS[p.category], color: CATEGORY_COLORS[p.category] }}
                      >
                        {p.category}
                      </Badge>
                      {isFav ? (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAdd(p)}
                          className="w-6 h-6 flex items-center justify-center text-primary hover:text-primary/80"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
