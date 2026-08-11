import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, Plus, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { isRsvpOpen, rsvpDeadline } from '@/utils/eventOccurrences';
import { toast } from 'sonner';

export interface MyRsvp {
  id: string;
  event_id: string;
  occurrence_date: string;
  status: 'attending' | 'not_attending';
  adults: number;
  children: number;
  note: string | null;
}

interface EventRsvpControlsProps {
  eventId: string;
  occurrenceDate: string;
  rsvpCloseDaysBefore: number | null;
  /** The signed-in member's existing RSVP for this occurrence, if any. */
  myRsvp: MyRsvp | null;
  /** Attending head count across all members, for social proof. */
  attendingHeads?: number;
  /** Compact variant for the dashboard card. */
  compact?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export default function EventRsvpControls({
  eventId,
  occurrenceDate,
  rsvpCloseDaysBefore,
  myRsvp,
  attendingHeads,
  compact,
}: EventRsvpControlsProps) {
  const { member } = usePortalAuth();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<'attending' | 'not_attending' | null>(myRsvp?.status ?? null);
  // A "not attending" row is stored with zero heads, so never seed the stepper
  // from it — an attending party is at least the member themselves.
  const [adults, setAdults] = useState(myRsvp && myRsvp.adults > 0 ? myRsvp.adults : 1);
  const [children, setChildren] = useState(myRsvp?.children ?? 0);
  const [note, setNote] = useState(myRsvp?.note ?? '');

  // Re-sync when the batched RSVP query refreshes (or the card is reused for
  // another occurrence).
  useEffect(() => {
    setStatus(myRsvp?.status ?? null);
    setAdults(myRsvp && myRsvp.adults > 0 ? myRsvp.adults : 1);
    setChildren(myRsvp?.children ?? 0);
    setNote(myRsvp?.note ?? '');
  }, [myRsvp?.id, myRsvp?.status, myRsvp?.adults, myRsvp?.children, myRsvp?.note, eventId, occurrenceDate]);

  const open = isRsvpOpen({ occurrence_date: occurrenceDate, rsvp_close_days_before: rsvpCloseDaysBefore }, todayISO());

  const save = useMutation({
    mutationFn: async (next: { status: 'attending' | 'not_attending'; adults: number; children: number; note: string }) => {
      if (!member) throw new Error('Not signed in');
      const { error } = await supabase.from('event_rsvps').upsert(
        {
          venue_id: member.venue_id,
          event_id: eventId,
          occurrence_date: occurrenceDate,
          member_id: member.id,
          status: next.status,
          adults: next.status === 'attending' ? next.adults : 0,
          children: next.status === 'attending' ? next.children : 0,
          note: next.note.trim() || null,
        },
        { onConflict: 'event_id,occurrence_date,member_id' },
      );
      if (error) throw error;
    },
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: ['portal-event-rsvps'] });
      toast.success(next.status === 'attending' ? 'RSVP saved — see you there' : 'Thanks for letting us know');
    },
    onError: () => toast.error('Could not save your RSVP'),
  });

  const dirty =
    status !== null &&
    (status !== myRsvp?.status ||
      (status === 'attending' &&
        (adults !== myRsvp?.adults || children !== myRsvp?.children || note.trim() !== (myRsvp?.note ?? ''))));

  const pickStatus = (next: 'attending' | 'not_attending') => {
    setStatus(next);
    if (next === 'attending' && adults < 1) setAdults(1);
    // "Can't make it" has nothing else to fill in — commit it straight away.
    if (next === 'not_attending') {
      save.mutate({ status: next, adults: 0, children: 0, note });
    }
  };

  const wrap: React.CSSProperties = {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--portal-card-border)',
  };

  if (!open) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: 0 }}>
          {myRsvp?.status === 'attending'
            ? `RSVPs are closed — you're down for ${describeParty(myRsvp.adults, myRsvp.children)}.`
            : myRsvp?.status === 'not_attending'
              ? "RSVPs are closed — you told us you can't make it."
              : 'RSVPs for this event have closed.'}
        </p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text-primary)', margin: 0 }}>
          RSVP required
        </p>
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: 0 }}>
          {rsvpCloseDaysBefore
            ? `Respond by ${formatDate(rsvpDeadline(occurrenceDate, rsvpCloseDaysBefore))}`
            : 'Respond by the day of the event'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <ChoiceButton
          active={status === 'attending'}
          onClick={() => pickStatus('attending')}
          icon={<Check size={14} />}
          label="I'm coming"
        />
        <ChoiceButton
          active={status === 'not_attending'}
          onClick={() => pickStatus('not_attending')}
          icon={<X size={14} />}
          label="Can't make it"
        />
      </div>

      {status === 'attending' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Stepper label="Adults" value={adults} min={1} onChange={setAdults} />
            <Stepper label="Children" value={children} min={0} onChange={setChildren} />
          </div>

          {!compact && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know? (dietary, allergies…)"
              maxLength={200}
              style={{
                width: '100%', marginTop: 12, padding: '8px 10px', fontSize: 14,
                border: '1px solid var(--portal-card-border)', borderRadius: 8,
                background: 'var(--portal-card-bg)', color: 'var(--portal-text-primary)',
              }}
            />
          )}

          <button
            onClick={() => save.mutate({ status: 'attending', adults, children, note })}
            disabled={save.isPending || !dirty}
            style={{
              marginTop: 12, width: '100%', height: 40, borderRadius: 8, border: 'none',
              background: dirty ? 'var(--portal-accent)' : 'var(--portal-page-bg)',
              color: dirty ? '#FFFFFF' : 'var(--portal-text-muted)',
              fontSize: 14, fontWeight: 600, cursor: dirty ? 'pointer' : 'default',
            }}
          >
            {save.isPending
              ? 'Saving…'
              : dirty
                ? myRsvp
                  ? 'Update RSVP'
                  : 'Confirm RSVP'
                : `You're going — ${describeParty(adults, children)}`}
          </button>
        </div>
      )}

      {status === 'not_attending' && !save.isPending && (
        <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '10px 0 0' }}>
          Noted — you're marked as not attending. Change your mind any time before the cut-off.
        </p>
      )}

      {!!attendingHeads && attendingHeads > 0 && (
        <p style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--portal-text-muted)', margin: '10px 0 0',
        }}>
          <Users size={13} /> {attendingHeads} {attendingHeads === 1 ? 'person is' : 'people are'} going
        </p>
      )}
    </div>
  );
}

function describeParty(adults: number, children: number) {
  const a = `${adults} adult${adults === 1 ? '' : 's'}`;
  return children > 0 ? `${a}, ${children} child${children === 1 ? '' : 'ren'}` : a;
}

function ChoiceButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, height: 40, borderRadius: 8, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 14, fontWeight: 600,
        border: `1px solid ${active ? 'var(--portal-accent)' : 'var(--portal-card-border)'}`,
        background: active ? 'var(--portal-accent)' : 'var(--portal-card-bg)',
        color: active ? '#FFFFFF' : 'var(--portal-text-secondary)',
      }}
    >
      {icon} {label}
    </button>
  );
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  const btn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--portal-card-border)', background: 'var(--portal-card-bg)',
    color: 'var(--portal-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '0 0 4px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={btn} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label}`}>
          <Minus size={14} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)', minWidth: 20, textAlign: 'center' }}>
          {value}
        </span>
        <button style={btn} onClick={() => onChange(Math.min(50, value + 1))} aria-label={`More ${label}`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
