import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle2, XCircle, Loader2, Copy, Check, AlertTriangle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

const T = {
  navy: '#1B3A4B', teal: '#2A9D8F', amber: '#D68910', danger: '#C0392B',
  pageBg: '#FAF8F5', cardBg: '#FFFFFF', cardBorder: '#E8E0D8',
  cardShadow: '0 2px 8px rgba(43,35,25,0.06)',
  textPrimary: '#2D2A26', textSecondary: '#5C534A', textMuted: '#8B7E74',
};

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  PENDING: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  PAID: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
  CANCELLED: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
  EXPIRED: { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' },
};

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${T.cardBorder}` }}>
      <span style={{ fontSize: 14, color: T.textMuted, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 14, color: bold ? T.navy : T.textPrimary, fontWeight: bold ? 700 : 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function PublicBookingPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const paymentStatus = searchParams.get('payment');

  const [showBanner, setShowBanner] = useState(!!paymentStatus);
  const [polling, setPolling] = useState(paymentStatus === 'success');
  const [pollCount, setPollCount] = useState(0);
  const [showEFT, setShowEFT] = useState(false);
  const [eftConfirmed, setEftConfirmed] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [payError, setPayError] = useState('');

  // Auto-dismiss banner
  useEffect(() => {
    if (showBanner && paymentStatus) {
      const t = setTimeout(() => { setShowBanner(false); setSearchParams({}, { replace: true }); }, 10000);
      return () => clearTimeout(t);
    }
  }, [showBanner, paymentStatus, setSearchParams]);

  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['public-booking', code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, booking_site_link(site_id, nights, price_per_night_cents, subtotal_cents, booking_sites(name, site_type)), booking_payments(id, amount_cents, method, status, reference)')
        .eq('booking_code', code!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!code,
  });

  // Fetch venue name
  const { data: venue } = useQuery({
    queryKey: ['public-booking-venue', booking?.venue_id],
    queryFn: async () => {
      const { data } = await supabase.from('venues').select('name, slug').eq('id', booking!.venue_id).single();
      return data;
    },
    enabled: !!booking?.venue_id,
  });

  // Fetch bank details
  const { data: bankDetails } = useQuery({
    queryKey: ['public-eft-bank', booking?.venue_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('venue_settings')
        .select('key, value')
        .eq('venue_id', booking!.venue_id)
        .in('key', ['eft_bank_name', 'eft_account_holder', 'eft_account_number', 'eft_branch_code', 'eft_account_type']);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value || ''; });
      return map;
    },
    enabled: !!booking?.venue_id && showEFT,
  });

  // Poll after successful payment redirect
  useEffect(() => {
    if (!polling || !booking) return;
    if (booking.status === 'PAID') { setPolling(false); return; }
    if (pollCount >= 10) { setPolling(false); return; }

    const t = setTimeout(() => {
      refetch();
      setPollCount(c => c + 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [polling, booking, pollCount, refetch]);

  // Auto-show EFT if already set to eft
  useEffect(() => {
    if (booking?.payment_method === 'eft' && booking?.status === 'PENDING') {
      setShowEFT(true);
      setEftConfirmed(true);
    }
  }, [booking]);

  const handlePayCard = useCallback(async () => {
    if (!booking) return;
    setPayLoading(true);
    setPayError('');
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          member_id: booking.member_id || null,
          venue_id: booking.venue_id,
          venue_slug: venue?.slug || '',
          purpose: 'booking_payment',
          amount_cents: booking.total_price_cents,
          booking_id: booking.id,
        },
      });
      if (error || !data?.redirect_url) {
        setPayError(data?.error || error?.message || 'Failed to create payment');
        setPayLoading(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch (e: any) {
      setPayError(e.message || 'Payment error');
      setPayLoading(false);
    }
  }, [booking]);

  const handleConfirmEFT = useCallback(async () => {
    if (!booking) return;
    await supabase.from('bookings').update({
      payment_method: 'eft',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', booking.id);

    // Only insert if no pending eft payment exists
    const existingPayment = booking.booking_payments?.find((p: any) => p.method === 'eft' && p.status === 'pending');
    if (!existingPayment) {
      await supabase.from('booking_payments').insert({
        venue_id: booking.venue_id,
        booking_id: booking.id,
        amount_cents: booking.total_price_cents,
        method: 'eft',
        status: 'pending',
      });
    }

    setEftConfirmed(true);
    refetch();
  }, [booking, refetch]);

  const handleCopyBank = async () => {
    if (!bankDetails || !booking) return;
    const text = [
      `Bank: ${bankDetails.eft_bank_name || ''}`,
      `Account: ${bankDetails.eft_account_holder || ''}`,
      `Acc No: ${bankDetails.eft_account_number || ''}`,
      `Branch: ${bankDetails.eft_branch_code || ''}`,
      `Type: ${bankDetails.eft_account_type || ''}`,
      `Reference: ${booking.booking_code}`,
      `Amount: ${formatCents(booking.total_price_cents)}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtDate = (d: string) => { try { return format(new Date(d + 'T12:00:00'), 'EEEE, d MMMM yyyy'); } catch { return d; } };

  // Loading
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: T.pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Loader2 size={48} color={T.textMuted} className="animate-spin" />
        <p style={{ fontSize: 14, color: T.textMuted }}>Loading booking details...</p>
      </div>
    );
  }

  // Not found
  if (!booking) {
    return (
      <div style={{ minHeight: '100vh', background: T.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <AlertCircle size={48} color={T.danger} style={{ margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.navy }}>Booking Not Found</h1>
          <p style={{ fontSize: 14, color: T.textSecondary, marginTop: 8 }}>
            The booking code <strong>{code}</strong> does not exist or may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const link = booking.booking_site_link?.[0];
  const siteName = link?.booking_sites?.name || '—';
  const siteType = link?.booking_sites?.site_type;
  const isDayVisitor = siteType === 'day_visitor';
  const nights = link?.nights || 0;
  const isVisuallyExpired = booking.status === 'PENDING' && booking.expires_at && new Date(booking.expires_at) < new Date();
  const displayStatus = isVisuallyExpired ? 'EXPIRED' : booking.status;
  const canPay = booking.status === 'PENDING' && booking.total_price_cents > 0 && !isVisuallyExpired;

  return (
    <div style={{ minHeight: '100vh', background: T.pageBg, padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.navy }}>Ledra</div>
          {venue && <div style={{ fontSize: 14, color: T.textMuted }}>{venue.name}</div>}
        </div>

        {/* Payment status banner */}
        {showBanner && paymentStatus === 'success' && (
          <div style={{ background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#065F46" />
            <span style={{ fontSize: 14, color: '#065F46' }}>Payment received — your booking is being confirmed.</span>
          </div>
        )}
        {showBanner && paymentStatus === 'cancelled' && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#92400E" />
            <span style={{ fontSize: 14, color: '#92400E' }}>Payment was cancelled. You can try again below.</span>
          </div>
        )}
        {showBanner && paymentStatus === 'failed' && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <XCircle size={16} color="#991B1B" />
            <span style={{ fontSize: 14, color: '#991B1B' }}>Payment failed. Please try again or contact the venue.</span>
          </div>
        )}

        {/* Booking card */}
        <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12, boxShadow: T.cardShadow, padding: 24, marginBottom: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: T.textPrimary }}>{booking.booking_code}</span>
            <span style={{ ...STATUS_STYLES[displayStatus], fontSize: 12, fontWeight: 500, borderRadius: 9999, padding: '2px 10px', display: 'inline-block' }}>{displayStatus}</span>
          </div>

          {/* Stay details */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Stay Details</div>
          <Row label="Site" value={siteName} />
          <Row label="Check-in" value={fmtDate(booking.check_in)} />
          {!isDayVisitor && <Row label="Check-out" value={fmtDate(booking.check_out)} />}
          <Row label={isDayVisitor ? 'Duration' : 'Nights'} value={isDayVisitor ? 'Day visit' : `${nights} night${nights !== 1 ? 's' : ''}`} />
          <Row label="Guests" value={booking.num_guests} />

          {/* Guest details */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Guest Details</div>
          <Row label="Name" value={booking.guest_name} />
          <Row label="Email" value={booking.guest_email} />
          {booking.guest_phone && <Row label="Phone" value={booking.guest_phone} />}

          {/* Pricing */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Pricing</div>
          {link && (
            <Row label={`${siteName} × ${nights} night${nights !== 1 ? 's' : ''}`}
              value={link.subtotal_cents === 0 ? 'Free' : `${formatCents(link.price_per_night_cents)} × ${nights} = ${formatCents(link.subtotal_cents)}`} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0 0' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: T.navy }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: booking.total_price_cents === 0 ? T.teal : T.navy }}>
              {booking.total_price_cents === 0 ? 'Free' : formatCents(booking.total_price_cents)}
            </span>
          </div>
        </div>

        {/* Payment section */}
        {displayStatus === 'PAID' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <CheckCircle2 size={48} color={T.teal} style={{ margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.navy }}>Booking Confirmed</h2>
            <p style={{ fontSize: 14, color: T.teal, marginTop: 4 }}>Payment has been received. You're all set!</p>
          </div>
        )}

        {displayStatus === 'CANCELLED' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <XCircle size={48} color={T.danger} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: T.danger }}>This booking has been cancelled.</p>
          </div>
        )}

        {displayStatus === 'EXPIRED' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <XCircle size={48} color="#6B7280" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: '#6B7280' }}>This booking has expired.</p>
          </div>
        )}

        {/* Polling indicator */}
        {polling && booking.status === 'PENDING' && paymentStatus === 'success' && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Loader2 size={24} color={T.textMuted} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, color: T.textMuted }}>
              {pollCount >= 10 ? 'Payment is being processed. This page will update automatically, or you can refresh in a few minutes.' : 'Confirming payment...'}
            </p>
          </div>
        )}

        {canPay && (
          <div>
            {/* Pay by card */}
            <button onClick={handlePayCard} disabled={payLoading}
              style={{
                width: '100%', height: 52, background: T.teal, color: '#FFFFFF', borderRadius: 10,
                fontSize: 16, fontWeight: 600, border: 'none', cursor: payLoading ? 'not-allowed' : 'pointer',
                opacity: payLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <CreditCard size={20} />
              {payLoading ? 'Processing...' : `Pay ${formatCents(booking.total_price_cents)} by Card`}
            </button>
            {payError && <p style={{ fontSize: 13, color: T.danger, marginTop: 8, textAlign: 'center' }}>{payError}</p>}

            {/* EFT option */}
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <span style={{ fontSize: 14, color: T.textSecondary }}>Or pay by bank transfer</span>
              {!showEFT && (
                <button onClick={() => setShowEFT(true)} style={{
                  display: 'block', margin: '8px auto 0', background: 'none', border: 'none',
                  color: T.teal, fontWeight: 500, fontSize: 14, textDecoration: 'underline', cursor: 'pointer',
                }}>
                  View Bank Details
                </button>
              )}
            </div>

            {/* EFT details */}
            {showEFT && bankDetails && (
              <div style={{ marginTop: 16 }}>
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12, boxShadow: T.cardShadow, padding: 24 }}>
                  {[
                    { label: 'Bank', value: bankDetails.eft_bank_name || '—' },
                    { label: 'Account Holder', value: bankDetails.eft_account_holder || '—' },
                    { label: 'Account Number', value: bankDetails.eft_account_number || '—' },
                    { label: 'Branch Code', value: bankDetails.eft_branch_code || '—' },
                    { label: 'Account Type', value: bankDetails.eft_account_type || '—' },
                    { label: 'Payment Reference', value: booking.booking_code, bold: true },
                    { label: 'Amount', value: formatCents(booking.total_price_cents), bold: true },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.cardBorder}` : 'none',
                    }}>
                      <span style={{ fontSize: 14, color: row.bold ? T.navy : T.textMuted, fontWeight: row.bold ? 700 : 500 }}>{row.label}</span>
                      <span style={{
                        fontSize: row.bold ? 16 : 14, color: row.bold ? T.navy : T.textPrimary,
                        fontWeight: row.bold ? 700 : 500,
                        fontFamily: row.label === 'Payment Reference' ? 'monospace' : 'inherit',
                      }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Warning */}
                <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 8, padding: 16, marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} color="#92400E" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 14, color: '#92400E' }}>
                    Please use your booking code <strong>{booking.booking_code}</strong> as the payment reference. Your booking will expire in 24 hours if payment is not confirmed.
                  </span>
                </div>

                {/* Copy + Confirm */}
                <button onClick={handleCopyBank} style={{
                  width: '100%', height: 44, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: copied ? T.teal : T.navy, color: '#FFFFFF', transition: 'background 0.2s',
                }}>
                  {copied ? <><Check size={16} /> Copied ✓</> : <><Copy size={16} /> Copy Bank Details</>}
                </button>

                {!eftConfirmed && (
                  <button onClick={handleConfirmEFT} style={{
                    width: '100%', height: 44, background: T.navy, color: '#FFFFFF', borderRadius: 10,
                    border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 8,
                  }}>
                    I'll pay by EFT
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
