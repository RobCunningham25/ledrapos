import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { signOutSafely } from '@/lib/signOutSafely';
import { useVenueNav } from '@/hooks/useVenueNav';
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

const MAX_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours from last sign-in

function isSessionExpired(s: Session | null): boolean {
  if (!s?.user?.last_sign_in_at) return false;
  return Date.now() - new Date(s.user.last_sign_in_at).getTime() > MAX_SESSION_MS;
}

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { portalLoginPath } = useVenueNav();
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
    await signOutSafely();
    setSession(null);
    setMember(null);
    navigate(portalLoginPath, { replace: true });
  }, [navigate, portalLoginPath]);

  // Track the session only. supabase-js invokes this callback while it holds the
  // auth lock, so awaiting any supabase call in here deadlocks the client — the
  // member lookup never resolves and every later auth call (including signOut)
  // blocks on the lock. Keep it synchronous; the member fetch runs in its own
  // effect below. INITIAL_SESSION fires on subscribe, so no getSession() needed.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setMember(null);
        setIsLoading(false);
        return;
      }
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || !session) return;

    if (isSessionExpired(session)) {
      handleSignOut();
      return;
    }

    let cancelled = false;
    fetchMember(userId)
      .then(m => {
        if (cancelled) return;
        setIsLoading(false);
        if (m) setMember(m);
        else handleSignOut();
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
    // `session` is intentionally excluded — refetching the member on every token
    // refresh isn't needed; the user identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchMember, handleSignOut]);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      if (isSessionExpired(session)) {
        handleSignOut();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [session, handleSignOut]);

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
