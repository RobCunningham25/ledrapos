import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { FileText, Lock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppMessageBubble } from './WhatsAppMessageBubble';
import type { WhatsAppMessageRow } from '@/lib/whatsappConversation';

export interface ConversationPanelProps {
  label: string;
  phoneE164: string | null;
  inboundLabel: string;
  aiPaused: boolean;
  onToggleTakeover: () => void;
  togglingTakeover: boolean;
  headerActions?: ReactNode;

  messages: WhatsAppMessageRow[];
  messagesLoading: boolean;
  emptyPlaceholder?: string;

  withinWindow: boolean;
  replyText: string;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;

  onSendTemplateRestart?: () => void;
  sendingTemplateRestart?: boolean;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

type ThreadItem = { kind: 'separator'; label: string; key: string } | { kind: 'message'; row: WhatsAppMessageRow };

// A conversation view matching LedraPulse's Conversations page (plain
// name/phone header, day-grouped message list, lightly-tinted bubbles) —
// shared by the WhatsApp Follow-ups drawer and the WhatsApp Assistant
// conversations panel so both look and behave the same way.
export function ConversationPanel({
  label,
  phoneE164,
  inboundLabel,
  aiPaused,
  onToggleTakeover,
  togglingTakeover,
  headerActions,
  messages,
  messagesLoading,
  emptyPlaceholder,
  withinWindow,
  replyText,
  onReplyChange,
  onSend,
  sending,
  onSendTemplateRestart,
  sendingTemplateRestart,
}: ConversationPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const threadItems = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [];
    let lastKey = '';
    for (const row of messages) {
      const key = row.created_at.slice(0, 10);
      if (key !== lastKey) {
        lastKey = key;
        items.push({ kind: 'separator', label: dayLabel(row.created_at), key });
      }
      items.push({ kind: 'message', row });
    }
    return items;
  }, [messages]);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      lastCountRef.current = messages.length;
    }
  }, [messages.length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [replyText]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (replyText.trim() && !sending) onSend();
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{label}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {phoneE164 ?? '—'}
            {aiPaused && <span className="ml-2 text-violet-700">taken over</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          <Button type="button" size="sm" variant="ghost" onClick={onToggleTakeover} disabled={togglingTakeover}>
            {togglingTakeover ? 'Saving…' : aiPaused ? 'Hand back to bot' : 'Take over'}
          </Button>
        </div>
      </header>

      {/* Thread */}
      <div className="max-h-[420px] flex-1 overflow-y-auto bg-background px-4 py-3">
        {messagesLoading && (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        )}
        {!messagesLoading && messages.length === 0 && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {emptyPlaceholder || 'No messages yet.'}
          </p>
        )}
        <div className="space-y-2">
          {threadItems.map((item) =>
            item.kind === 'separator' ? (
              <div key={`sep-${item.key}`} className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 select-none text-[10px] text-muted-foreground">{item.label}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <WhatsAppMessageBubble key={item.row.id} message={item.row} inboundLabel={inboundLabel} />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      {withinWindow ? (
        <div className="border-t border-border bg-card/40 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              rows={1}
              value={replyText}
              onChange={(e) => onReplyChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={phoneE164 ? 'Type a message…' : 'No phone number on file.'}
              disabled={sending || !phoneE164}
              className="min-h-[42px] max-h-[160px] resize-none bg-background text-sm"
            />
            <Button type="button" onClick={onSend} disabled={sending || !replyText.trim() || !phoneE164} size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border bg-amber-50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Outside the 24-hour reply window</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                WhatsApp only allows free-form replies within 24 hours of their last message.
                {onSendTemplateRestart && ' Send an approved template to restart the conversation.'}
              </p>
              {onSendTemplateRestart && (
                <div className="mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={onSendTemplateRestart} disabled={sendingTemplateRestart}>
                    <FileText className="h-3.5 w-3.5" />
                    {sendingTemplateRestart ? 'Sending…' : 'Send template'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
