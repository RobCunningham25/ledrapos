// whatsappConversation.ts — Shared helpers for viewing/replying to a WhatsApp
// conversation (member or prospect) from the admin UI. Used by both the
// WhatsApp Assistant "Recent conversations" panel and the WhatsApp Follow-ups
// drawer, so a flagged conversation can be engaged with from either page.

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

export interface WhatsAppContactState {
  e164: string | null;
  lastInboundAt: string | null;
  aiPaused: boolean;
}

export async function fetchWhatsAppContactState(
  contact: WhatsAppContactRef,
): Promise<WhatsAppContactState | null> {
  if (contact.type === 'member') {
    const { data } = await supabase
      .from('members')
      .select('whatsapp_number, phone, whatsapp_last_inbound_at, ai_paused')
      .eq('id', contact.id)
      .maybeSingle();
    if (!data) return null;
    return {
      e164: data.whatsapp_number ?? data.phone ?? null,
      lastInboundAt: data.whatsapp_last_inbound_at ?? null,
      aiPaused: !!data.ai_paused,
    };
  }
  const { data } = await supabase
    .from('whatsapp_prospects')
    .select('whatsapp_number, last_inbound_at, ai_paused')
    .eq('id', contact.id)
    .maybeSingle();
  if (!data) return null;
  return {
    e164: data.whatsapp_number ?? null,
    lastInboundAt: data.last_inbound_at ?? null,
    aiPaused: !!data.ai_paused,
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
