import AdminLayout from '@/components/admin/AdminLayout';

export function ReportsPlaceholder() {
  return (
    <AdminLayout title="Reports">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Reports — coming soon
      </div>
    </AdminLayout>
  );
}

export function SettingsPlaceholder() {
  return (
    <AdminLayout title="Settings">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Settings — coming soon
      </div>
    </AdminLayout>
  );
}
