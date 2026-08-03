import { supabase } from '@/integrations/supabase/client';

/**
 * Sign out without ever leaving the user stuck logged in on this device.
 *
 * supabase-js only clears the local session if the server-side /logout call
 * succeeds (or fails with 401/403/404). On any other failure — offline, flaky
 * mobile network, 5xx — it keeps the session in localStorage and returns an
 * error, so the login page immediately bounces the user back into the app as
 * if logout never happened. When that happens, remove the persisted session
 * ourselves.
 */
const SIGN_OUT_TIMEOUT_MS = 4000;

export async function signOutSafely(): Promise<void> {
  let serverSignOutFailed = false;
  try {
    // supabase-js waits up to 5s for its auth lock and can wait indefinitely if
    // the lock is held re-entrantly. Never let that leave the user staring at a
    // dead "Log out" button — fall through to the local purge instead.
    const timedOut = Symbol('timeout');
    const result = await Promise.race([
      supabase.auth.signOut(),
      new Promise<typeof timedOut>(resolve => setTimeout(() => resolve(timedOut), SIGN_OUT_TIMEOUT_MS)),
    ]);
    serverSignOutFailed = result === timedOut || !!result.error;
  } catch {
    serverSignOutFailed = true;
  }

  if (serverSignOutFailed) {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.includes('-auth-token')) {
        localStorage.removeItem(key);
      }
    }
  }
}
