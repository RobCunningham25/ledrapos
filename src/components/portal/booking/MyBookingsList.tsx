import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { format } from 'date-fns';
import { CreditCard, Building2, X, ChevronDown, ChevronUp, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import EFTDetailsScreen from '@/components/portal/booking/EFTDetailsScreen';

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  PENDING: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  PAID: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
  CANCELLED: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
  EXPIRED: { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' },
};

interface Props { venueId: string; memberId: string; }

export default function MyBookingsList({ venueId, memberId }: Props) {
  const { member } = usePortalAuth();
  const queryClient = useQueryClient();
  const [payModalBooking, setPayModalBooking] = useState<any>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [showEFT, setShowEFT] = useState<{ code: string; total: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: bookings, isLoading, fetchStatus } = useQuery({
    queryKey: ['portal-my-bookings', venueId, memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_code, guest_name, check_in, check_out, num_guests, total_price_cents, status, expires_at, payment_method, member_id, created_by_member_id, booking_site_link(site_id, nights, booking_sites(name, site_type))')
        .eq('venue_id', venueId)
        .or(`member_id.eq.${memberId},created_by_member_id.eq.${memberId}`)
        .order('check_in', { ascending: false });
      return data || [];
    },
    enabled: !!venueId && !!memberId,
    staleTime: 30_000,
  });

  if (showEFT) {
    return <EFTDetailsScreen venueId={venueId} bookingCode={showEFT.code} totalCents={showEFT.total} />;
  }

  const handlePayCard = async (b: any) => {
    if (!member) return;
    setPayLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          member_id: member.id,
          venue_id: member.venue_id,
          venue_slug: venueSlug,
          purpose: 'booking_payment',
          amount_cents: b.total_price_cents,
          booking_id: b.id,
        },
      });
      if (error || !data?.redirect_url) {
        toast.error(data?.error || error?.message || 'Failed to create payment');
        setPayLoading(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch (e: any) {
      toast.error(e.message || 'Payment error');
      setPayLoading(false);
    }
  };

  const handlePayEFT = async (b: any) => {
    if (!member) return;
    await supabase.from('bookings').update({
      payment_method: 'eft',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', b.id);

    await supabase.from('booking_payments').insert({
      venue_id: member.venue_id,
      booking_id: b.id,
      amount_cents: b.total_price_cents,
      method: 'eft',
      status: 'pending',
    });

    queryClient.invalidateQueries({ queryKey: ['portal-my-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['portal-upcoming-bookings'] });
    setPayModalBooking(null);
    setShowEFT({ code: b.booking_code, total: b.total_price_cents });
  };

  const handleCopyVisitorLink = async (bookingCode: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/booking/${bookingCode}`);
    toast.success('Link copied');
  };

  // Loading skeleton
  if (isLoading && fetchStatus !== 'idle') {
    return (
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: T.navy, marginBottom: 16 }}>My Bookings</h2>
        {[0, 1].map(i => (
          <div key={i} style={{
            background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
            padding: 16, marginBottom: 12,
          }}>
            <div style={{ height: 14, width: '60%', background: T.cardBorder, borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 14, width: '40%', background: T.cardBorder, borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 14, width: '30%', background: T.cardBorder, borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

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
        const isVisuallyExpired = b.status === 'PENDING' && b.expires_at && new Date(b.expires_at) < new Date();
        const displayStatus = isVisuallyExpired ? 'EXPIRED' : b.status;
        const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.PENDING;
        const canPay = b.status === 'PENDING' && b.total_price_cents > 0 && !isVisuallyExpired;
        const isVisitorBooking = b.member_id !== memberId && b.created_by_member_id === memberId;
        const isExpanded = expandedId === b.id;

        const fmtCI = (() => { try { return format(new Date(b.check_in + 'T12:00:00'), 'd MMM yyyy'); } catch { return b.check_in; } })();
        const fmtCO = (() => { try { return format(new Date(b.check_out + 'T12:00:00'), 'd MMM yyyy'); } catch { return b.check_out; } })();
        const fmtCIFull = (() => { try { return format(new Date(b.check_in + 'T12:00:00'), 'EEEE, d MMMM yyyy'); } catch { return b.check_in; } })();
        const fmtCOFull = (() => { try { return format(new Date(b.check_out + 'T12:00:00'), 'EEEE, d MMMM yyyy'); } catch { return b.check_out; } })();

        return (
          <div key={b.id} style={{
            background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
            boxShadow: T.cardShadow, padding: 16, marginBottom: 12, cursor: 'pointer', position: 'relative',
          }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button')) return;
              setExpandedId(isExpanded ? null : b.id);
            }}
          >
            {/* Chevron */}
            <div style={{ position: 'absolute', top: 12, right: 12 }}>
              {isExpanded ? <ChevronUp size={16} color={T.textMuted} /> : <ChevronDown size={16} color={T.textMuted} />}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, paddingRight: 24 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.textMuted }}>{b.booking_code}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, marginTop: 2 }}>{siteName}</div>
                {isVisitorBooking && (
                  <div style={{ fontSize: 13, color: T.textMuted, fontStyle: 'italic', marginTop: 2 }}>Booked for {b.guest_name}</div>
                )}
                <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 2 }}>
                  {isDayVisitor ? `${fmtCI} · Day visit` : `${fmtCI} – ${fmtCO} · ${nights} night${nights !== 1 ? 's' : ''}`}
                </div>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{b.num_guests} guest{b.num_guests !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ ...statusStyle, fontSize: 12, fontWeight: 500, borderRadius: 9999, padding: '2px 10px', display: 'inline-block' }}>{displayStatus}</span>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, marginTop: 8 }}>
                  {b.total_price_cents === 0 ? 'Free' : formatCents(b.total_price_cents)}
                </div>
                {canPay && (
                  <button onClick={() => setPayModalBooking(b)} style={{
                    marginTop: 8, background: T.teal, color: '#FFFFFF', borderRadius: 8, height: 36,
                    fontSize: 13, fontWeight: 600, padding: '0 16px', border: 'none', cursor: 'pointer',
                  }}>
                    Pay Now
                  </button>
                )}
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.cardBorder}`, marginTop: 12 }}>
                <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 4 }}>Check-in: {fmtCIFull}</div>
                {!isDayVisitor && <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 4 }}>Check-out: {fmtCOFull}</div>}
                <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 4 }}>Guests: {b.num_guests} guest{b.num_guests !== 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: T.textMuted }}>Code: <span style={{ fontFamily: 'monospace' }}>{b.booking_code}</span></span>
                  {isVisitorBooking && (
                    <button onClick={() => handleCopyVisitorLink(b.booking_code)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex',
                    }}>
                      <LinkIcon size={16} color={T.teal} />
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 13, color: T.textSecondary }}>
                  Payment: {b.payment_method === 'yoco' ? 'Card' : b.payment_method === 'eft' ? 'EFT' : '—'}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Payment method modal */}
      {payModalBooking && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => !payLoading && setPayModalBooking(null)}>
          <div style={{
            background: T.cardBg, borderRadius: 12, padding: 24, maxWidth: 440, width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', position: 'relative',
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => !payLoading && setPayModalBooking(null)} style={{
              position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer',
            }}>
              <X size={20} color={T.textMuted} />
            </button>

            <h3 style={{ fontSize: 20, fontWeight: 700, color: T.navy, textAlign: 'center', marginBottom: 4 }}>Choose Payment Method</h3>
            <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textAlign: 'center', fontFamily: 'monospace' }}>{payModalBooking.booking_code}</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: T.navy, textAlign: 'center', marginBottom: 20 }}>
              Total: {formatCents(payModalBooking.total_price_cents)}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button onClick={() => handlePayCard(payModalBooking)} disabled={payLoading}
                style={{
                  background: T.cardBg, border: `2px solid ${T.cardBorder}`, borderRadius: 12,
                  padding: 20, cursor: payLoading ? 'not-allowed' : 'pointer', textAlign: 'center',
                  opacity: payLoading ? 0.7 : 1,
                }}>
                <CreditCard size={36} color={T.navy} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>Pay by Card</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                  {payLoading ? 'Redirecting...' : 'Instant via Yoco'}
                </div>
              </button>
              <button onClick={() => handlePayEFT(payModalBooking)} disabled={payLoading}
                style={{
                  background: T.cardBg, border: `2px solid ${T.cardBorder}`, borderRadius: 12,
                  padding: 20, cursor: payLoading ? 'not-allowed' : 'pointer', textAlign: 'center',
                  opacity: payLoading ? 0.7 : 1,
                }}>
                <Building2 size={36} color={T.navy} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>Pay by EFT</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Bank transfer · 24hr</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
