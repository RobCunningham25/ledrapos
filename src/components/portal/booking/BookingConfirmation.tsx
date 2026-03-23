import { CheckCircle2, CreditCard, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { formatCents } from '@/utils/currency';

interface Props {
  bookingCode: string;
  isFree: boolean;
  bookingId?: string | null;
  totalCents?: number;
  onSelectPayment?: (method: 'card' | 'eft') => void;
  paymentLoading?: boolean;
}

export default function BookingConfirmation({ bookingCode, isFree, bookingId, totalCents = 0, onSelectPayment, paymentLoading }: Props) {
  const navigate = useNavigate();
  const showPayment = !isFree && totalCents > 0 && onSelectPayment;

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <CheckCircle2 size={64} color={T.teal} style={{ margin: '0 auto 16px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.navy, margin: '0 0 12px' }}>Booking Created!</h2>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.textPrimary, letterSpacing: 2, fontFamily: 'monospace', margin: '0 0 16px' }}>
        {bookingCode}
      </div>

      {isFree ? (
        <p style={{ fontSize: 14, color: T.teal, fontWeight: 500, maxWidth: 400, margin: '0 auto 32px' }}>
          No payment required — you're all set!
        </p>
      ) : showPayment ? (
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: T.navy, marginTop: 24 }}>Choose Payment Method</h3>
          <p style={{ fontSize: 18, fontWeight: 600, color: T.navy, marginBottom: 24 }}>
            Total: {formatCents(totalCents)}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <button
              onClick={() => onSelectPayment('card')}
              disabled={paymentLoading}
              style={{
                background: T.cardBg, border: `2px solid ${T.cardBorder}`, borderRadius: 12,
                padding: 24, cursor: paymentLoading ? 'not-allowed' : 'pointer', textAlign: 'center',
                opacity: paymentLoading ? 0.7 : 1, transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { if (!paymentLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = T.teal; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(43,35,25,0.1)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.cardBorder; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
            >
              <CreditCard size={48} color={T.navy} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary }}>Pay by Card</div>
              <div style={{ fontSize: 14, color: T.textMuted, marginTop: 4 }}>
                {paymentLoading ? 'Redirecting to payment...' : 'Instant confirmation via Yoco'}
              </div>
            </button>
            <button
              onClick={() => onSelectPayment('eft')}
              disabled={paymentLoading}
              style={{
                background: T.cardBg, border: `2px solid ${T.cardBorder}`, borderRadius: 12,
                padding: 24, cursor: paymentLoading ? 'not-allowed' : 'pointer', textAlign: 'center',
                opacity: paymentLoading ? 0.7 : 1, transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { if (!paymentLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = T.teal; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(43,35,25,0.1)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.cardBorder; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
            >
              <Building2 size={48} color={T.navy} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary }}>Pay by EFT</div>
              <div style={{ fontSize: 14, color: T.textMuted, marginTop: 4 }}>Bank transfer · 24-hour confirmation</div>
            </button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: T.textSecondary, maxWidth: 400, margin: '0 auto 32px' }}>
          Your booking has been created. Payment options will be available soon.
        </p>
      )}

      {(isFree || !showPayment) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 24 }}>
          <button onClick={() => { window.scrollTo(0, 0); window.location.reload(); }}
            style={{ background: T.navy, color: '#FFFFFF', borderRadius: 10, height: 44, border: 'none', padding: '0 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', maxWidth: 300 }}>
            View My Bookings
          </button>
          <button onClick={() => navigate('/portal')}
            style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, height: 44, padding: '0 32px', fontSize: 15, fontWeight: 500, cursor: 'pointer', width: '100%', maxWidth: 300 }}>
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
