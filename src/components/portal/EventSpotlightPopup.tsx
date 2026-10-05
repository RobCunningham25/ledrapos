import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChefHat, Check, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Stepper, describeParty } from '@/components/portal/EventRsvpControls';

/**
 * Pop-up shown when a member opens the portal, promoting one club event.
 * Retire it by deleting the SPOTLIGHT entry (or letting the date pass).
 */
const SPOTLIGHT = {
  eventId: '3a69fa08-78b5-4dd0-9a3a-a31181297b9b',
  occurrenceDate: '2026-10-31',
  heading: 'Halloween Potjie Festival',
  blurb: 'Potjie competition and Halloween dress-up at the club. Come cook, come eat, or both.',
};

type View = 'intro' | 'eat' | 'register' | 'done';

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function readSession(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSession(key: string) {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // Storage blocked — the pop-up just reappears next time the portal loads
  }
}

export default function EventSpotlightPopup() {
  const { member } = usePortalAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // ?spotlight=1 forces the pop-up open (for previewing), even after responding or closing.
  const [searchParams] = useSearchParams();
  const forced = searchParams.get('spotlight') === '1';
  const { portalPath } = useVenueNav();

  const memberId = member?.id;
  const venueId = member?.venue_id;
  const sessionKey = `portal_spotlight_${SPOTLIGHT.eventId}`;

  const [closed, setClosed] = useState(() => !forced && readSession(sessionKey));
  const [view, setView] = useState<View>('intro');
  const [doneMessage, setDoneMessage] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [note, setNote] = useState('');
  const [entryName, setEntryName] = useState('');
  const [entryNote, setEntryNote] = useState('');

  const active = todayISO() <= SPOTLIGHT.occurrenceDate;

  // Has this member already responded? Then there's nothing to nag about.
  const { data: responded } = useQuery({
    queryKey: ['portal-spotlight', SPOTLIGHT.eventId, venueId, memberId],
    enabled: active && !closed && !forced && !!venueId && !!memberId,
    queryFn: async () => {
      const [rsvp, entry] = await Promise.all([
        supabase.from('event_rsvps').select('id')
          .eq('venue_id', venueId!).eq('event_id', SPOTLIGHT.eventId)
          .eq('occurrence_date', SPOTLIGHT.occurrenceDate).eq('member_id', memberId!).maybeSingle(),
        supabase.from('event_participants').select('id')
          .eq('venue_id', venueId!).eq('event_id', SPOTLIGHT.eventId)
          .eq('occurrence_date', SPOTLIGHT.occurrenceDate).eq('member_id', memberId!).maybeSingle(),
      ]);
      if (rsvp.error) throw rsvp.error;
      if (entry.error) throw entry.error;
      return !!rsvp.data || !!entry.data;
    },
  });

  const base = () => ({
    venue_id: venueId!,
    event_id: SPOTLIGHT.eventId,
    occurrence_date: SPOTLIGHT.occurrenceDate,
    member_id: memberId!,
  });

  const rsvp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('event_rsvps').upsert(
        { ...base(), status: 'attending', adults, children, note: note.trim() || null },
        { onConflict: 'event_id,occurrence_date,member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-event-rsvps'] });
      setDoneMessage(`You're down as eating: ${describeParty(adults, children)}. See you on the 31st!`);
      setView('done');
    },
    onError: () => toast.error('Could not save your RSVP'),
  });

  const register = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('event_participants').upsert(
        { ...base(), entry_name: entryName.trim() || null, note: entryNote.trim() || null },
        { onConflict: 'event_id,occurrence_date,member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setDoneMessage("You're registered for the potjie competition. Good luck!");
      setView('done');
    },
    onError: () => toast.error('Could not save your registration'),
  });

  const close = () => {
    writeSession(sessionKey);
    setClosed(true);
  };

  if (!active || !member) return null;
  if (closed || (!forced && responded !== false)) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 8,
    border: '1px solid var(--portal-card-border)',
    background: 'var(--portal-card-bg)', color: 'var(--portal-text-primary)',
  };
  const primaryBtn: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--portal-accent)', color: '#FFFFFF', fontSize: 15, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
  const outlineBtn: React.CSSProperties = {
    ...primaryBtn, background: 'var(--portal-card-bg)', color: 'var(--portal-primary)',
    border: '1px solid var(--portal-primary)',
  };
  const textBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    color: 'var(--portal-text-muted)', padding: 8,
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        className="max-w-[420px]"
        style={{ background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)' }}
      >
        {view === 'intro' ? (
          <>
            <DialogTitle className="sr-only">{SPOTLIGHT.heading}</DialogTitle>
            <DialogDescription className="sr-only">{SPOTLIGHT.blurb}</DialogDescription>
            <img
              src="/halloween-potjie.png"
              alt={`${SPOTLIGHT.heading}, 31 October 2026`}
              style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 8, background: '#0D0C0B' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <button style={primaryBtn} onClick={() => setView('register')}>
                <ChefHat size={18} /> Register to participate
              </button>
              <button style={outlineBtn} onClick={() => setView('eat')}>
                <Utensils size={18} /> I'm coming &amp; eating
              </button>
              <button style={textBtn} onClick={() => { close(); navigate(portalPath('calendar')); }}>
                See it on the calendar
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--portal-accent)', fontSize: 13, fontWeight: 600 }}>
              <CalendarDays size={16} /> Saturday 31 October
            </div>
            <DialogTitle style={{ fontSize: 22, color: 'var(--portal-text-primary)' }}>{SPOTLIGHT.heading}</DialogTitle>
          </>
        )}

        {view === 'eat' && (
          <>
            <DialogDescription style={{ color: 'var(--portal-text-secondary)', fontSize: 14 }}>
              How many will be eating?
            </DialogDescription>
            <div style={{ display: 'flex', gap: 24 }}>
              <Stepper label="Adults" value={adults} min={1} onChange={setAdults} />
              <Stepper label="Children" value={children} min={0} onChange={setChildren} />
            </div>
            <input
              style={inputStyle}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know? (dietary, allergies…)"
              maxLength={200}
            />
            <button style={primaryBtn} disabled={rsvp.isPending} onClick={() => rsvp.mutate()}>
              {rsvp.isPending ? 'Saving…' : 'Confirm RSVP'}
            </button>
            <button style={textBtn} onClick={() => setView('intro')}>Back</button>
          </>
        )}

        {view === 'register' && (
          <>
            <DialogDescription style={{ color: 'var(--portal-text-secondary)', fontSize: 14 }}>
              Enter the potjie competition.
            </DialogDescription>
            <input
              style={inputStyle}
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder="Potjie or team name (optional)"
              maxLength={80}
            />
            <input
              style={inputStyle}
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              placeholder="Anything the organisers should know?"
              maxLength={200}
            />
            <button style={primaryBtn} disabled={register.isPending} onClick={() => register.mutate()}>
              {register.isPending ? 'Saving…' : 'Register'}
            </button>
            <button style={textBtn} onClick={() => setView('intro')}>Back</button>
          </>
        )}

        {view === 'done' && (
          <>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--portal-text-primary)', margin: 0 }}>
              <Check size={18} color="var(--portal-accent)" /> {doneMessage}
            </p>
            <button style={primaryBtn} onClick={close}>Done</button>
          </>
        )}

        {view !== 'done' && (
          <button style={{ ...textBtn, alignSelf: 'center' }} onClick={close}>Close</button>
        )}
      </DialogContent>
    </Dialog>
  );
}
