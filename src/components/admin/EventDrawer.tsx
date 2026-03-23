import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ClubEvent } from '@/pages/admin/Events';

interface EventDrawerProps {
  open: boolean;
  onClose: () => void;
  event?: ClubEvent | null;
}

interface FormData {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
}

const emptyForm: FormData = {
  title: '',
  event_date: '',
  start_time: '',
  end_time: '',
  location: '',
  description: '',
};

export default function EventDrawer({ open, onClose, event }: EventDrawerProps) {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!event;

  useEffect(() => {
    if (open) {
      if (event) {
        setForm({
          title: event.title,
          event_date: event.event_date,
          start_time: event.start_time?.slice(0, 5) ?? '',
          end_time: event.end_time?.slice(0, 5) ?? '',
          location: event.location ?? '',
          description: event.description ?? '',
        });
      } else {
        setForm(emptyForm);
      }
      setErrors({});
    }
  }, [open, event]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.event_date) e.event_date = 'Date is required';
    if (form.start_time && form.end_time && form.end_time <= form.start_time)
      e.end_time = 'End time must be after start time';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const payload = {
      venue_id: venueId,
      title: form.title.trim(),
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };

    let error;
    if (isEdit && event) {
      ({ error } = await supabase.from('club_events').update(payload).eq('id', event.id));
    } else {
      ({ error } = await supabase.from('club_events').insert({
        ...payload,
        created_by: adminUser?.auth_user_id ?? null,
      }));
    }

    setSaving(false);
    if (error) {
      toast.error('Failed to save event');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['club-events', venueId] });
    toast.success(isEdit ? 'Event updated' : 'Event created');
    onClose();
  };

  const set = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="absolute right-0 top-0 h-full bg-white shadow-lg flex flex-col"
        style={{ width: '100%', maxWidth: 480 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A202C', margin: 0 }}>
            {isEdit ? 'Edit Event' : 'Add Event'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Monthly Braai & Social"
              style={{ borderColor: errors.title ? '#C0392B' : '#E2E8F0', borderRadius: 6, marginTop: 4 }}
            />
            {errors.title && <p style={{ fontSize: 12, color: '#C0392B', marginTop: 2 }}>{errors.title}</p>}
          </div>

          <div>
            <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Event Date *</Label>
            <Input
              type="date"
              value={form.event_date}
              onChange={(e) => set('event_date', e.target.value)}
              style={{ borderColor: errors.event_date ? '#C0392B' : '#E2E8F0', borderRadius: 6, marginTop: 4 }}
            />
            {errors.event_date && <p style={{ fontSize: 12, color: '#C0392B', marginTop: 2 }}>{errors.event_date}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Start Time</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
                style={{ borderColor: '#E2E8F0', borderRadius: 6, marginTop: 4 }}
              />
            </div>
            <div>
              <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>End Time</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
                style={{ borderColor: errors.end_time ? '#C0392B' : '#E2E8F0', borderRadius: 6, marginTop: 4 }}
              />
              {errors.end_time && <p style={{ fontSize: 12, color: '#C0392B', marginTop: 2 }}>{errors.end_time}</p>}
            </div>
          </div>

          <div>
            <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="e.g. Clubhouse Deck"
              style={{ borderColor: '#E2E8F0', borderRadius: 6, marginTop: 4 }}
            />
          </div>

          <div>
            <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Event details, what to bring, etc."
              style={{ borderColor: '#E2E8F0', borderRadius: 6, marginTop: 4 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: 20, borderTop: '1px solid #E2E8F0' }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', height: 44, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6 }}
          >
            {saving ? 'Saving…' : 'Save Event'}
          </Button>
        </div>
      </div>
    </div>
  );
}
