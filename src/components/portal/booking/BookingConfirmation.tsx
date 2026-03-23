import { useState, useEffect } from 'react';
import { Link as LinkIcon, CheckCircle2, CreditCard, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { useVenueNav } from '@/hooks/useVenueNav';
import { formatCents } from '@/utils/currency';

interface Props {
  bookingCode: string;
  isFree: boolean;
  bookingId?: string | null;
  totalCents?: number;
  bookingFor?: 'self' | 'visitor';
  guestName?: string;
  onSelectPayment?: (method: 'card' | 'eft') => void;
  paymentLoading?: boolean;
}

export default function BookingConfirmation({ bookingCode, isFree, bookingId, totalCents = 0, bookingFor = 'self', guestName, onSelectPayment, paymentLoading }: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const isVisitor = bookingFor === 'visitor';
  const showPayment = !isFree && totalCents > 0 && onSelectPayment && !isVisitor;
  const visitorLink = `${window.location.origin}/booking/${bookingCode}`;

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copied]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(visitorLink);
    setCopied(true);
  };

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      {isVisitor ? (
        <LinkIcon size={48} color={T.teal} style={{ margin: '0 auto 16px' }} />
      ) : (
        <CheckCircle2 size={64} color={T.teal} style={{ margin: '0 auto 16px' }} />
      )}
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.navy, margin: '0 0 12px' }}>Booking Created!</h2>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, letterSpacing: 2, fontFamily: 'monospace', margin: '0 0 16px' }}>
        {bookingCode}
      </div>

      {/* Visitor link screen */}
      {isVisitor && !isFree && (
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
          <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 12 }}>
              Share this link with <strong>{guestName}</strong> so they can view the booking and complete payment:
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={visitorLink} style={{
                flex: 1, background: '#FAF8F5', border: `1px solid ${T.cardBorder}`, borderRadius: 8,
                padding: 12, fontSize: 14, fontFamily: 'monospace', color: T.textPrimary,
              }} />
              <button onClick={handleCopyLink} style={{
                background: copied ? T.teal : T.navy, color: '#FFFFFF', borderRadius: 8, height: 44,
                padding: '0 20px', fontWeight: 500, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'background 0.2s', fontSize: 14,
              }}>
                {copied ? 'Copied ✓' : 'Copy Link'}
              </button>
            </div>
            <p style={{ fontSize: 13, color: T.textMuted, textAlign: 'center', marginTop: 12 }}>
              Once they complete payment, the booking will be confirmed automatically.
            </p>
            <p style={{ fontSize: 13, color: T.textMuted, textAlign: 'center', fontStyle: 'italic', marginTop: 4 }}>
              Email delivery coming soon — for now, please share the link manually via WhatsApp, email, or SMS.
            </p>
          </div>
        </div>
      )}

      {/* Free booking */}
      {isFree && (
        <p style={{ fontSize: 14, color: T.teal, fontWeight: 500, maxWidth: 400, margin: '0 auto 32px' }}>
          No payment required — you're all set!
        </p>
      )}

      {/* Self-booking payment selection */}
      {showPayment && (
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: T.navy, marginTop: 24 }}>Choose Payment Method</h3>
          <p style={{ fontSize: 18, fontWeight: 600, color: T.navy, marginBottom: 24 }}>
            Total: {formatCents(totalCents)}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <button onClick={() => onSelectPayment!('card')} disabled={paymentLoading}
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
            <button onClick={() => onSelectPayment!('eft')} disabled={paymentLoading}
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
      )}

      {/* Navigation buttons */}
      {(isFree || isVisitor) && (
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
