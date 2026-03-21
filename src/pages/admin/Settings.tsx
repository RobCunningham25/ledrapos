import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Settings() {
  const { venueId } = useVenue();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('venue_settings')
        .select('value')
        .eq('venue_id', venueId)
        .eq('key', 'report_recipient_email')
        .maybeSingle();
      if (data?.value) setEmail(data.value);
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

  return (
    <AdminLayout title="Settings">
      <div className="max-w-lg">
        <div className="bg-card rounded-lg border border-border p-5 space-y-4">
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
            className="h-12 px-6 rounded-[6px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
