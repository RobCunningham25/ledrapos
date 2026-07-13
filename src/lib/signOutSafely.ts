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
export async function signOutSafely(): Promise<void> {
  let serverSignOutFailed = false;
  try {
    const { error } = await supabase.auth.signOut();
    serverSignOutFailed = !!error;
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
