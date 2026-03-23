import { useQuery } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]',
  PAID: 'bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]',
  CANCELLED: 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]',
  EXPIRED: 'bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]',
};

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string | null;
  onCancel: (id: string, code: string, status: string) => void;
  onConfirmEft: (id: string, code: string, name: string, amount: number) => void;
}

export default function BookingDetailDrawer({ open, onClose, bookingId, onCancel, onConfirmEft }: Props) {
  const { data: booking, isLoading } = useQuery({
    queryKey: ['admin-booking-detail', bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const { data } = await supabase
        .from('bookings')
        .select('*, booking_site_link(site_id, nights, price_per_night_cents, subtotal_cents, booking_sites(name)), booking_payments(id, amount_cents, method, reference, status, confirmed_at)')
        .eq('id', bookingId)
        .single();
      return data;
    },
    enabled: !!bookingId,
  });

  if (!open) return null;

  const b = booking as any;
  const nights = b ? differenceInDays(new Date(b.check_out + 'T00:00:00'), new Date(b.check_in + 'T00:00:00')) : 0;
  const payment = b?.booking_payments?.[0];
  const isEftPending = payment?.method === 'eft' && payment?.status === 'pending';

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Booking Details</SheetTitle>
        </SheetHeader>

        {isLoading || !b ? (
          <p className="text-muted-foreground py-8 text-center">Loading...</p>
        ) : (
          <div className="space-y-6 pb-8">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-bold text-foreground">{b.booking_code}</span>
              <span className={cn('inline-block text-xs font-medium rounded-full px-2.5 py-0.5', STATUS_STYLES[b.status] || '')}>
                {b.status}
              </span>
            </div>

            {/* Guest Details */}
            <Section title="Guest Details">
              <div className="flex items-center gap-2">
                <span className="text-sm">{b.guest_name}</span>
                {b.member_id && (
                  <span className="text-xs bg-[#EBF5FF] text-primary rounded px-2 py-0.5">Club Member</span>
                )}
              </div>
              <Row label="Email" value={b.guest_email} />
              {b.guest_phone && <Row label="Phone" value={b.guest_phone} />}
              {b.membership_number && <Row label="Membership" value={b.membership_number} />}
            </Section>

            {/* Stay Details */}
            <Section title="Stay Details">
              <Row label="Check-in" value={format(new Date(b.check_in + 'T00:00:00'), 'EEEE, d MMMM yyyy')} />
              <Row label="Check-out" value={format(new Date(b.check_out + 'T00:00:00'), 'EEEE, d MMMM yyyy')} />
              <Row label="Nights" value={String(nights)} />
              <Row label="Guests" value={String(b.num_guests)} />
              <div className="text-sm text-muted-foreground mt-1">
                {b.booking_site_link?.map((l: any, i: number) => (
                  <div key={i}>{l.booking_sites?.name} — {formatCents(l.price_per_night_cents)}/night</div>
                ))}
              </div>
            </Section>

            {/* Pricing */}
            <Section title="Pricing">
              {b.booking_site_link?.map((l: any, i: number) => (
                <div key={i} className="text-sm flex justify-between">
                  <span>{l.booking_sites?.name}: {l.nights} nights × {formatCents(l.price_per_night_cents)}</span>
                  <span>{formatCents(l.subtotal_cents)}</span>
                </div>
              ))}
              <div className="border-t border-border mt-2 pt-2 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span>{formatCents(b.total_price_cents)}</span>
              </div>
            </Section>

            {/* Payment */}
            <Section title="Payment">
              <Row label="Method" value={payment?.method === 'yoco' ? 'Card (Yoco)' : payment?.method === 'eft' ? 'EFT (Bank Transfer)' : '—'} />
              <Row label="Status" value={
                payment?.status === 'confirmed'
                  ? <span className="text-[#065F46]">Confirmed</span>
                  : <span className="text-[#D68910]">Pending</span>
              } />
              {payment?.reference && <Row label="Reference" value={payment.reference} />}
              {isEftPending && (
                <Button
                  className="mt-2 w-full bg-[#1E8449] hover:bg-[#1E8449]/90 text-white h-10"
                  onClick={() => onConfirmEft(b.id, b.booking_code, b.guest_name, b.total_price_cents)}
                >
                  Confirm EFT Payment
                </Button>
              )}
            </Section>

            {/* Notes */}
            {b.notes && (
              <Section title="Notes">
                <p className="text-sm text-muted-foreground">{b.notes}</p>
              </Section>
            )}

            {/* Timestamps */}
            <Section title="Timestamps">
              <Row label="Created" value={format(new Date(b.created_at), 'dd MMM yyyy HH:mm')} />
              {b.expires_at && b.status === 'PENDING' && (
                <Row label="Expires" value={format(new Date(b.expires_at), 'dd MMM yyyy HH:mm')} />
              )}
              {b.cancelled_at && (
                <Row label="Cancelled" value={format(new Date(b.cancelled_at), 'dd MMM yyyy HH:mm')} />
              )}
            </Section>

            {/* Cancel action */}
            {(b.status === 'PENDING' || b.status === 'PAID') && (
              <Button
                variant="outline"
                className="w-full h-10 border-[#C0392B] text-[#C0392B] hover:bg-[#C0392B]/5"
                onClick={() => onCancel(b.id, b.booking_code, b.status)}
              >
                Cancel Booking
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
