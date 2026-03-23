import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PORTAL_THEME as T } from '@/constants/portalTheme';

interface Props {
  bookingCode: string;
  isFree: boolean;
}

export default function BookingConfirmation({ bookingCode, isFree }: Props) {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <CheckCircle2 size={64} color={T.teal} style={{ margin: '0 auto 16px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.navy, margin: '0 0 12px' }}>Booking Created!</h2>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.textPrimary, letterSpacing: 2, fontFamily: 'monospace', margin: '0 0 16px' }}>
        {bookingCode}
      </div>
      <p style={{ fontSize: 14, color: T.textSecondary, maxWidth: 400, margin: '0 auto 32px' }}>
        {isFree
          ? "No payment required — you're all set!"
          : 'Your booking has been created. Payment options will be available soon.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { window.scrollTo(0, 0); window.location.reload(); }}
          style={{ background: T.navy, color: '#FFFFFF', borderRadius: 10, height: 44, border: 'none', padding: '0 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', maxWidth: 300 }}>
          View My Bookings
        </button>
        <button onClick={() => navigate('/portal')}
          style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, height: 44, padding: '0 32px', fontSize: 15, fontWeight: 500, cursor: 'pointer', width: '100%', maxWidth: 300 }}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
