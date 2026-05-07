import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface FollowupRow {
  id: string;
  member_id: string | null;
  summary: string;
  original_message: string;
  urgency: 'normal' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved';
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  member?: { first_name: string | null; last_name: string | null; membership_number: string | null } | null;
}

const STATUS_FILTERS = ['open', 'in_progress', 'resolved'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function WhatsAppFollowups() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_followups')
      .select(`
        id, member_id, summary, original_message, urgency, status, notes,
        created_at, resolved_at,
        member:members(first_name, last_name, membership_number)
      `)
      .eq('venue_id', venueId)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false });
    if (!error) setRows((data ?? []) as unknown as FollowupRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, statusFilter]);

  const selected = rows.find(r => r.id === selectedId) ?? null;

  useEffect(() => {
    setNotesDraft(selected?.notes ?? '');
  }, [selectedId, selected?.notes]);

  const updateStatus = async (newStatus: FollowupRow['status']) => {
    if (!selected) return;
    setSaving(true);
    const update: Record<string, unknown> = {
      status: newStatus,
      notes: notesDraft || null,
    };
    if (newStatus === 'resolved') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = adminUser?.id ?? null;
    }
    const { error } = await supabase
      .from('whatsapp_followups')
      .update(update)
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to update follow-up: ' + error.message);
    } else {
      toast.success('Follow-up updated.');
      setSelectedId(null);
      fetchRows();
    }
  };

  const memberName = (r: FollowupRow) => {
    if (!r.member) return r.member_id ? 'Unknown member' : 'No member';
    const name = [r.member.first_name, r.member.last_name].filter(Boolean).join(' ') || 'Unnamed';
    return r.member.membership_number ? `${name} (#${r.member.membership_number})` : name;
  };

  return (
    <AdminLayout title="WhatsApp Follow-ups">
      <div className="space-y-4">
        {/* Status filter */}
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
            >
              {s.replace('_', ' ')}
            </Button>
          ))}
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Summary</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Urgency</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && [1, 2, 3].map(i => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3" colSpan={5}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                    No follow-ups in {statusFilter.replace('_', ' ')}.
                  </td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-4 py-3">{memberName(r)}</td>
                  <td className="px-4 py-3 max-w-md truncate">{r.summary}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2 py-0.5 text-xs font-medium rounded"
                      style={{
                        background: r.urgency === 'urgent' ? '#FEE2E2' : '#E2E8F0',
                        color: r.urgency === 'urgent' ? '#991B1B' : '#475569',
                      }}
                    >
                      {r.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(r.created_at), 'd MMM yyyy, HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(r.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Drawer-ish modal: minimal inline panel for now */}
        {selected && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedId(null)} />
            <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-card shadow-lg overflow-y-auto">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Follow-up</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {memberName(selected)} · {format(new Date(selected.created_at), 'd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Summary</p>
                  <p className="mt-1 text-sm">{selected.summary}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Original message</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap rounded border border-border p-3 bg-muted/20">
                    {selected.original_message}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Status</p>
                  <p className="mt-1 text-sm">{selected.status} · {selected.urgency}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Notes</p>
                  <Textarea
                    rows={5}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Add internal notes about how this was handled…"
                    className="mt-1"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {selected.status === 'open' && (
                    <Button
                      onClick={() => updateStatus('in_progress')}
                      disabled={saving}
                      variant="outline"
                    >
                      Mark in progress
                    </Button>
                  )}
                  {selected.status !== 'resolved' && (
                    <Button onClick={() => updateStatus('resolved')} disabled={saving}>
                      {saving ? 'Saving…' : 'Mark resolved'}
                    </Button>
                  )}
                  {selected.status === 'resolved' && (
                    <Button onClick={() => updateStatus('open')} disabled={saving} variant="outline">
                      Re-open
                    </Button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
