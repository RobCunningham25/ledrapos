import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  sites: { id: string; name: string }[];
}

export default function BlackoutDrawer({ open, onClose, sites }: Props) {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [siteId, setSiteId] = useState('all');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStartDate(''); setEndDate(''); setSiteId('all'); setReason(''); setErrors({});
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!startDate) errs.startDate = 'Start date is required';
    if (!endDate) errs.endDate = 'End date is required';
    if (startDate && endDate && endDate < startDate) errs.endDate = 'End date must be on or after start date';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const { error } = await supabase.from('booking_blackouts').insert({
      venue_id: venueId,
      site_id: siteId === 'all' ? null : siteId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
      created_by: adminUser?.auth_user_id || null,
    });
    setSaving(false);

    if (error) { toast.error('Failed to add blackout'); return; }
    toast.success('Blackout period added');
    queryClient.invalidateQueries({ queryKey: ['admin-blackouts', venueId] });
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>Add Blackout</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Start Date *</label>
            <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setErrors(p => ({ ...p, startDate: '' })); }} />
            {errors.startDate && <p className="text-xs text-destructive mt-1">{errors.startDate}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">End Date *</label>
            <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setErrors(p => ({ ...p, endDate: '' })); }} />
            {errors.endDate && <p className="text-xs text-destructive mt-1">{errors.endDate}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Site</label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)} className="w-full h-10 border border-border rounded-md px-3 text-sm bg-card">
              <option value="all">All Sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Reason</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Maintenance, Private event" />
          </div>
          <Button className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold mt-4" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Blackout'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
