import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import AdminUsersTab from '@/components/admin/AdminUsersTab';
import POSUsersTab from '@/components/admin/POSUsersTab';

const PORTAL_TOGGLES = [
  { key: 'portal_tab_calendar', label: 'Calendar', helper: 'Show Calendar tab in member portal' },
  { key: 'portal_tab_my_details', label: 'My Details', helper: 'Show My Details tab in member portal' },
  { key: 'portal_tab_bookings', label: 'Bookings', helper: 'Show Bookings tab in member portal' },
];

export default function Settings() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const isSuperadmin = adminUser?.role === 'superadmin';

  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    portal_tab_calendar: true,
    portal_tab_my_details: true,
    portal_tab_bookings: true,
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('venue_settings')
        .select('key, value')
        .eq('venue_id', venueId)
        .in('key', ['report_recipient_email', 'portal_tab_calendar', 'portal_tab_my_details', 'portal_tab_bookings']);
      if (data) {
        const emailRow = data.find(r => r.key === 'report_recipient_email');
        if (emailRow?.value) setEmail(emailRow.value);
        const newToggles = { ...toggles };
        for (const t of PORTAL_TOGGLES) {
          const row = data.find(r => r.key === t.key);
          if (row) newToggles[t.key] = row.value !== 'false';
        }
        setToggles(newToggles);
      }
      setLoaded(true);
    }
    load();
  }, [venueId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('venue_settings')
      .upsert(
        { venue_id: venueId, key: 'report_recipient_email', value: email, updated_at: new Date().toISOString() },
        { onConflict: 'venue_id,key' }
      );
    setSaving(false);
    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Settings saved.');
    }
  };

  const handleToggle = async (key: string, checked: boolean) => {
    setToggles(prev => ({ ...prev, [key]: checked }));
    const { error } = await supabase
      .from('venue_settings')
      .upsert(
        { venue_id: venueId, key, value: String(checked), updated_at: new Date().toISOString() },
        { onConflict: 'venue_id,key' }
      );
    if (error) {
      toast.error('Failed to save setting');
      setToggles(prev => ({ ...prev, [key]: !checked }));
    } else {
      toast.success('Setting saved');
    }
  };

  return (
    <AdminLayout title="Settings">
      <Tabs defaultValue="general" className="w-full">
        <TabsList
          className="mb-6 bg-transparent p-0 h-auto gap-0 rounded-none border-b"
          style={{ borderColor: '#E2E8F0' }}
        >
          <TabsTrigger
            value="general"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#2E5FA3] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1 text-sm font-medium"
            style={{ color: '#4A5568' }}
          >
            General
          </TabsTrigger>
          {isSuperadmin && (
            <TabsTrigger
              value="admin-users"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#2E5FA3] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1 text-sm font-medium"
              style={{ color: '#4A5568' }}
            >
              Admin Users
            </TabsTrigger>
          )}
          <TabsTrigger
            value="pos-users"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#2E5FA3] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1 text-sm font-medium"
            style={{ color: '#4A5568' }}
          >
            POS Users
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <div className="max-w-lg space-y-6">
            <div className="bg-card rounded-lg border border-border p-5 space-y-4" style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 className="text-base font-semibold" style={{ color: '#1A202C' }}>Report Settings</h3>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">Monthly report recipient email</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 text-base rounded-[6px] border-border"
                  disabled={!loaded}
                />
                <p className="text-[13px]" style={{ color: '#718096' }}>
                  The Z-report will be emailed to this address when email delivery is configured.
                </p>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving || !loaded}
                className="h-12 px-6 rounded-[6px] font-semibold"
                style={{ background: '#2E5FA3', color: '#fff' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>

            {/* Portal Features */}
            <div>
              <h3 className="text-base font-semibold mb-3" style={{ color: '#1A202C' }}>Portal Features</h3>
              <div className="space-y-3">
                {PORTAL_TOGGLES.map(t => (
                  <div key={t.key} className="bg-white rounded-[8px] border p-4" style={{ borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#1A202C' }}>{t.label}</p>
                        <p className="text-[13px]" style={{ color: '#718096' }}>{t.helper}</p>
                      </div>
                      <Switch
                        checked={toggles[t.key]}
                        onCheckedChange={(checked) => handleToggle(t.key, checked)}
                        disabled={!loaded}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Admin Users Tab */}
        {isSuperadmin && (
          <TabsContent value="admin-users">
            <div className="max-w-2xl">
              <AdminUsersTab />
            </div>
          </TabsContent>
        )}

        {/* POS Users Tab (placeholder) */}
        <TabsContent value="pos-users">
          <div className="max-w-2xl">
            <POSUsersTab />
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
