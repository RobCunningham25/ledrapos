import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import EventDrawer from '@/components/admin/EventDrawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { expandAllOccurrences, type EventSeries, type MonthlyMode, type Recurrence } from '@/utils/eventOccurrences';

export interface ClubEvent {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  recurrence: Recurrence;
  recurrence_end_date: string | null;
  monthly_mode: MonthlyMode;
  created_by: string | null;
  created_at: string | null;
}

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(start: string | null, end: string | null) {
  if (!start) return null;
  const s = start.slice(0, 5);
  if (!end) return s;
  return `${s} – ${end.slice(0, 5)}`;
}

function isPast(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function addMonthsISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DeleteTarget {
  event: ClubEvent;
  occurrence_date: string;
}

export default function Events() {
  const { venueId } = useVenue();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const rangeStart = useMemo(() => addMonthsISO(todayISO(), -6), []);
  const rangeEnd = useMemo(() => addMonthsISO(todayISO(), 12), []);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['club-events', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club_events')
        .select('*')
        .eq('venue_id', venueId)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as ClubEvent[];
    },
    enabled: !!venueId,
  });

  const { data: exceptions = [] } = useQuery({
    queryKey: ['event-exceptions', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_exceptions')
        .select('event_id, occurrence_date')
        .eq('venue_id', venueId);
      if (error) throw error;
      return data as { event_id: string; occurrence_date: string }[];
    },
    enabled: !!venueId,
  });

  const occurrences = useMemo(() => {
    const eventsById = new Map(events.map((e) => [e.id, e]));
    const series: EventSeries[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      recurrence: e.recurrence ?? 'none',
      recurrence_end_date: e.recurrence_end_date,
      monthly_mode: (e.monthly_mode ?? 'day_of_month') as MonthlyMode,
    }));
    return expandAllOccurrences(series, rangeStart, rangeEnd, exceptions).map((o) => ({
      occ: o,
      event: eventsById.get(o.event_id)!,
    }));
  }, [events, exceptions, rangeStart, rangeEnd]);

  const deleteSeriesMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('club_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-events', venueId] });
      queryClient.invalidateQueries({ queryKey: ['event-exceptions', venueId] });
      toast.success('Event deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete event'),
  });

  const cancelOccurrenceMutation = useMutation({
    mutationFn: async (params: { event_id: string; occurrence_date: string }) => {
      const { error } = await supabase.from('event_exceptions').insert({
        event_id: params.event_id,
        occurrence_date: params.occurrence_date,
        venue_id: venueId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-exceptions', venueId] });
      toast.success('Occurrence cancelled');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to cancel occurrence'),
  });

  const handleAdd = () => {
    setEditingEvent(null);
    setDrawerOpen(true);
  };

  const handleEdit = (ev: ClubEvent) => {
    setEditingEvent(ev);
    setDrawerOpen(true);
  };

  const isRecurringTarget = deleteTarget?.event.recurrence && deleteTarget.event.recurrence !== 'none';

  return (
    <AdminLayout
      title="Events"
      action={
        <Button
          onClick={handleAdd}
          style={{ background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6, height: 40, padding: '0 16px' }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Event
        </Button>
      }
    >
      {isLoading ? (
        <p style={{ color: '#718096' }}>Loading events…</p>
      ) : occurrences.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <p style={{ fontSize: 16, color: '#718096', marginBottom: 16 }}>No events yet</p>
          <Button
            onClick={handleAdd}
            style={{ background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6, height: 40, padding: '0 16px' }}
          >
            Create your first event
          </Button>
        </div>
      ) : (
        <div>
          {occurrences.map(({ occ, event }) => (
            <div
              key={`${occ.event_id}:${occ.occurrence_date}`}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                padding: 16,
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                opacity: isPast(occ.occurrence_date) ? 0.5 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', margin: 0 }}>{occ.title}</p>
                  {occ.is_recurring && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: '#E6F2FA', color: '#2E5FA3', fontSize: 11, fontWeight: 600,
                      borderRadius: 999, padding: '2px 8px',
                    }}>
                      <Repeat size={11} /> {occ.recurrence === 'weekly' ? 'Weekly' : 'Monthly'}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: '#718096', margin: '4px 0 0' }}>{formatEventDate(occ.occurrence_date)}</p>
                {formatTime(occ.start_time, occ.end_time) && (
                  <p style={{ fontSize: 14, color: '#718096', margin: '2px 0 0' }}>{formatTime(occ.start_time, occ.end_time)}</p>
                )}
                {occ.location && (
                  <p style={{ fontSize: 14, color: '#718096', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} /> {occ.location}
                  </p>
                )}
                {occ.description && (
                  <p style={{
                    fontSize: 14, color: '#718096', marginTop: 8, margin: '8px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {occ.description}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => handleEdit(event)}
                  style={{
                    border: '1px solid #E2E8F0', borderRadius: 6, height: 36, padding: '0 12px',
                    background: 'transparent', color: '#1A202C', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget({ event, occurrence_date: occ.occurrence_date })}
                  style={{
                    border: '1px solid #E2E8F0', borderRadius: 6, height: 36, padding: '0 12px',
                    background: 'transparent', color: '#C0392B', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EventDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        event={editingEvent}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRecurringTarget ? 'Remove recurring event' : 'Delete Event'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRecurringTarget
                ? `"${deleteTarget?.event.title}" repeats ${deleteTarget?.event.recurrence}. Cancel only the ${deleteTarget && formatEventDate(deleteTarget.occurrence_date)} occurrence, or delete the entire series?`
                : `Are you sure you want to delete "${deleteTarget?.event.title}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {isRecurringTarget && deleteTarget && (
              <AlertDialogAction
                onClick={() =>
                  cancelOccurrenceMutation.mutate({
                    event_id: deleteTarget.event.id,
                    occurrence_date: deleteTarget.occurrence_date,
                  })
                }
                style={{ background: '#2E5FA3', color: '#FFFFFF' }}
              >
                Cancel this occurrence
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => deleteTarget && deleteSeriesMutation.mutate(deleteTarget.event.id)}
              style={{ background: '#C0392B', color: '#FFFFFF' }}
            >
              {isRecurringTarget ? 'Delete entire series' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
