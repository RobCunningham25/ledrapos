// ============================================================
// ADMIN AUTH — SETUP REQUIRED
// ============================================================
// 1. In Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
//    Add: {SITE_URL}/admin/login (for password reset redirects)
//
// 2. Rob's first login:
//    - Go to /admin/login
//    - Click "First time? Create your account"
//    - Sign up with rob@dearziva.co.za and a strong password
//    - Account will auto-link to the seeded admin_users record
//
// 3. To add more admins:
//    - Insert a row into admin_users (venue_id, email, name, role)
//    - The new admin visits /admin/login, clicks "Create your account"
//    - Their auth_user_id links automatically on first sign-in
// ============================================================

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type View = 'login' | 'signup' | 'forgot';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: admin } = await supabase
          .from('admin_users')
          .select('id')
          .or(`auth_user_id.eq.${session.user.id},email.eq.${session.user.email}`)
          .eq('is_active', true)
          .maybeSingle();

        if (admin) {
          navigate(`/${slug}/admin/products`, { replace: true });
          return;
        }
      }
      setCheckingSession(false);
    });
  }, [navigate]);

  const linkAdminUser = async (userId: string, userEmail: string) => {
    // Find admin record by email
    const { data: admin } = await supabase
      .from('admin_users')
      .select('id, auth_user_id')
      .eq('email', userEmail)
      .eq('is_active', true)
      .maybeSingle();

    if (!admin) {
      await supabase.auth.signOut();
      setError('This account does not have admin access.');
      return false;
    }

    // Link auth_user_id on first login
    if (!admin.auth_user_id || admin.auth_user_id === '00000000-0000-0000-0000-000000000000') {
      await supabase
        .from('admin_users')
        .update({ auth_user_id: userId })
        .eq('id', admin.id);
    }

    return true;
  };

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
      const linked = await linkAdminUser(data.user.id, data.user.email!);
      if (linked) {
        navigate(`/${slug}/admin/products`, { replace: true });
      }
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Auto sign-in after signup
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      if (signInData.user) {
        const linked = await linkAdminUser(signInData.user.id, signInData.user.email!);
        if (linked) {
          navigate(`/${slug}/admin/products`, { replace: true });
        }
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${slug}/admin/login`,
    });

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
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const passwordInput = (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
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
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: '#F4F6F9' }}>
      <div style={{ maxWidth: 400, width: '100%', background: '#FFFFFF', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 32 }}>
        <div className="text-center mb-6">
          <h1 style={{ fontWeight: 700, fontSize: 24, color: '#2E5FA3' }}>Ledra</h1>
          <p style={{ fontSize: 14, color: '#718096', marginTop: 2 }}>Admin Panel</p>
        </div>

        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, paddingLeft: 12 }}
            />
            {passwordInput}
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 6 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            {error && <p style={{ fontSize: 14, color: '#C0392B', textAlign: 'center' }}>{error}</p>}
            <p
              className="text-center cursor-pointer"
              style={{ fontSize: 14, color: '#2E5FA3' }}
              onClick={() => { setView('forgot'); setError(''); setResetSent(false); }}
            >
              Forgot password?
            </p>
            <p
              className="text-center cursor-pointer"
              style={{ fontSize: 14, color: '#2E5FA3' }}
              onClick={() => { setView('signup'); setError(''); }}
            >
              First time? Create your account
            </p>
          </form>
        )}

        {view === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, paddingLeft: 12 }}
            />
            {passwordInput}
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, paddingLeft: 12 }}
            />
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 6 }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
            {error && <p style={{ fontSize: 14, color: '#C0392B', textAlign: 'center' }}>{error}</p>}
            <p
              className="text-center cursor-pointer"
              style={{ fontSize: 14, color: '#2E5FA3' }}
              onClick={() => { setView('login'); setError(''); }}
            >
              Back to login
            </p>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            {resetSent ? (
              <p style={{ fontSize: 14, color: '#1E8449', textAlign: 'center' }}>
                Check your email for a reset link
              </p>
            ) : (
              <>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ height: 48, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 16, paddingLeft: 12 }}
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full"
                  style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, fontSize: 16, borderRadius: 6 }}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                {error && <p style={{ fontSize: 14, color: '#C0392B', textAlign: 'center' }}>{error}</p>}
              </>
            )}
            <p
              className="text-center cursor-pointer"
              style={{ fontSize: 14, color: '#2E5FA3' }}
              onClick={() => { setView('login'); setError(''); setResetSent(false); }}
            >
              Back to login
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
