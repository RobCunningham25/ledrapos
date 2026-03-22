import { useMemberFavourites } from '@/hooks/useMemberFavourites';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { CATEGORY_COLORS, getCategoryLabel } from '@/constants/productCategories';
import { Skeleton } from '@/components/ui/skeleton';

const cardStyle: React.CSSProperties = {
  background: T.cardBg, borderRadius: 12, border: `1px solid ${T.cardBorder}`,
  boxShadow: T.cardShadow, padding: 20,
};

export default function FavouritesCard({ memberId, venueId }: { memberId: string; venueId: string }) {
  const { favouriteProducts, isLoading } = useMemberFavourites(memberId, venueId);

  if (isLoading) {
    return (
      <div style={cardStyle}>
        <Skeleton className="h-4 w-[120px] mb-3" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full mb-2" />)}
      </div>
    );
  }

  const displayItems = favouriteProducts.slice(0, 8);
  const remaining = favouriteProducts.length - 8;

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>Your Favourites</p>
      {favouriteProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <p style={{ fontSize: 14, color: T.textMuted, margin: 0 }}>No favourites yet</p>
          <p style={{ fontSize: 12, color: T.textMuted, margin: '4px 0 0' }}>Ask the bar staff to add your usual drinks</p>
        </div>
      ) : (
        <>
          {displayItems.map((p, idx) => (
            <div
              key={p.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderBottom: idx < displayItems.length - 1 ? `1px solid ${T.cardBorder}` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary }}>{p.name}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 8,
                  color: '#FFFFFF',
                  background: CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other,
                }}>{getCategoryLabel(p.category)}</span>
              </div>
              <span style={{ fontSize: 14, color: T.textMuted, whiteSpace: 'nowrap' }}>{formatCents(p.selling_price_cents)}</span>
            </div>
          ))}
          {remaining > 0 && (
            <p style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', marginTop: 8 }}>and {remaining} more</p>
          )}
        </>
      )}
    </div>
  );
}
