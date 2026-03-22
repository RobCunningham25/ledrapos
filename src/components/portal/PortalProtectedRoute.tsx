import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function PortalProtectedRoute() {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setStatus('unauthenticated');
        return;
      }

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (member) {
        setStatus('authenticated');
      } else {
        await supabase.auth.signOut();
        setStatus('unauthenticated');
      }
    });
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#F4F6F9' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/portal/login" replace />;
  }

  return <Outlet />;
}
