import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin } from 'lucide-react';
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

export interface ClubEvent {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
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

export default function Events() {
  const { venueId } = useVenue();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClubEvent | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('club_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-events', venueId] });
      toast.success('Event deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete event'),
  });

  const handleAdd = () => {
    setEditingEvent(null);
    setDrawerOpen(true);
  };

  const handleEdit = (ev: ClubEvent) => {
    setEditingEvent(ev);
    setDrawerOpen(true);
  };

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
      ) : events.length === 0 ? (
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
          {events.map((ev) => (
            <div
              key={ev.id}
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
                opacity: isPast(ev.event_date) ? 0.5 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', margin: 0 }}>{ev.title}</p>
                <p style={{ fontSize: 14, color: '#718096', margin: '4px 0 0' }}>{formatEventDate(ev.event_date)}</p>
                {formatTime(ev.start_time, ev.end_time) && (
                  <p style={{ fontSize: 14, color: '#718096', margin: '2px 0 0' }}>{formatTime(ev.start_time, ev.end_time)}</p>
                )}
                {ev.location && (
                  <p style={{ fontSize: 14, color: '#718096', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} /> {ev.location}
                  </p>
                )}
                {ev.description && (
                  <p style={{
                    fontSize: 14, color: '#718096', marginTop: 8, margin: '8px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {ev.description}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => handleEdit(ev)}
                  style={{
                    border: '1px solid #E2E8F0', borderRadius: 6, height: 36, padding: '0 12px',
                    background: 'transparent', color: '#1A202C', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(ev)}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              style={{ background: '#C0392B', color: '#FFFFFF' }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
