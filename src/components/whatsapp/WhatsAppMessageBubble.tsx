import { Check, CheckCheck, Clock, X, Wrench, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { classifyWhatsAppMessage, formatWhatsAppTimestamp, type WhatsAppMessageRow } from '@/lib/whatsappConversation';

const STATUS_ICON: Record<string, { icon: typeof Clock; className: string } | undefined> = {
  queued: { icon: Clock, className: 'text-primary-foreground/60' },
  sent: { icon: Check, className: 'text-primary-foreground/80' },
  delivered: { icon: CheckCheck, className: 'text-primary-foreground/80' },
  read: { icon: CheckCheck, className: 'text-emerald-300' },
  failed: { icon: X, className: 'text-red-300' },
};

// Chat-style bubble for a customer/assistant/admin message — mirrors
// LedraDesk's MessageBubble (outbound = primary colour, right-aligned,
// rounded-2xl with a squared-off corner on the sender's side; inbound =
// card colour, left-aligned). Tool calls, template sends, and errors don't
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
    <div className={cn('flex w-full', outbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[75%]">
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 shadow-sm',
            outbound
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border border-border bg-card text-card-foreground',
          )}
        >
          {message.body || message.template_sid ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-snug">
              {message.body || `[template ${message.template_sid}]`}
            </p>
          ) : (
            <p className="text-xs italic opacity-70">(no body)</p>
          )}
          {message.status === 'failed' && message.error && (
            <div
              className={cn(
                'mt-1 flex items-start gap-1 rounded-md p-1.5 text-[11px]',
                outbound ? 'bg-black/10' : 'bg-red-50 text-red-700',
              )}
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{message.error}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground',
            outbound ? 'justify-end' : 'justify-start',
          )}
        >
          {!outbound && <span className="font-medium">{label}</span>}
          <span>{formatWhatsAppTimestamp(message.created_at)}</span>
          {outbound && StatusIcon && <StatusIcon className={cn('h-3 w-3', status.className)} />}
        </div>
      </div>
    </div>
  );
}
