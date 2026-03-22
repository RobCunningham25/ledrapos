// Supabase Auth redirect URLs must be configured in the Supabase dashboard:
// Authentication → URL Configuration → Redirect URLs
// Add: {SITE_URL}/portal/login (for password reset and invite confirmation redirects)
// This is a manual step — Lovable cannot configure it automatically.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/portal', { replace: true });
      } else {
        setCheckingSession(false);
      }
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', data.user.id)
        .maybeSingle();

      if (!member) {
        await supabase.auth.signOut();
        setError('This account is not linked to a membership. Please contact the club.');
        setLoading(false);
        return;
      }

      navigate('/portal', { replace: true });
    }

    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail);

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#F4F6F9' }}>
        <div className="text-sm" style={{ color: '#718096' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: '#F4F6F9' }}>
      <div
        className="w-full"
        style={{
          maxWidth: 400,
          background: '#FFFFFF',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          padding: 32,
        }}
      >
        <div className="text-center mb-6">
          <h1 style={{ fontWeight: 700, fontSize: 24, color: '#2E5FA3' }}>Ledra</h1>
          <p style={{ fontSize: 14, color: '#718096', marginTop: 4 }}>Vaal Cruising Association</p>
        </div>

        {forgotMode ? (
          resetSent ? (
            <div className="text-center">
              <p style={{ fontSize: 14, color: '#1A202C' }}>Check your email for a reset link</p>
              <button
                className="mt-4"
                style={{ fontSize: 14, color: '#2E5FA3', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => { setForgotMode(false); setResetSent(false); setError(''); }}
              >
                Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <Input
                type="email"
                placeholder="Email address"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                required
                style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, padding: '0 12px' }}
              />
              {error && <p style={{ fontSize: 14, color: '#C0392B' }}>{error}</p>}
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 6 }}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  style={{ fontSize: 14, color: '#2E5FA3', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => { setForgotMode(false); setError(''); }}
                >
                  Back to login
                </button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, padding: '0 12px' }}
            />
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, padding: '0 12px', paddingRight: 44 }}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096' }}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && <p style={{ fontSize: 14, color: '#C0392B' }}>{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 6 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <div className="text-center">
              <button
                type="button"
                style={{ fontSize: 14, color: '#2E5FA3', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => { setForgotMode(true); setResetEmail(email); setError(''); }}
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
