import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface AdminUser {
  id: string;
  venue_id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
}

interface AdminAuthContextType {
  adminUser: AdminUser | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolveAdmin = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setAdminUser(null);
      setSession(null);
      setIsLoading(false);
      return;
    }

    setSession(s);

    const { data: admin } = await supabase
      .from('admin_users')
      .select('*')
      .or(`auth_user_id.eq.${s.user.id},email.eq.${s.user.email}`)
      .eq('is_active', true)
      .maybeSingle();

    if (admin) {
      // Link auth_user_id on first login if needed
      if (!admin.auth_user_id || admin.auth_user_id === '00000000-0000-0000-0000-000000000000') {
        await supabase
          .from('admin_users')
          .update({ auth_user_id: s.user.id })
          .eq('id', admin.id);
        admin.auth_user_id = s.user.id;
      }
      setAdminUser(admin as AdminUser);
    } else {
      setAdminUser(null);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      resolveAdmin(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      resolveAdmin(s);
    });

    return () => subscription.unsubscribe();
  }, [resolveAdmin]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAdminUser(null);
    setSession(null);
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  return (
    <AdminAuthContext.Provider value={{ adminUser, session, isLoading, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
