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
import {
  classifyWhatsAppMessage,
  fetchWhatsAppContactState,
  fetchWhatsAppMessages,
  formatWhatsAppTimestamp,
  isWithinSessionWindow,
  sendWhatsAppAdminReply,
  setWhatsAppTakeover,
  whatsAppSessionWindowErrorMessage,
  WHATSAPP_LANE_STYLES,
  type WhatsAppContactRef,
  type WhatsAppContactState,
  type WhatsAppMessageRow,
} from '@/lib/whatsappConversation';

interface FollowupRow {
  id: string;
  member_id: string | null;
  prospect_id: string | null;
  summary: string;
  original_message: string;
  urgency: 'normal' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved';
  reason: string;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  member?: { first_name: string | null; last_name: string | null; membership_number: string | null } | null;
  prospect?: { display_name: string | null; whatsapp_number: string | null } | null;
}

const REASON_LABELS: Record<string, string> = {
  escalation: 'Escalation',
  knowledge_gap: "Couldn't answer",
  new_prospect: 'New enquiry',
};

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

  const [contactState, setContactState] = useState<WhatsAppContactState | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [togglingTakeover, setTogglingTakeover] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_followups')
      .select(`
        id, member_id, prospect_id, summary, original_message, urgency, status, reason, notes,
        created_at, resolved_at,
        member:members(first_name, last_name, membership_number),
        prospect:whatsapp_prospects(display_name, whatsapp_number)
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
  const selectedContact: WhatsAppContactRef | null = selected
    ? selected.prospect_id
      ? { type: 'prospect', id: selected.prospect_id }
      : selected.member_id
        ? { type: 'member', id: selected.member_id }
        : null
    : null;

  useEffect(() => {
    setNotesDraft(selected?.notes ?? '');
  }, [selectedId, selected?.notes]);

  useEffect(() => {
    if (!selectedContact) {
      setContactState(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setReplyText('');
    setMessagesLoading(true);
    Promise.all([
      fetchWhatsAppContactState(selectedContact),
      fetchWhatsAppMessages(venueId, selectedContact),
    ]).then(([state, msgs]) => {
      if (cancelled) return;
      setContactState(state);
      setMessages(msgs);
      setMessagesLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContact?.type, selectedContact?.id, venueId]);

  const reloadMessages = async () => {
    if (!selectedContact) return;
    setMessages(await fetchWhatsAppMessages(venueId, selectedContact));
  };

  const toggleTakeover = async () => {
    if (!selectedContact || !contactState) return;
    setTogglingTakeover(true);
    const nextPaused = !contactState.aiPaused;
    const { error } = await setWhatsAppTakeover(selectedContact, nextPaused);
    setTogglingTakeover(false);
    if (error) {
      toast.error('Failed to update: ' + error);
      return;
    }
    setContactState({ ...contactState, aiPaused: nextPaused });
    toast.success(nextPaused ? 'Took over — the AI will stay quiet on this conversation.' : 'Handed back to the AI assistant.');
  };

  const sendReply = async () => {
    if (!selectedContact || !contactState?.e164 || !replyText.trim()) return;
    setSendingReply(true);
    const res = await sendWhatsAppAdminReply({
      venueId,
      contact: selectedContact,
      toE164: contactState.e164,
      body: replyText.trim(),
    });
    setSendingReply(false);
    if (!res.ok && res.error) {
      toast.error(whatsAppSessionWindowErrorMessage(res.error));
      return;
    }
    setReplyText('');
    reloadMessages();
  };

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
    if (r.prospect_id) {
      const label = r.prospect?.display_name || 'Prospective member';
      return r.prospect?.whatsapp_number ? `${label} (${r.prospect.whatsapp_number})` : label;
    }
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">From</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Summary</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Urgency</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && [1, 2, 3].map(i => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3" colSpan={6}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    No follow-ups in {statusFilter.replace('_', ' ')}.
                  </td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-4 py-3">{memberName(r)}</td>
                  <td className="px-4 py-3 max-w-md truncate">{r.summary}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{REASON_LABELS[r.reason] ?? r.reason}</td>
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
            <aside className="absolute right-0 top-0 h-full w-full max-w-2xl bg-card shadow-lg overflow-y-auto">
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Status</p>
                  <p className="mt-1 text-sm">{selected.status} · {selected.urgency} · {REASON_LABELS[selected.reason] ?? selected.reason}</p>
                </div>

                {/* === Conversation: view the thread, take over, and reply === */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Conversation</p>
                  <div className="border border-border rounded-md flex flex-col max-h-[420px]">
                    <div className="p-3 overflow-y-auto flex-1 space-y-2">
                      {messagesLoading && (
                        <p className="text-xs text-muted-foreground">Loading messages…</p>
                      )}
                      {!messagesLoading && messages.length === 0 && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selected.original_message}</p>
                      )}
                      {messages.map((m) => {
                        const c = classifyWhatsAppMessage(m, selectedContact?.type === 'prospect' ? 'Prospect' : 'Member');
                        return (
                          <div
                            key={m.id}
                            className={`rounded-md border px-3 py-2 text-sm ${WHATSAPP_LANE_STYLES[c.lane]}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-semibold uppercase tracking-wide">{c.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatWhatsAppTimestamp(m.created_at)}
                                {m.status && m.status !== 'delivered' ? ` · ${m.status}` : ''}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap break-words">
                              {m.body || (m.template_sid ? `[template ${m.template_sid}]` : '[no body]')}
                            </div>
                            {m.error && (
                              <div className="text-xs text-red-700 mt-1">Error: {m.error}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {contactState && (
                      <div className="border-t border-border p-3 space-y-2 bg-muted/20">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {isWithinSessionWindow(contactState.lastInboundAt)
                              ? '24h window open — you can reply directly.'
                              : "24h window closed — reply won't send until they message again."}
                          </p>
                          <Button
                            size="sm"
                            variant={contactState.aiPaused ? 'default' : 'outline'}
                            onClick={toggleTakeover}
                            disabled={togglingTakeover}
                          >
                            {togglingTakeover
                              ? 'Saving…'
                              : contactState.aiPaused
                                ? 'Hand back to bot'
                                : 'Take over conversation'}
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            rows={2}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={
                              contactState.e164 ? 'Type a reply…' : 'No phone number on file for this contact.'
                            }
                            disabled={!isWithinSessionWindow(contactState.lastInboundAt) || !contactState.e164}
                            className="text-sm"
                          />
                          <Button
                            onClick={sendReply}
                            disabled={sendingReply || !replyText.trim() || !isWithinSessionWindow(contactState.lastInboundAt) || !contactState.e164}
                          >
                            {sendingReply ? 'Sending…' : 'Send'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Notes</p>
                  <Textarea
                    rows={4}
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
