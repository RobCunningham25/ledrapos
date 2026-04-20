import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { nthWeekdayOrdinal } from '@/utils/eventOccurrences';
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

type RecurrenceKind = 'none' | 'weekly' | 'monthly';
type MonthlyModeKind = 'day_of_month' | 'nth_weekday';

interface FormData {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
  recurrence: RecurrenceKind;
  recurrence_end_date: string;
  monthly_mode: MonthlyModeKind;
}

const emptyForm: FormData = {
  title: '',
  event_date: '',
  start_time: '',
  end_time: '',
  location: '',
  description: '',
  recurrence: 'none',
  recurrence_end_date: '',
  monthly_mode: 'day_of_month',
};

const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeMonthlyByDate(dateStr: string): { dayOfMonth: string; nthWeekday: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const day = d.getDate();
  const ordinalIndex = nthWeekdayOrdinal(day) - 1;
  const ordinalWord = ORDINAL_WORDS[ordinalIndex] ?? `${ordinalIndex + 1}th`;
  const weekday = WEEKDAY_NAMES[d.getDay()];
  return {
    dayOfMonth: `On day ${day} of each month`,
    nthWeekday: `On the ${ordinalWord} ${weekday} of each month`,
  };
}

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
        const r = (event.recurrence ?? 'none') as RecurrenceKind;
        const mm = (event.monthly_mode ?? 'day_of_month') as MonthlyModeKind;
        setForm({
          title: event.title,
          event_date: event.event_date,
          start_time: event.start_time?.slice(0, 5) ?? '',
          end_time: event.end_time?.slice(0, 5) ?? '',
          location: event.location ?? '',
          description: event.description ?? '',
          recurrence: r === 'weekly' || r === 'monthly' ? r : 'none',
          recurrence_end_date: event.recurrence_end_date ?? '',
          monthly_mode: mm === 'nth_weekday' ? 'nth_weekday' : 'day_of_month',
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
    if (form.recurrence !== 'none' && form.recurrence_end_date && form.event_date && form.recurrence_end_date < form.event_date)
      e.recurrence_end_date = 'End date must be on or after the event date';
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
      recurrence: form.recurrence,
      recurrence_end_date: form.recurrence === 'none' ? null : (form.recurrence_end_date || null),
      monthly_mode: form.recurrence === 'monthly' ? form.monthly_mode : 'day_of_month',
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

  const set = <K extends keyof FormData>(field: K, value: FormData[K]) =>
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

          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Recurring event</Label>
                <p style={{ fontSize: 12, color: '#718096', margin: '2px 0 0' }}>
                  Repeat on the same day each week or month
                </p>
              </div>
              <Switch
                checked={form.recurrence !== 'none'}
                onCheckedChange={(on) => {
                  set('recurrence', on ? 'monthly' : 'none');
                  if (!on) set('recurrence_end_date', '');
                }}
              />
            </div>

            {form.recurrence !== 'none' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Repeats</Label>
                    <Select
                      value={form.recurrence}
                      onValueChange={(v) => set('recurrence', v as RecurrenceKind)}
                    >
                      <SelectTrigger style={{ borderColor: '#E2E8F0', borderRadius: 6, marginTop: 4 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Ends on</Label>
                    <Input
                      type="date"
                      value={form.recurrence_end_date}
                      onChange={(e) => set('recurrence_end_date', e.target.value)}
                      style={{ borderColor: errors.recurrence_end_date ? '#C0392B' : '#E2E8F0', borderRadius: 6, marginTop: 4 }}
                    />
                    {errors.recurrence_end_date && <p style={{ fontSize: 12, color: '#C0392B', marginTop: 2 }}>{errors.recurrence_end_date}</p>}
                  </div>
                </div>

                {form.recurrence === 'monthly' && (() => {
                  const labels = describeMonthlyByDate(form.event_date);
                  if (!labels) {
                    return (
                      <p style={{ fontSize: 12, color: '#718096', marginTop: 8 }}>
                        Set an event date above to choose a monthly pattern.
                      </p>
                    );
                  }
                  return (
                    <div style={{ marginTop: 12 }}>
                      <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Monthly pattern</Label>
                      <RadioGroup
                        value={form.monthly_mode}
                        onValueChange={(v) => set('monthly_mode', v as MonthlyModeKind)}
                        style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <RadioGroupItem value="day_of_month" id="monthly-mode-dom" />
                          <span style={{ fontSize: 14, color: '#1A202C' }}>{labels.dayOfMonth}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <RadioGroupItem value="nth_weekday" id="monthly-mode-nth" />
                          <span style={{ fontSize: 14, color: '#1A202C' }}>{labels.nthWeekday}</span>
                        </label>
                      </RadioGroup>
                    </div>
                  );
                })()}
              </>
            )}
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
