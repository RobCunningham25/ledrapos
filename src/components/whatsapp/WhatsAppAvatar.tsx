import { cn } from '@/lib/utils';
import { whatsAppInitials } from '@/lib/whatsappAvatar';

type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

// Same gradient circle for every contact (matches LedraPulse's Conversations
// list) — the initials are the differentiator, not a hashed hue per contact.
export function WhatsAppAvatar({
  label,
  size = 'md',
  className,
  dotClassName,
}: {
  label: string | null | undefined;
  size?: Size;
  className?: string;
  /** Small status dot in the top-right corner (e.g. "taken over"). Omit for none. */
  dotClassName?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', SIZE[size], className)}>
      <span
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full font-bold text-primary-foreground',
          'bg-gradient-to-br from-primary/70 to-secondary/70',
        )}
      >
        {whatsAppInitials(label)}
      </span>
      {dotClassName && (
        <span className={cn('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card', dotClassName)} />
      )}
    </span>
  );
}
