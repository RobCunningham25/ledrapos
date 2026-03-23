import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  PENDING: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  PAID: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
  CANCELLED: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
  EXPIRED: { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' },
};

interface Props { venueId: string; memberId: string; }

export default function MyBookingsList({ venueId, memberId }: Props) {
  const { data: bookings } = useQuery({
    queryKey: ['portal-my-bookings', venueId, memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_code, guest_name, check_in, check_out, num_guests, total_price_cents, status, booking_site_link(site_id, nights, booking_sites(name, site_type))')
        .eq('venue_id', venueId)
        .or(`member_id.eq.${memberId},created_by_member_id.eq.${memberId}`)
        .order('check_in', { ascending: false });
      return data || [];
    },
  });

  if (!bookings || bookings.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: T.navy, marginBottom: 16 }}>My Bookings</h2>
      {bookings.map((b: any) => {
        const link = b.booking_site_link?.[0];
        const siteName = link?.booking_sites?.name || '—';
        const siteType = link?.booking_sites?.site_type;
        const isDayVisitor = siteType === 'day_visitor';
        const nights = link?.nights || 0;
        const statusStyle = STATUS_STYLES[b.status] || STATUS_STYLES.PENDING;
        const fmtCI = (() => { try { return format(new Date(b.check_in + 'T12:00:00'), 'd MMM yyyy'); } catch { return b.check_in; } })();
        const fmtCO = (() => { try { return format(new Date(b.check_out + 'T12:00:00'), 'd MMM yyyy'); } catch { return b.check_out; } })();

        return (
          <div key={b.id} style={{
            background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
            boxShadow: T.cardShadow, padding: 16, marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8,
          }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.textMuted }}>{b.booking_code}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, marginTop: 2 }}>{siteName}</div>
              <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 2 }}>
                {isDayVisitor ? `${fmtCI} · Day visit` : `${fmtCI} – ${fmtCO} · ${nights} night${nights !== 1 ? 's' : ''}`}
              </div>
              <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{b.num_guests} guest{b.num_guests !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ ...statusStyle, fontSize: 12, fontWeight: 500, borderRadius: 9999, padding: '2px 10px', display: 'inline-block' }}>{b.status}</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, marginTop: 8 }}>
                {b.total_price_cents === 0 ? 'Free' : formatCents(b.total_price_cents)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
