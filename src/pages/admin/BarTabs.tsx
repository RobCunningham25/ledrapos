import AdminLayout from '@/components/admin/AdminLayout';
import BarTabRemindersCard from '@/components/admin/BarTabRemindersCard';
import OpenTabsList from '@/components/admin/OpenTabsList';
import { useVenue } from '@/contexts/VenueContext';

export default function BarTabs() {
  const { venueId } = useVenue();

  return (
    <AdminLayout title="Bar Tabs">
      <div className="space-y-6 max-w-3xl">
        <BarTabRemindersCard />
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-base font-semibold text-foreground">Open bar tabs</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Outstanding balances across all open tabs. Use the WhatsApp button to remind a single member.
            </p>
          </div>
          <OpenTabsList venueId={venueId} />
        </div>
      </div>
    </AdminLayout>
  );
}
