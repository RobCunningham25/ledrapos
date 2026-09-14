import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves an auth.users id to the members.id it should act as — the
 * primary members.auth_user_id path first, falling back to an active
 * member_auth_logins row (a secondary/spouse login). Single source of
 * truth shared by PortalAuthContext, PortalProtectedRoute and PortalLogin
 * so a member is reachable the same way regardless of which login they used.
 */
export async function resolvePortalMemberId(userId: string): Promise<string | null> {
  const { data } = await supabase.rpc('resolve_member_id', { p_auth_user_id: userId });
  return (data as string | null) ?? null;
}
