import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function PortalPaymentResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get('session_id');
  const status = params.get('status');

  const [pollState, setPollState] = useState<'polling' | 'completed' | 'timeout'>('polling');
  const [session, setSession] = useState<{ purpose: string; amount_cents: number } | null>(null);

  useEffect(() => {
    if (!sessionId) { navigate('/portal', { replace: true }); return; }
    if (status !== 'success') return;

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from('checkout_sessions' as any)
        .select('status, purpose, amount_cents')
        .eq('id', sessionId)
        .maybeSingle();

      const row = data as any;
      if (row?.status === 'completed') {
        clearInterval(poll);
        setSession({ purpose: row.purpose, amount_cents: row.amount_cents });
        setPollState('completed');
      } else if (attempts >= 15) {
        clearInterval(poll);
        if (row) setSession({ purpose: row.purpose, amount_cents: row.amount_cents });
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
    background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
    padding: 40, maxWidth: 400, width: '100%', boxShadow: T.cardShadow,
  };

  const btnStyle: React.CSSProperties = {
    width: '100%', maxWidth: 320, height: 48, background: T.navy, color: '#FFFFFF',
    fontWeight: 600, fontSize: 16, borderRadius: 10, border: 'none', cursor: 'pointer', marginTop: 24,
  };

  if (status === 'cancelled') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <AlertTriangle size={48} color={T.amber} />
          <p style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginTop: 16 }}>Payment Cancelled</p>
          <p style={{ fontSize: 15, color: T.textMuted, marginTop: 8 }}>No charge was made to your card.</p>
          <button onClick={() => navigate('/portal')} style={btnStyle}>Back to Home</button>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <XCircle size={48} color={T.danger} />
          <p style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginTop: 16 }}>Payment Failed</p>
          <p style={{ fontSize: 15, color: T.textMuted, marginTop: 8 }}>Something went wrong. Please try again or settle at the bar.</p>
          <button onClick={() => navigate('/portal')} style={btnStyle}>Back to Home</button>
        </div>
      </div>
    );
  }

  if (pollState === 'polling') {
    return (
      <div style={containerStyle}>
        <Loader2 size={48} color={T.textMuted} className="animate-spin" />
        <p style={{ fontSize: 16, color: T.textMuted, marginTop: 16 }}>Confirming your payment...</p>
      </div>
    );
  }

  if (pollState === 'completed' && session) {
    const heading = session.purpose === 'credit_load' ? 'Credit Loaded!' : 'Tab Paid!';
    const subtext = session.purpose === 'credit_load'
      ? `${formatCents(session.amount_cents)} has been added to your credit balance`
      : `${formatCents(session.amount_cents)} has been applied to your tab`;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <CheckCircle size={48} color={T.teal} />
          <p style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginTop: 16 }}>{heading}</p>
          <p style={{ fontSize: 15, color: T.textMuted, marginTop: 8 }}>{subtext}</p>
          <button onClick={() => navigate('/portal')} style={btnStyle}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <Loader2 size={48} color={T.textMuted} />
        <p style={{ fontSize: 15, color: T.textMuted, marginTop: 16 }}>
          Your payment was received but is still being processed. Your balance will update shortly.
        </p>
        <button onClick={() => navigate('/portal')} style={btnStyle}>Back to Home</button>
      </div>
    </div>
  );
}
