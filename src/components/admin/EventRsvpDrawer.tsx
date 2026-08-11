import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Download, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { rsvpDeadline } from '@/utils/eventOccurrences';

export interface RsvpTarget {
  event_id: string;
  occurrence_date: string;
  title: string;
  rsvp_close_days_before: number | null;
}

interface EventRsvpDrawerProps {
  open: boolean;
  onClose: () => void;
  target: RsvpTarget | null;
}

interface RsvpRow {
  id: string;
  status: 'attending' | 'not_attending';
  adults: number;
  children: number;
  note: string | null;
  updated_at: string;
  member: {
    first_name: string;
    last_name: string;
    membership_number: string;
    email: string | null;
    phone: string | null;
  } | null;
}

function formatEventDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function memberName(r: RsvpRow) {
  return r.member ? `${r.member.first_name} ${r.member.last_name}`.trim() : 'Unknown member';
}

function downloadCsv(filename: string, rows: RsvpRow[]) {
  const headers = ['Member', 'Membership no', 'Email', 'Phone', 'Response', 'Adults', 'Children', 'Total', 'Note'];
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      memberName(r),
      r.member?.membership_number ?? '',
      r.member?.email ?? '',
      r.member?.phone ?? '',
      r.status === 'attending' ? 'Attending' : 'Not attending',
      r.status === 'attending' ? r.adults : 0,
      r.status === 'attending' ? r.children : 0,
      r.status === 'attending' ? r.adults + r.children : 0,
      r.note ?? '',
    ].map(esc).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function EventRsvpDrawer({ open, onClose, target }: EventRsvpDrawerProps) {
  const { venueId } = useVenue();

  const { data: rsvps = [], isLoading } = useQuery({
    queryKey: ['event-rsvps', venueId, target?.event_id, target?.occurrence_date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_rsvps')
        .select('id, status, adults, children, note, updated_at, member:members(first_name, last_name, membership_number, email, phone)')
        .eq('venue_id', venueId)
        .eq('event_id', target!.event_id)
        .eq('occurrence_date', target!.occurrence_date);
      if (error) throw error;
      return (data ?? []) as unknown as RsvpRow[];
    },
    enabled: open && !!venueId && !!target,
  });

  const { attending, declined, totals } = useMemo(() => {
    const byName = (a: RsvpRow, b: RsvpRow) => memberName(a).localeCompare(memberName(b));
    const yes = rsvps.filter((r) => r.status === 'attending').sort(byName);
    const no = rsvps.filter((r) => r.status === 'not_attending').sort(byName);
    return {
      attending: yes,
      declined: no,
      totals: {
        adults: yes.reduce((s, r) => s + r.adults, 0),
        children: yes.reduce((s, r) => s + r.children, 0),
      },
    };
  }, [rsvps]);

  if (!open || !target) return null;

  const deadline = rsvpDeadline(target.occurrence_date, target.rsvp_close_days_before);
  const deadlinePassed = deadline < new Date().toISOString().slice(0, 10);

  const statTile = (label: string, value: number | string) => (
    <div style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: '#1A202C', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 12, color: '#718096', margin: '2px 0 0' }}>{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="absolute right-0 top-0 h-full bg-white shadow-lg flex flex-col"
        style={{ width: '100%', maxWidth: 520 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A202C', margin: 0 }}>RSVPs</h2>
            <p style={{ fontSize: 13, color: '#718096', margin: '2px 0 0' }}>
              {target.title} — {formatEventDate(target.occurrence_date)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {statTile('Adults', totals.adults)}
            {statTile('Children', totals.children)}
            {statTile('Total heads', totals.adults + totals.children)}
            {statTile('Responses', rsvps.length)}
          </div>

          <p style={{ fontSize: 12, color: '#718096', margin: '10px 0 0' }}>
            {target.rsvp_close_days_before
              ? `RSVPs ${deadlinePassed ? 'closed' : 'close'} on ${formatEventDate(deadline)}.`
              : `RSVPs ${deadlinePassed ? 'closed after' : 'stay open until'} the day of the event.`}
          </p>

          {isLoading ? (
            <p style={{ color: '#718096', marginTop: 20 }}>Loading RSVPs…</p>
          ) : rsvps.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#718096' }}>
              <Users size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p style={{ fontSize: 14, margin: 0 }}>No responses yet</p>
            </div>
          ) : (
            <>
              <Section title={`Attending (${attending.length})`} rows={attending} showCounts />
              {declined.length > 0 && <Section title={`Not attending (${declined.length})`} rows={declined} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 20, borderTop: '1px solid #E2E8F0' }}>
          <Button
            onClick={() => downloadCsv(`rsvps-${target.occurrence_date}.csv`, [...attending, ...declined])}
            disabled={rsvps.length === 0}
            style={{ width: '100%', height: 44, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6 }}
          >
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows, showCounts }: { title: string; rows: RsvpRow[]; showCounts?: boolean }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' }}>
        {title}
      </h3>
      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', margin: 0 }}>{memberName(r)}</p>
            <p style={{ fontSize: 12, color: '#718096', margin: '2px 0 0' }}>
              {r.member?.membership_number}
              {r.member?.phone ? ` · ${r.member.phone}` : ''}
            </p>
            {r.note && (
              <p style={{ fontSize: 13, color: '#4A5568', margin: '6px 0 0', fontStyle: 'italic' }}>“{r.note}”</p>
            )}
          </div>
          {showCounts && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1A202C', margin: 0 }}>{r.adults + r.children}</p>
              <p style={{ fontSize: 11, color: '#718096', margin: 0, whiteSpace: 'nowrap' }}>
                {r.adults} adult{r.adults === 1 ? '' : 's'}
                {r.children > 0 ? `, ${r.children} child${r.children === 1 ? '' : 'ren'}` : ''}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
