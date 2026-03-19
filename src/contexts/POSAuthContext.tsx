import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';

interface POSUser {
  id: string;
  name: string;
  role: string;
  venueId: string;
}

interface POSAuthContextType {
  currentUser: POSUser | null;
  sessionStartedAt: Date | null;
  lastActivityAt: Date | null;
  isLocked: boolean;
  isAuthenticated: boolean;
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  refreshActivity: () => void;
}

interface StoredSession {
  userId: string;
  userName: string;
  userRole: string;
  venueId: string;
  sessionStartedAt: string;
  lastActivityAt: string;
  posSessionId: string;
}

const SESSION_KEY = 'ledrapos_session';
const MAX_SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

const POSAuthContext = createContext<POSAuthContextType | undefined>(undefined);

async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const res = await supabase.functions.invoke('hash-pin', {
    body: { pin, hash },
  });
  return res.data?.valid === true;
}

export function POSAuthProvider({ children }: { children: ReactNode }) {
  const { venueId } = useVenue();
  const [currentUser, setCurrentUser] = useState<POSUser | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<Date | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const posSessionIdRef = useRef<string | null>(null);

  const isAuthenticated = currentUser !== null && !isLocked;

  const saveSession = useCallback((user: POSUser, started: Date, lastActivity: Date, posSessionId: string) => {
    const session: StoredSession = {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      venueId: user.venueId,
      sessionStartedAt: started.toISOString(),
      lastActivityAt: lastActivity.toISOString(),
      posSessionId,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setSessionStartedAt(null);
    setLastActivityAt(null);
    setIsLocked(false);
    posSessionIdRef.current = null;
  }, []);

  const logout = useCallback(async () => {
    if (posSessionIdRef.current) {
      await supabase
        .from('pos_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', posSessionIdRef.current);
    }
    clearSession();
  }, [clearSession]);

  const refreshActivity = useCallback(() => {
    const now = new Date();
    setLastActivityAt(now);
    // Update localStorage
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const session: StoredSession = JSON.parse(raw);
        session.lastActivityAt = now.toISOString();
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch { /* ignore */ }
    }
  }, []);

  const login = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    const { data: users, error } = await supabase
      .from('pos_users')
      .select('id, name, role, pin_hash, venue_id')
      .eq('venue_id', venueId)
      .eq('is_active', true);

    if (error || !users?.length) {
      return { success: false, error: 'Invalid PIN' };
    }

    for (const user of users) {
      const valid = await verifyPin(pin, user.pin_hash);
      if (valid) {
        const now = new Date();
        const posUser: POSUser = { id: user.id, name: user.name, role: user.role, venueId };

        // Create pos_session
        const { data: session } = await supabase
          .from('pos_sessions')
          .insert({ venue_id: venueId, pos_user_id: user.id })
          .select('id')
          .single();

        const posSessionId = session?.id || '';
        posSessionIdRef.current = posSessionId;

        setCurrentUser(posUser);
        setSessionStartedAt(now);
        setLastActivityAt(now);
        setIsLocked(false);
        saveSession(posUser, now, now, posSessionId);

        return { success: true };
      }
    }

    return { success: false, error: 'Invalid PIN' };
  }, [venueId, saveSession]);

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    if (!currentUser) return false;

    const { data: users } = await supabase
      .from('pos_users')
      .select('pin_hash')
      .eq('id', currentUser.id)
      .eq('is_active', true)
      .single();

    if (!users) return false;

    const valid = await verifyPin(pin, users.pin_hash);
    if (valid) {
      setIsLocked(false);
      refreshActivity();
      return true;
    }
    return false;
  }, [currentUser, refreshActivity]);

  // Restore session on mount
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setInitialized(true);
      return;
    }

    try {
      const session: StoredSession = JSON.parse(raw);
      if (session.venueId !== venueId) {
        clearSession();
        setInitialized(true);
        return;
      }

      const started = new Date(session.sessionStartedAt);
      const lastAct = new Date(session.lastActivityAt);
      const now = Date.now();

      if (now - started.getTime() > MAX_SESSION_MS) {
        clearSession();
        setInitialized(true);
        return;
      }

      const user: POSUser = {
        id: session.userId,
        name: session.userName,
        role: session.userRole,
        venueId: session.venueId,
      };
      posSessionIdRef.current = session.posSessionId;
      setCurrentUser(user);
      setSessionStartedAt(started);
      setLastActivityAt(lastAct);

      if (now - lastAct.getTime() > INACTIVITY_MS) {
        setIsLocked(true);
      }
    } catch {
      clearSession();
    }
    setInitialized(true);
  }, [venueId, clearSession]);

  // Timer to check session/inactivity every 60s
  useEffect(() => {
    if (!currentUser || !sessionStartedAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - sessionStartedAt.getTime() > MAX_SESSION_MS) {
        logout();
        return;
      }
      if (lastActivityAt && now - lastActivityAt.getTime() > INACTIVITY_MS) {
        setIsLocked(true);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [currentUser, sessionStartedAt, lastActivityAt, logout]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  return (
    <POSAuthContext.Provider
      value={{
        currentUser,
        sessionStartedAt,
        lastActivityAt,
        isLocked,
        isAuthenticated,
        login,
        logout,
        unlock,
        refreshActivity,
      }}
    >
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth() {
  const context = useContext(POSAuthContext);
  if (!context) {
    throw new Error('usePOSAuth must be used within a POSAuthProvider');
  }
  return context;
}
