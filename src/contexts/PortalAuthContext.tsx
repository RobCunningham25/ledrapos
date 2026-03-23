import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface MemberRecord {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  email: string | null;
  phone: string | null;
  partner_name: string | null;
  venue_id: string;
  is_active: boolean;
  auth_user_id: string;
}

interface PortalAuthContextType {
  member: MemberRecord | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<MemberRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMember = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, membership_number, membership_type, email, phone, partner_name, venue_id, is_active, auth_user_id')
      .eq('auth_user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    return data as MemberRecord | null;
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMember(null);
    navigate(`/${slug}/portal/login`, { replace: true });
  }, [navigate, slug]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setMember(null);
        setIsLoading(false);
        return;
      }

      setSession(newSession);

      if (newSession.user) {
        const m = await fetchMember(newSession.user.id);
        if (m) {
          setMember(m);
        } else {
          await handleSignOut();
        }
      }
      setIsLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (existing?.user) {
        setSession(existing);
        const m = await fetchMember(existing.user.id);
        if (m) {
          setMember(m);
        } else {
          await handleSignOut();
          return;
        }
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchMember, handleSignOut]);

  return (
    <PortalAuthContext.Provider value={{ member, session, isLoading, signOut: handleSignOut }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);
  if (!context) {
    throw new Error('usePortalAuth must be used within a PortalAuthProvider');
  }
  return context;
}
