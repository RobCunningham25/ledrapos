import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminBookings from './Bookings';
import ManagerBookings from './ManagerBookings';

// The /bookings route serves the club manager a read-only caravan+camping view
// and everyone else the full admin bookings page (payments, cancellations, etc.).
export default function BookingsRoute() {
  const { adminUser } = useAdminAuth();
  return adminUser?.role === 'manager' ? <ManagerBookings /> : <AdminBookings />;
}
