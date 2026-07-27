import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Landing page for an emailed admin/manager invite (or recovery) link. The
 * Supabase client processes the session in the URL hash on load; the user sets a
 * password and is taken into the admin panel. Admin-styled counterpart to the
 * portal's SetPasswordFromLink.
 */
export default function AdminSetPassword() {
  const navigate = useNavigate();
  const { venue } = useVenue();
  const { adminPath, adminLoginPath } = useVenueNav();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

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
    navigate(adminPath(), { replace: true });
  };

  const card: React.CSSProperties = {
    maxWidth: 400, width: '100%', background: '#FFFFFF', borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 32,
  };

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#F4F6F9' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ background: '#F4F6F9' }}>
        <div style={{ ...card, textAlign: 'center' }}>
          {venue?.logo_url && <img src={venue.logo_url} alt="" style={{ maxHeight: 48, margin: '0 auto 12px', objectFit: 'contain' }} />}
          <h1 style={{ fontWeight: 700, fontSize: 20, color: '#2E5FA3', marginBottom: 12 }}>Link expired</h1>
          <p style={{ fontSize: 14, color: '#334155', marginBottom: 20, lineHeight: 1.5 }}>
            This invite link is invalid or has already been used. Ask for a fresh invite, or use “Forgot password” on the login page.
          </p>
          <a href={adminLoginPath} style={{ fontSize: 14, color: '#2E5FA3', textDecoration: 'none' }}>Go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: '#F4F6F9' }}>
      <div style={card}>
        <div className="text-center mb-6">
          {venue?.logo_url && <img src={venue.logo_url} alt={venue?.name} style={{ maxHeight: 72, margin: '0 auto 12px', objectFit: 'contain', display: 'block' }} />}
          <h1 style={{ fontWeight: 700, fontSize: 22, color: '#2E5FA3' }}>Set your password</h1>
          <p style={{ fontSize: 13, color: '#718096', marginTop: 6 }}>
            Choose a password to finish setting up your {venue?.name ?? ''} account.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, paddingLeft: 12, paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: '#718096' }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, paddingLeft: 12 }}
          />
          {error && <p style={{ fontSize: 14, color: '#C0392B', textAlign: 'center' }}>{error}</p>}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full"
            style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 6 }}
          >
            {submitting ? 'Saving…' : 'Save password & continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
