// whatsappConversation.ts — Shared helpers for viewing/replying to a WhatsApp
// conversation (member or prospect) from the admin UI. Backs the WhatsApp
// Follow-ups page (the persistent list + conversation split-view).

import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppContactRef {
  type: 'member' | 'prospect';
  id: string;
}

export interface WhatsAppMessageRow {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  related_kind: string | null;
  status: string;
  error: string | null;
  created_at: string;
  template_sid: string | null;
}

export type WhatsAppMessageLane = 'them' | 'assistant' | 'admin' | 'tool' | 'error' | 'system';

export const WHATSAPP_LANE_STYLES: Record<WhatsAppMessageLane, string> = {
  them: 'bg-blue-50 border-blue-200',
  assistant: 'bg-emerald-50 border-emerald-200',
  admin: 'bg-violet-50 border-violet-200',
  tool: 'bg-amber-50 border-amber-200 font-mono text-xs',
  error: 'bg-red-50 border-red-200',
  system: 'bg-muted/40 border-border',
};

// Categorise a row for rendering. The same body field carries: their text,
// assistant text, tool-call summaries, error notes, admin replies, and
// template sends. `inboundLabel` lets a caller say "Member" / "Prospect"
// instead of the generic "Them" when it already knows which.
export function classifyWhatsAppMessage(
  m: WhatsAppMessageRow,
  inboundLabel = 'Them',
): { lane: WhatsAppMessageLane; label: string } {
  const kind = m.related_kind ?? '';
  if (m.direction === 'inbound') {
    return { lane: 'them', label: inboundLabel };
  }
  if (kind === 'ai_reply') return { lane: 'assistant', label: 'Assistant' };
  if (kind === 'ai_tool_call') return { lane: 'tool', label: 'Tool call' };
  if (kind === 'ai_error') return { lane: 'error', label: 'Assistant error' };
  if (kind === 'optin_reply' || kind === 'optout_reply' || kind === 'portal_reply' || kind === 'link_request' || kind === 'link_request_failed' || kind === 'link_request_settled') {
    return { lane: 'assistant', label: 'Reply' };
  }
  if (kind === 'admin_reply') return { lane: 'admin', label: 'Admin (you)' };
  if (kind === 'staff_alert') return { lane: 'system', label: 'Staff alert' };
  if (m.template_sid || kind === 'tab_reminder' || kind === 'optin_invite' || kind === 'broadcast' || kind?.startsWith('template')) {
    return { lane: 'system', label: 'Template send' };
  }
  return { lane: 'system', label: kind || 'outbound' };
}

export function formatWhatsAppTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function isWithinSessionWindow(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}

export interface WhatsAppFollowupRef {
  id: string;
  status: 'open' | 'in_progress' | 'resolved';
  urgency: 'normal' | 'urgent';
  reason: string;
  summary: string;
}

export interface WhatsAppConversationSummary {
  contact: WhatsAppContactRef;
  label: string;
  e164: string | null;
  lastMessageAt: string;
  lastInboundAt: string | null;
  aiPaused: boolean;
  /** The most recent open/in_progress follow-up for this contact, if any — this is the "waiting on me" signal. */
  openFollowup: WhatsAppFollowupRef | null;
}

// Every member/prospect who has ever exchanged a WhatsApp message with this
// venue, most-recently-active first, each carrying whether it currently has
// an open/in_progress follow-up (the dot the sidebar shows).
export async function fetchWhatsAppConversations(venueId: string): Promise<WhatsAppConversationSummary[]> {
  const { data: msgRows } = await supabase
    .from('whatsapp_messages')
    .select('member_id, prospect_id, created_at')
    .eq('venue_id', venueId)
    .or('member_id.not.is.null,prospect_id.not.is.null')
    .order('created_at', { ascending: false })
    .limit(1000);

  const seenMembers = new Map<string, string>();
  const seenProspects = new Map<string, string>();
  for (const row of (msgRows ?? []) as Array<{ member_id: string | null; prospect_id: string | null; created_at: string }>) {
    if (row.member_id && !seenMembers.has(row.member_id)) seenMembers.set(row.member_id, row.created_at);
    else if (row.prospect_id && !seenProspects.has(row.prospect_id)) seenProspects.set(row.prospect_id, row.created_at);
  }
  const memberIds = Array.from(seenMembers.keys());
  const prospectIds = Array.from(seenProspects.keys());

  const [memberRes, prospectRes, followupRes] = await Promise.all([
    memberIds.length
      ? supabase.from('members').select('id, first_name, last_name, membership_number, whatsapp_number, phone, whatsapp_last_inbound_at, ai_paused').in('id', memberIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    prospectIds.length
      ? supabase.from('whatsapp_prospects').select('id, display_name, whatsapp_number, last_inbound_at, ai_paused').in('id', prospectIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase
      .from('whatsapp_followups')
      .select('id, member_id, prospect_id, status, urgency, reason, summary, created_at')
      .eq('venue_id', venueId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false }),
  ]);

  // One open/in_progress follow-up per contact — the most recent if there
  // happen to be more than one (shouldn't normally happen).
  const followupByContact = new Map<string, WhatsAppFollowupRef>();
  for (const f of (followupRes.data ?? []) as Array<{ id: string; member_id: string | null; prospect_id: string | null; status: 'open' | 'in_progress'; urgency: 'normal' | 'urgent'; reason: string; summary: string }>) {
    const key = f.member_id ? `member:${f.member_id}` : f.prospect_id ? `prospect:${f.prospect_id}` : null;
    if (key && !followupByContact.has(key)) {
      followupByContact.set(key, { id: f.id, status: f.status, urgency: f.urgency, reason: f.reason, summary: f.summary });
    }
  }

  const memberById = new Map(
    ((memberRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; membership_number: string | null; whatsapp_number: string | null; phone: string | null; whatsapp_last_inbound_at: string | null; ai_paused: boolean }>)
      .map((m) => [m.id, m]),
  );
  const prospectById = new Map(
    ((prospectRes.data ?? []) as Array<{ id: string; display_name: string | null; whatsapp_number: string; last_inbound_at: string; ai_paused: boolean }>)
      .map((p) => [p.id, p]),
  );

  const memberConvos: WhatsAppConversationSummary[] = memberIds.map((id) => {
    const m = memberById.get(id);
    const name = [m?.first_name, m?.last_name].filter(Boolean).join(' ') || 'Unknown member';
    return {
      contact: { type: 'member', id },
      label: m?.membership_number ? `${name} (#${m.membership_number})` : name,
      e164: m?.whatsapp_number ?? m?.phone ?? null,
      lastMessageAt: seenMembers.get(id)!,
      lastInboundAt: m?.whatsapp_last_inbound_at ?? null,
      aiPaused: !!m?.ai_paused,
      openFollowup: followupByContact.get(`member:${id}`) ?? null,
    };
  });
  const prospectConvos: WhatsAppConversationSummary[] = prospectIds.map((id) => {
    const p = prospectById.get(id);
    return {
      contact: { type: 'prospect', id },
      label: p?.display_name || 'Prospective member',
      e164: p?.whatsapp_number ?? null,
      lastMessageAt: seenProspects.get(id)!,
      lastInboundAt: p?.last_inbound_at ?? null,
      aiPaused: !!p?.ai_paused,
      openFollowup: followupByContact.get(`prospect:${id}`) ?? null,
    };
  });

  return [...memberConvos, ...prospectConvos].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

// Venue-wide realtime feed so the sidebar (list order, "waiting on me" dots)
// updates itself as new messages arrive or follow-ups are raised/resolved —
// not just the one open conversation. Callers refetch the list on each
// signal rather than trying to patch it in place, since a single change can
// affect ordering, a new contact appearing, or a dot disappearing.
export function subscribeToVenueWhatsAppActivity(venueId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`wa-venue-activity-${venueId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `venue_id=eq.${venueId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_followups', filter: `venue_id=eq.${venueId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchWhatsAppMessages(
  venueId: string,
  contact: WhatsAppContactRef,
  limit = 200,
): Promise<WhatsAppMessageRow[]> {
  const column = contact.type === 'member' ? 'member_id' : 'prospect_id';
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('id, direction, body, related_kind, status, error, created_at, template_sid')
    .eq('venue_id', venueId)
    .eq(column, contact.id)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []) as WhatsAppMessageRow[];
}

// ===== Live updates =====
//
// Subscribes to INSERT/UPDATE on whatsapp_messages for one contact (a new
// inbound message, a status flip like queued→delivered, etc.) so an open
// conversation view updates itself instead of relying on the next manual
// refresh. Requires whatsapp_messages to be added to the supabase_realtime
// publication (see migration 20260828120000_whatsapp_messages_realtime.sql).
// Call the returned function to unsubscribe (e.g. in a useEffect cleanup).
export function subscribeToWhatsAppMessages(
  contact: WhatsAppContactRef,
  onChange: (row: WhatsAppMessageRow) => void,
): () => void {
  const column = contact.type === 'member' ? 'member_id' : 'prospect_id';
  const channel = supabase
    .channel(`wa-messages-${contact.type}-${contact.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `${column}=eq.${contact.id}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as WhatsAppMessageRow | null;
        if (row) onChange(row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Upsert a message into a list by id, keeping it sorted oldest → newest.
// Used to fold a realtime INSERT/UPDATE into local state without a refetch.
export function mergeWhatsAppMessage(
  list: WhatsAppMessageRow[],
  incoming: WhatsAppMessageRow,
): WhatsAppMessageRow[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  const next = idx === -1 ? [...list, incoming] : list.map((m, i) => (i === idx ? incoming : m));
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function setWhatsAppTakeover(
  contact: WhatsAppContactRef,
  paused: boolean,
): Promise<{ error: string | null }> {
  const table = contact.type === 'member' ? 'members' : 'whatsapp_prospects';
  const { error } = await supabase
    .from(table)
    .update({ ai_paused: paused, ai_paused_at: paused ? new Date().toISOString() : null })
    .eq('id', contact.id);
  return { error: error?.message ?? null };
}

async function invokeAdminReply(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('send-whatsapp-admin-reply', { body: payload });
  // On a non-2xx response, supabase-js sets `error` (a FunctionsHttpError) and
  // leaves `data` null — the actual { error: "..." } body the function
  // returned lives on error.context (the raw Response), not in `data`.
  let errMsg = (data as { error?: string } | null)?.error ?? null;
  if (!errMsg && error) {
    errMsg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.clone().json();
        if (body?.error) errMsg = body.error;
      } catch {
        // Non-JSON body — fall back to error.message above.
      }
    }
  }
  return errMsg ? { ok: false, error: errMsg } : { ok: true };
}

export async function sendWhatsAppAdminReply(args: {
  venueId: string;
  contact: WhatsAppContactRef;
  toE164: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  return invokeAdminReply({
    venue_id: args.venueId,
    member_id: args.contact.type === 'member' ? args.contact.id : null,
    prospect_id: args.contact.type === 'prospect' ? args.contact.id : null,
    to_e164: args.toE164,
    body: args.body,
  });
}

// Reopens a conversation whose 24h window has closed by sending the venue's
// approved generic template (resolved server-side — see
// send-whatsapp-admin-reply for why this isn't a client-supplied SID).
export async function sendWhatsAppTemplateRestart(args: {
  venueId: string;
  contact: WhatsAppContactRef;
  toE164: string;
}): Promise<{ ok: boolean; error?: string }> {
  return invokeAdminReply({
    venue_id: args.venueId,
    member_id: args.contact.type === 'member' ? args.contact.id : null,
    prospect_id: args.contact.type === 'prospect' ? args.contact.id : null,
    to_e164: args.toE164,
    restart_template: true,
  });
}

export function whatsAppSessionWindowErrorMessage(errMsg: string): string {
  return errMsg.includes('24h')
    ? "This conversation's 24h window has closed — reply by phone or email instead."
    : `Failed to send: ${errMsg}`;
}
