import { Check, CheckCheck, Clock, X, Wrench, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { classifyWhatsAppMessage, formatWhatsAppTimestamp, type WhatsAppMessageRow } from '@/lib/whatsappConversation';

const STATUS_ICON: Record<string, { icon: typeof Clock; className: string } | undefined> = {
  queued: { icon: Clock, className: 'text-muted-foreground' },
  sent: { icon: Check, className: 'text-muted-foreground' },
  delivered: { icon: CheckCheck, className: 'text-muted-foreground' },
  read: { icon: CheckCheck, className: 'text-primary' },
  failed: { icon: X, className: 'text-red-600' },
};

// Chat-style bubble matching LedraPulse's Conversations page (lightly tinted
// primary for outbound, card+border for inbound, rounded-2xl with a squared
// corner on the sender's side). Tool calls, template sends, and errors don't
// read naturally as a chat turn from either side, so they render as a small
// centred system note instead of a bubble.
export function WhatsAppMessageBubble({
  message,
  inboundLabel = 'Them',
}: {
  message: WhatsAppMessageRow;
  inboundLabel?: string;
}) {
  const { lane, label } = classifyWhatsAppMessage(message, inboundLabel);

  if (lane === 'tool' || lane === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          <Wrench className="h-3 w-3" />
          {label}
          {message.body ? `: ${message.body}` : ''}
        </span>
      </div>
    );
  }

  if (lane === 'error') {
    return (
      <div className="flex justify-center py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-[11px] text-red-700">
          <AlertCircle className="h-3 w-3" />
          {message.body || 'Assistant error'}
        </span>
      </div>
    );
  }

  const outbound = lane === 'assistant' || lane === 'admin';
  const status = STATUS_ICON[message.status];
  const StatusIcon = status?.icon;

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm',
          outbound
            ? 'rounded-br-sm bg-primary/15 text-foreground'
            : 'rounded-bl-sm border border-border bg-card text-foreground',
        )}
      >
        {message.body || message.template_sid ? (
          message.body || `[template ${message.template_sid}]`
        ) : (
          <em className="text-muted-foreground">(no body)</em>
        )}
        {message.status === 'failed' && message.error && (
          <div className="mt-1 flex items-start gap-1 rounded-md bg-red-50 p-1.5 text-[11px] text-red-700">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{message.error}</span>
          </div>
        )}
        <div className={cn('mt-1 flex items-center gap-1 text-[10px] text-muted-foreground', outbound ? 'justify-end' : 'justify-start')}>
          <span>{formatWhatsAppTimestamp(message.created_at)}</span>
          {outbound && StatusIcon && <StatusIcon className={cn('h-3 w-3', status.className)} />}
        </div>
      </div>
    </div>
  );
}
