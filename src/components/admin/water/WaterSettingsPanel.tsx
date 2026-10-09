import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { GRACE_MINUTES, MAX_TRIP_HOURS, SNOOZE_MINUTES } from './waterUtils';

export default function WaterSettingsPanel() {
  const { venueId } = useVenue();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    supabase.from('venues').select('water_signout_ai_enabled').eq('id', venueId).single()
      .then(({ data }) => {
        setAiEnabled(!!data?.water_signout_ai_enabled);
        setLoading(false);
      });
  }, [venueId]);

  const toggle = async (v: boolean) => {
    setAiEnabled(v);
    const { error } = await supabase.from('venues').update({ water_signout_ai_enabled: v }).eq('id', venueId!);
    if (error) { setAiEnabled(!v); toast.error('Could not update setting'); }
    else toast.success(v ? 'WhatsApp sign-out enabled' : 'WhatsApp sign-out disabled');
  };

  if (loading) return <Skeleton className="h-40 w-full" />;

  const rules: Array<[string, string]> = [
    ['Member reminder', 'Sent by WhatsApp the moment a trip passes its expected return time.'],
    ['Escalation', `Safety contacts are alerted ${GRACE_MINUTES} minutes after the reminder if the member has not responded, or immediately if they tap “need help”.`],
    ['“Still out, but OK”', `Pushes the expected return back ${SNOOZE_MINUTES} minutes and sends a fresh reminder then.`],
    ['Return time limits', `Must be in the future and no more than ${MAX_TRIP_HOURS} hours away. For longer trips, sign out again each day.`],
    ['One trip at a time', 'A member can only have one open trip. Sign them in (On the water tab) before they can start another.'],
  ];

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="ws-ai" className="text-sm font-medium">Allow sign-out via WhatsApp</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lets members sign out and in by messaging the club WhatsApp number. Requires the WhatsApp assistant to be enabled.
            </p>
          </div>
          <Switch id="ws-ai" checked={aiEnabled} onCheckedChange={toggle} />
        </div>
      </section>

      <section className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-base font-semibold mb-3">How alerts work</h3>
        <dl className="space-y-3">
          {rules.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-medium">{k}</dt>
              <dd className="text-sm text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground mt-4">These timings are fixed in the system and shown here for reference.</p>
      </section>
    </div>
  );
}
