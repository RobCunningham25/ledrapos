import { cn } from '@/lib/utils';
import { whatsAppAvatarClasses, whatsAppInitials } from '@/lib/whatsappAvatar';

type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

export function WhatsAppAvatar({
  label,
  colorKey,
  size = 'md',
  className,
}: {
  label: string | null | undefined;
  colorKey?: string | null;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZE[size],
        whatsAppAvatarClasses(colorKey ?? label ?? null),
        className,
      )}
    >
      {whatsAppInitials(label)}
    </span>
  );
}
