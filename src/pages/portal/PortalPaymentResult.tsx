import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { CheckCircle, XCircle, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useVenueNav } from '@/hooks/useVenueNav';

export default function PortalPaymentResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { portalPath } = useVenueNav();
  const sessionId = params.get('session_id');
  const status = params.get('status');

  const [pollState, setPollState] = useState<'polling' | 'completed' | 'timeout'>('polling');
  const [session, setSession] = useState<{ purpose: string; amount_cents: number; metadata?: any } | null>(null);

  useEffect(() => {
    if (!sessionId) { navigate(portalPath(), { replace: true }); return; }
    if (status !== 'success') return;

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from('checkout_sessions' as any)
        .select('status, purpose, amount_cents, metadata')
        .eq('id', sessionId)
        .maybeSingle();

      const row = data as any;
      if (row?.status === 'completed') {
        clearInterval(poll);
        setSession({ purpose: row.purpose, amount_cents: row.amount_cents, metadata: row.metadata });
        setPollState('completed');
      } else if (attempts >= 15) {
        clearInterval(poll);
        if (row) setSession({ purpose: row.purpose, amount_cents: row.amount_cents, metadata: row.metadata });
        setPollState('timeout');
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [sessionId, status, navigate]);

  const containerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 32, textAlign: 'center', minHeight: '60vh',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-card-radius)',
    padding: 40, maxWidth: 400, width: '100%', boxShadow: 'var(--portal-card-shadow)',
  };

  const btnStyle: React.CSSProperties = {
    width: '100%', maxWidth: 320, height: 48, background: 'var(--portal-primary)', color: '#FFFFFF',
    fontWeight: 600, fontSize: 16, borderRadius: 'var(--portal-button-radius)', border: 'none', cursor: 'pointer', marginTop: 24,
  };

  const ghostBtnStyle: React.CSSProperties = {
    ...btnStyle, background: 'transparent', border: `1px solid var(--portal-card-border)`, color: 'var(--portal-text-secondary)', marginTop: 12,
  };

  const isBookingPayment = session?.purpose === 'booking_payment';
  const bookingCode = session?.metadata?.booking_code;

  if (status === 'cancelled') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          {isBookingPayment ? (
            <>
              <XCircle size={48} color="var(--portal-warning)" />
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--portal-text-primary)', marginTop: 16 }}>Payment Cancelled</p>
              <p style={{ fontSize: 15, color: 'var(--portal-text-muted)', marginTop: 8 }}>Your booking has been created but is still awaiting payment. You can pay later from your bookings page.</p>
              <button onClick={() => navigate(portalPath('bookings'))} style={btnStyle}>View My Bookings</button>
            </>
          ) : (
            <>
              <AlertTriangle size={48} color="var(--portal-warning)" />
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--portal-text-primary)', marginTop: 16 }}>Payment Cancelled</p>
              <p style={{ fontSize: 15, color: 'var(--portal-text-muted)', marginTop: 8 }}>No charge was made to your card.</p>
              <button onClick={() => navigate(portalPath())} style={btnStyle}>Back to Home</button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          {isBookingPayment ? (
            <>
              <XCircle size={48} color="var(--portal-danger)" />
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--portal-text-primary)', marginTop: 16 }}>Payment Failed</p>
              <p style={{ fontSize: 15, color: 'var(--portal-text-muted)', marginTop: 8 }}>Something went wrong with the payment. Your booking is still pending — you can try again from your bookings page.</p>
              <button onClick={() => navigate(portalPath('bookings'))} style={btnStyle}>View My Bookings</button>
            </>
          ) : (
            <>
              <XCircle size={48} color="var(--portal-danger)" />
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--portal-text-primary)', marginTop: 16 }}>Payment Failed</p>
              <p style={{ fontSize: 15, color: 'var(--portal-text-muted)', marginTop: 8 }}>Something went wrong. Please try again or settle at the bar.</p>
              <button onClick={() => navigate(portalPath())} style={btnStyle}>Back to Home</button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (pollState === 'polling') {
    return (
      <div style={containerStyle}>
        <Loader2 size={48} color="var(--portal-text-muted)" className="animate-spin" />
        <p style={{ fontSize: 16, color: 'var(--portal-text-muted)', marginTop: 16 }}>Confirming your payment...</p>
      </div>
    );
  }

  if (pollState === 'completed' && session) {
    if (isBookingPayment) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <CheckCircle2 size={64} color="var(--portal-success)" />
            <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--portal-primary)', marginTop: 16 }}>Booking Confirmed!</p>
            {bookingCode && (
              <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--portal-text-primary)', marginTop: 8 }}>{bookingCode}</p>
            )}
            <p style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 8 }}>Your payment has been received and your booking is confirmed.</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--portal-text-primary)', marginTop: 8 }}>{formatCents(session.amount_cents)}</p>
            <button onClick={() => navigate(portalPath('bookings'))} style={btnStyle}>View My Bookings</button>
            <button onClick={() => navigate(portalPath())} style={ghostBtnStyle}>Back to Home</button>
          </div>
        </div>
      );
    }

    const heading = session.purpose === 'credit_load' ? 'Credit Loaded!' : 'Tab Paid!';
    const subtext = session.purpose === 'credit_load'
      ? `${formatCents(session.amount_cents)} has been added to your credit balance`
      : `${formatCents(session.amount_cents)} has been applied to your tab`;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <CheckCircle size={48} color="var(--portal-success)" />
          <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--portal-text-primary)', marginTop: 16 }}>{heading}</p>
          <p style={{ fontSize: 15, color: 'var(--portal-text-muted)', marginTop: 8 }}>{subtext}</p>
          <button onClick={() => navigate(portalPath())} style={btnStyle}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <Loader2 size={48} color="var(--portal-text-muted)" />
        <p style={{ fontSize: 15, color: 'var(--portal-text-muted)', marginTop: 16 }}>
          Your payment was received but is still being processed. Your balance will update shortly.
        </p>
        <button onClick={() => navigate(portalPath())} style={btnStyle}>Back to Home</button>
      </div>
    </div>
  );
}
