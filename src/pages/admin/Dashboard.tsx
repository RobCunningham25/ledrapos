import AdminLayout from '@/components/admin/AdminLayout';
import BarTabRemindersCard from '@/components/admin/BarTabRemindersCard';

export default function Dashboard() {
  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <BarTabRemindersCard />
      </div>
    </AdminLayout>
  );
}
