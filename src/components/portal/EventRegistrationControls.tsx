import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/contexts/PortalAuthContext';

export interface MyEntry {
  id: string;
  event_id: string;
  occurrence_date: string;
  entry_name: string | null;
  note: string | null;
}

interface Props {
  eventId: string;
  occurrenceDate: string;
  /** The signed-in member's existing entry for this occurrence, if any. */
  myEntry: MyEntry | null;
}

/** "Register to enter" controls for events that take competition entries. */
export default function EventRegistrationControls({ eventId, occurrenceDate, myEntry }: Props) {
  const { member } = usePortalAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [entryName, setEntryName] = useState(myEntry?.entry_name ?? '');
  const [note, setNote] = useState(myEntry?.note ?? '');

  useEffect(() => {
    setEntryName(myEntry?.entry_name ?? '');
    setNote(myEntry?.note ?? '');
  }, [myEntry?.id, myEntry?.entry_name, myEntry?.note]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['portal-event-entries'] });
    queryClient.invalidateQueries({ queryKey: ['portal-spotlight'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!member) throw new Error('Not signed in');
      const { error } = await supabase.from('event_participants').upsert(
        {
          venue_id: member.venue_id,
          event_id: eventId,
          occurrence_date: occurrenceDate,
          member_id: member.id,
          entry_name: entryName.trim() || null,
          note: note.trim() || null,
        },
        { onConflict: 'event_id,occurrence_date,member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success(myEntry ? 'Entry updated' : "You're registered — good luck!");
    },
    onError: () => toast.error('Could not save your registration'),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      if (!myEntry) return;
      const { error } = await supabase.from('event_participants').delete().eq('id', myEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success('Entry withdrawn');
    },
    onError: () => toast.error('Could not withdraw your entry'),
  });

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 8,
    border: '1px solid var(--portal-card-border)',
    background: 'var(--portal-card-bg)', color: 'var(--portal-text-primary)',
  };
  const wrap: React.CSSProperties = {
    marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--portal-card-border)',
  };

  if (myEntry && !editing) {
    return (
      <div style={wrap}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--portal-text-primary)', margin: 0 }}>
          <ChefHat size={14} /> You're entered{myEntry.entry_name ? ` as "${myEntry.entry_name}"` : ''}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button onClick={() => setEditing(true)} style={linkBtn}>Edit entry</button>
          <button onClick={() => withdraw.mutate()} disabled={withdraw.isPending} style={linkBtn}>
            {withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      </div>
    );
  }

  if (!editing) {
    return (
      <div style={wrap}>
        <button
          onClick={() => setEditing(true)}
          style={{
            width: '100%', height: 40, borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--portal-accent)', background: 'var(--portal-card-bg)',
            color: 'var(--portal-accent)', fontSize: 14, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <ChefHat size={16} /> Register to enter
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text-primary)', margin: '0 0 10px' }}>Register to enter</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={input} value={entryName} onChange={(e) => setEntryName(e.target.value)}
          placeholder="Potjie or team name (optional)" maxLength={80} />
        <input style={input} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Anything the organisers should know?" maxLength={200} />
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{
            height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--portal-accent)', color: '#FFFFFF', fontSize: 14, fontWeight: 600,
          }}
        >
          {save.isPending ? 'Saving…' : myEntry ? 'Update entry' : 'Register'}
        </button>
        <button onClick={() => setEditing(false)} style={linkBtn}>Cancel</button>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  fontSize: 13, fontWeight: 500, color: 'var(--portal-accent)',
};
