import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePortalTheme } from '@/contexts/PortalThemeContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

interface SetPasswordFromLinkProps {
  heading: string;
  subtitle: string;
  submitLabel: string;
  invalidTitle: string;
  invalidMessage: string;
}

/**
 * Shared page body for flows where an emailed Supabase auth link (invite or
 * recovery) lands the user here with a session in the URL hash, and they set
 * a password to continue into the portal.
 */
export default function SetPasswordFromLink({
  heading,
  subtitle,
  submitLabel,
  invalidTitle,
  invalidMessage,
}: SetPasswordFromLinkProps) {
  const navigate = useNavigate();
  const T = usePortalTheme();
  const { portalPath, portalLoginPath } = useVenueNav();
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

    navigate(portalPath(), { replace: true });
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
          <h1 style={{ fontWeight: 700, fontSize: 20, color: 'var(--portal-primary)', marginBottom: 12 }}>{invalidTitle}</h1>
          <p style={{ fontSize: 14, color: 'var(--portal-text-primary)', marginBottom: 20, lineHeight: 1.5 }}>
            {invalidMessage}
          </p>
          <Link
            to={portalLoginPath}
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
          <h1 style={{ fontWeight: 700, fontSize: 22, color: 'var(--portal-primary)' }}>{heading}</h1>
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 6 }}>
            {subtitle}
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
            {submitting ? 'Saving...' : submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}
