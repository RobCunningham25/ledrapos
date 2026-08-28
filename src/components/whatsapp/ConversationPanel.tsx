import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, FileText, Lock, Phone, Send, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { WhatsAppAvatar } from './WhatsAppAvatar';
import { WhatsAppMessageBubble } from './WhatsAppMessageBubble';
import type { WhatsAppMessageRow } from '@/lib/whatsappConversation';

export interface ConversationPanelProps {
  label: string;
  phoneE164: string | null;
  avatarKey: string;
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

// A LedraDesk-style two-part conversation view (header + scrolling chat
// thread + composer) shared by the WhatsApp Follow-ups drawer and the
// WhatsApp Assistant conversations panel, so both look and behave the same
// way instead of drifting into two ad-hoc designs.
export function ConversationPanel({
  label,
  phoneE164,
  avatarKey,
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
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <WhatsAppAvatar label={label} colorKey={avatarKey} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{label}</h3>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  aiPaused ? 'bg-violet-100 text-violet-800' : 'bg-teal-100 text-teal-800',
                )}
              >
                {aiPaused ? <UserCog className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />}
                {aiPaused ? 'Taken over' : 'AI assistant active'}
              </span>
            </div>
            {phoneE164 && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span className="font-mono">{phoneE164}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          <Button
            type="button"
            size="sm"
            variant={aiPaused ? 'default' : 'outline'}
            onClick={onToggleTakeover}
            disabled={togglingTakeover}
          >
            {togglingTakeover ? 'Saving…' : aiPaused ? 'Hand back to bot' : 'Take over'}
          </Button>
        </div>
      </header>

      {/* Thread */}
      <div className="max-h-[380px] flex-1 overflow-y-auto bg-muted/10 p-4">
        {messagesLoading && (
          <p className="text-center text-xs text-muted-foreground">Loading messages…</p>
        )}
        {!messagesLoading && messages.length === 0 && (
          <p className="whitespace-pre-wrap text-center text-xs text-muted-foreground">
            {emptyPlaceholder || 'No messages yet.'}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <WhatsAppMessageBubble key={m.id} message={m} inboundLabel={inboundLabel} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      {withinWindow ? (
        <div className="border-t border-border bg-card p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              rows={1}
              value={replyText}
              onChange={(e) => onReplyChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                phoneE164 ? 'Type a reply. Enter to send, Shift+Enter for a new line.' : 'No phone number on file.'
              }
              disabled={sending || !phoneE164}
              className="max-h-[160px] resize-none text-sm"
            />
            <Button type="button" onClick={onSend} disabled={sending || !replyText.trim() || !phoneE164}>
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Within the 24-hour window — free-form replies allowed.
          </p>
        </div>
      ) : (
        <div className="border-t border-border bg-card px-4 py-3">
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-amber-900">Outside the 24-hour reply window</p>
              <p className="mt-0.5 text-amber-800">
                WhatsApp only allows free-form replies within 24 hours of their last message.
                {onSendTemplateRestart
                  ? ' Send an approved template to restart the conversation.'
                  : " They'll need to message again before you can reply here."}
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
