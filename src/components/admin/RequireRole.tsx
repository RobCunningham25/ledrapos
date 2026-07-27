import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useVenueNav } from '@/hooks/useVenueNav';

/**
 * Route-level role guard. Wraps admin-only page elements so a restricted role
 * (e.g. the club manager) can't reach them by typing the URL — nav-hiding alone
 * isn't a guarantee. Redirects to the admin index when the current admin's role
 * isn't in `allow`.
 */
export default function RequireRole({ allow, children }: { allow: string[]; children: ReactNode }) {
  const { adminUser } = useAdminAuth();
  const { adminPath } = useVenueNav();

  if (adminUser && !allow.includes(adminUser.role)) {
    return <Navigate to={adminPath()} replace />;
  }

  return <>{children}</>;
}
