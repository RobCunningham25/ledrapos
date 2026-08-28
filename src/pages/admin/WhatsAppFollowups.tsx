import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { ConversationPanel } from '@/components/whatsapp/ConversationPanel';
import { WhatsAppAvatar } from '@/components/whatsapp/WhatsAppAvatar';
import { whatsAppRelativeTime } from '@/lib/whatsappAvatar';
import { cn } from '@/lib/utils';
import {
  fetchWhatsAppConversations,
  fetchWhatsAppMessages,
  isWithinSessionWindow,
  mergeWhatsAppMessage,
  sendWhatsAppAdminReply,
  sendWhatsAppTemplateRestart,
  setWhatsAppTakeover,
  subscribeToVenueWhatsAppActivity,
  subscribeToWhatsAppMessages,
  whatsAppSessionWindowErrorMessage,
  type WhatsAppConversationSummary,
  type WhatsAppMessageRow,
} from '@/lib/whatsappConversation';

const REASON_LABELS: Record<string, string> = {
  escalation: 'Escalation',
  knowledge_gap: "Couldn't answer",
  new_prospect: 'New enquiry',
};

export default function WhatsAppFollowups() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();

  const [conversations, setConversations] = useState<WhatsAppConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{ type: 'member' | 'prospect'; id: string } | null>(null);

  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [sendingTemplateRestart, setSendingTemplateRestart] = useState(false);
  const [togglingTakeover, setTogglingTakeover] = useState(false);

  const [notesDraft, setNotesDraft] = useState('');
  const [savingFollowup, setSavingFollowup] = useState(false);

  const loadConversations = async () => {
    const convos = await fetchWhatsAppConversations(venueId);
    setConversations(convos);
    setConversationsLoading(false);
  };

  useEffect(() => {
    if (!venueId) return;
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  // Venue-wide live feed: new messages / new or resolved follow-ups update
  // the list — order, dots, everything — without a manual refresh.
  useEffect(() => {
    if (!venueId) return;
    const unsubscribe = subscribeToVenueWhatsAppActivity(venueId, () => loadConversations());
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  const selectedConv = conversations.find(
    (c) => c.contact.type === selectedContact?.type && c.contact.id === selectedContact?.id,
  ) ?? null;

  useEffect(() => {
    setNotesDraft('');
  }, [selectedContact?.type, selectedContact?.id]);

  useEffect(() => {
    if (!selectedContact) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setReplyText('');
    setMessagesLoading(true);
    fetchWhatsAppMessages(venueId, selectedContact).then((msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      setMessagesLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContact?.type, selectedContact?.id, venueId]);

  useEffect(() => {
    if (!selectedContact) return;
    const unsubscribe = subscribeToWhatsAppMessages(selectedContact, (row) => {
      setMessages((prev) => mergeWhatsAppMessage(prev, row));
    });
    return unsubscribe;
  }, [selectedContact?.type, selectedContact?.id]);

  const reloadMessages = async () => {
    if (!selectedContact) return;
    setMessages(await fetchWhatsAppMessages(venueId, selectedContact));
  };

  const toggleTakeover = async () => {
    if (!selectedContact || !selectedConv) return;
    setTogglingTakeover(true);
    const nextPaused = !selectedConv.aiPaused;
    const { error } = await setWhatsAppTakeover(selectedContact, nextPaused);
    setTogglingTakeover(false);
    if (error) {
      toast.error('Failed to update: ' + error);
      return;
    }
    toast.success(nextPaused ? 'Took over — the AI will stay quiet on this conversation.' : 'Handed back to the AI assistant.');
    loadConversations();
  };

  const sendReply = async () => {
    if (!selectedContact || !selectedConv?.e164 || !replyText.trim()) return;
    setSendingReply(true);
    const res = await sendWhatsAppAdminReply({ venueId, contact: selectedContact, toE164: selectedConv.e164, body: replyText.trim() });
    setSendingReply(false);
    if (!res.ok && res.error) {
      toast.error(whatsAppSessionWindowErrorMessage(res.error));
      return;
    }
    setReplyText('');
    reloadMessages();
  };

  const sendTemplateRestart = async () => {
    if (!selectedContact || !selectedConv?.e164) return;
    setSendingTemplateRestart(true);
    const res = await sendWhatsAppTemplateRestart({ venueId, contact: selectedContact, toE164: selectedConv.e164 });
    setSendingTemplateRestart(false);
    if (!res.ok && res.error) {
      toast.error(whatsAppSessionWindowErrorMessage(res.error));
      return;
    }
    toast.success('Template sent — they can reply to reopen the conversation.');
    reloadMessages();
  };

  const updateFollowupStatus = async (newStatus: 'open' | 'in_progress' | 'resolved') => {
    if (!selectedConv?.openFollowup) return;
    setSavingFollowup(true);
    const update: Record<string, unknown> = { status: newStatus, notes: notesDraft || null };
    if (newStatus === 'resolved') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = adminUser?.id ?? null;
    }
    const { error } = await supabase.from('whatsapp_followups').update(update).eq('id', selectedConv.openFollowup.id);
    setSavingFollowup(false);
    if (error) {
      toast.error('Failed to update follow-up: ' + error.message);
      return;
    }
    toast.success(newStatus === 'resolved' ? 'Marked resolved.' : 'Follow-up updated.');
    loadConversations();
  };

  const visibleConversations = waitingOnMeOnly
    ? conversations.filter((c) => !!c.openFollowup)
    : conversations;

  return (
    <AdminLayout title="WhatsApp Follow-ups">
      <div className="-mx-6 -my-6 grid h-[calc(100vh-3.5rem)] grid-cols-[300px_1fr] border-t border-border">
        {/* Conversation list */}
        <aside className="flex flex-col overflow-hidden border-r border-border bg-card/30">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Every member and prospect who's messaged this venue's WhatsApp number.
            </p>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant={!waitingOnMeOnly ? 'default' : 'outline'} onClick={() => setWaitingOnMeOnly(false)}>
                All
              </Button>
              <Button size="sm" variant={waitingOnMeOnly ? 'default' : 'outline'} onClick={() => setWaitingOnMeOnly(true)}>
                Waiting on me
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversationsLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : visibleConversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {waitingOnMeOnly ? 'Nothing waiting on you right now.' : "No WhatsApp activity yet for this venue."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visibleConversations.map((c) => {
                  const isActive = c.contact.type === selectedContact?.type && c.contact.id === selectedContact?.id;
                  const dot = c.openFollowup
                    ? c.openFollowup.urgency === 'urgent' ? 'bg-red-500' : 'bg-amber-500'
                    : c.aiPaused ? 'bg-violet-500' : undefined;
                  return (
                    <li key={`${c.contact.type}-${c.contact.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedContact(c.contact)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                          isActive ? 'bg-primary/10' : 'hover:bg-accent/40',
                        )}
                      >
                        <WhatsAppAvatar label={c.label} dotClassName={dot} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{c.label}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {whatsAppRelativeTime(c.lastMessageAt)}
                            </span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.openFollowup ? (REASON_LABELS[c.openFollowup.reason] ?? c.openFollowup.reason) : (c.e164 ?? '—')}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Active conversation */}
        <section className="flex min-h-0 flex-col gap-3 p-4">
          {!selectedContact || !selectedConv ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a conversation to view it.
            </div>
          ) : (
          <div className="min-h-0 flex-1">
            <ConversationPanel
              label={selectedConv.label}
              phoneE164={selectedConv.e164}
              inboundLabel={selectedContact.type === 'prospect' ? 'Prospect' : 'Member'}
              aiPaused={selectedConv.aiPaused}
              onToggleTakeover={toggleTakeover}
              togglingTakeover={togglingTakeover}
              banner={
                selectedConv.openFollowup && (
                  <div
                    className={cn(
                      'flex items-start justify-between gap-3 border-b px-4 py-2.5',
                      selectedConv.openFollowup.urgency === 'urgent' ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <span>{REASON_LABELS[selectedConv.openFollowup.reason] ?? selectedConv.openFollowup.reason}</span>
                        {selectedConv.openFollowup.urgency === 'urgent' && <span className="text-red-700">· urgent</span>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{selectedConv.openFollowup.summary}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {selectedConv.openFollowup.status === 'open' && (
                        <Button size="sm" variant="ghost" onClick={() => updateFollowupStatus('in_progress')} disabled={savingFollowup}>
                          In progress
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => updateFollowupStatus('resolved')} disabled={savingFollowup}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolve
                      </Button>
                    </div>
                  </div>
                )
              }
              messages={messages}
              messagesLoading={messagesLoading}
              withinWindow={isWithinSessionWindow(selectedConv.lastInboundAt)}
              replyText={replyText}
              onReplyChange={setReplyText}
              onSend={sendReply}
              sending={sendingReply}
              onSendTemplateRestart={sendTemplateRestart}
              sendingTemplateRestart={sendingTemplateRestart}
            />
          </div>
          )}

          {selectedConv?.openFollowup && (
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Internal notes about how this was handled…"
                className="text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => updateFollowupStatus(selectedConv.openFollowup!.status)} disabled={savingFollowup}>
                {savingFollowup ? 'Saving…' : 'Save note'}
              </Button>
              {selectedConv.openFollowup.status !== 'open' && (
                <Button size="sm" variant="outline" onClick={() => updateFollowupStatus('open')} disabled={savingFollowup}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reopen
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
