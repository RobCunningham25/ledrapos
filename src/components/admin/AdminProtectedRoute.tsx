import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useVenueNav } from '@/hooks/useVenueNav';

export default function AdminProtectedRoute() {
  const { adminUser, isLoading } = useAdminAuth();
  const { adminLoginPath } = useVenueNav();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#F4F6F9' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!adminUser || !adminUser.is_active) {
    return <Navigate to={adminLoginPath} replace />;
  }

  return <Outlet />;
}
