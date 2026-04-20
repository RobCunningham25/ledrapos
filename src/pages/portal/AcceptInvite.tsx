import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePortalTheme } from '@/contexts/PortalThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

export default function AcceptInvite() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const T = usePortalTheme();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // The Supabase client processes the URL hash fragment on load (detectSessionInUrl
    // defaults to true). Depending on timing the resulting session shows up either via
    // an auth-state event or by the time we call getSession(). Listen to both, and
    // after a short grace period declare the link invalid if still no session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setStatus('ready');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) setStatus('ready');
    });

    const timeout = setTimeout(async () => {
      if (cancelled) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setStatus(session ? 'ready' : 'invalid');
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    navigate(`/${slug}/portal`, { replace: true });
  };

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--portal-page-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Loading...</div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--portal-page-bg)' }}>
        <div
          className="w-full"
          style={{
            maxWidth: 400,
            background: 'var(--portal-card-bg)',
            borderRadius: 'var(--portal-card-radius)',
            border: `1px solid var(--portal-card-border)`,
            boxShadow: 'var(--portal-card-shadow)',
            padding: 32,
            textAlign: 'center',
          }}
        >
          {T.logoUrl && <img src={T.logoUrl} alt="" style={{ maxHeight: 48, margin: '0 auto 12px', objectFit: 'contain' }} />}
          <h1 style={{ fontWeight: 700, fontSize: 20, color: 'var(--portal-primary)', marginBottom: 12 }}>Invite link invalid</h1>
          <p style={{ fontSize: 14, color: 'var(--portal-text-primary)', marginBottom: 20, lineHeight: 1.5 }}>
            This invite link is invalid or has expired. Ask the club to resend your invite.
          </p>
          <Link
            to={`/${slug}/portal/login`}
            style={{ fontSize: 14, color: 'var(--portal-primary)', textDecoration: 'none' }}
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--portal-page-bg)' }}>
      <div
        className="w-full"
        style={{
          maxWidth: 400,
          background: 'var(--portal-card-bg)',
          borderRadius: 'var(--portal-card-radius)',
          border: `1px solid var(--portal-card-border)`,
          boxShadow: 'var(--portal-card-shadow)',
          padding: 32,
        }}
      >
        <div className="text-center mb-6">
          {T.logoUrl && <img src={T.logoUrl} alt="" style={{ maxHeight: 48, margin: '0 auto 12px', objectFit: 'contain' }} />}
          <h1 style={{ fontWeight: 700, fontSize: 22, color: 'var(--portal-primary)' }}>Welcome to {T.venueName}</h1>
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 6 }}>
            Set a password to finish activating your portal account.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              style={{ height: 48, border: `1px solid var(--portal-card-border)`, borderRadius: 6, fontSize: 16, padding: '0 12px', paddingRight: 44 }}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            style={{ height: 48, border: `1px solid var(--portal-card-border)`, borderRadius: 6, fontSize: 16, padding: '0 12px' }}
          />
          {error && <p style={{ fontSize: 14, color: 'var(--portal-danger)' }}>{error}</p>}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full"
            style={{ height: 48, background: 'var(--portal-primary)', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 'var(--portal-button-radius)' }}
          >
            {submitting ? 'Saving...' : 'Set password & enter portal'}
          </Button>
        </form>
      </div>
    </div>
  );
}
