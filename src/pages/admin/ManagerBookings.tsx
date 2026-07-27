import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BedDouble, Users, Phone, Mail, MapPin, StickyNote } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';

// Read-only view for the club manager: confirmed (PAID) caravan + camping
// bookings. He handles these operationally once payment is settled — the
// committee still owns payment confirmation and cancellations on the full
// admin Bookings page. Accommodation type lives on booking_sites.site_type,
// reached via the booking_site_link join (there is no type column on bookings).

const MANAGED_TYPES = ['caravan', 'camping'];

interface SiteLinkRow {
  nights: number | null;
  booking_sites: { name: string; site_type: string; site_number: number | null } | null;
}

interface BookingRow {
  id: string;
  booking_code: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  membership_number: string | null;
  member_id: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price_cents: number;
  notes: string | null;
  booking_site_link: SiteLinkRow[];
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8,
  padding: 18, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

function fmtDate(d: string) {
  return format(new Date(d + 'T00:00:00'), 'EEE d MMM yyyy');
}

function nightsBetween(ci: string, co: string) {
  const a = new Date(ci + 'T00:00:00').getTime();
  const b = new Date(co + 'T00:00:00').getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

export default function ManagerBookings() {
  const { venueId } = useVenue();
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['manager-bookings', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_code, guest_name, guest_email, guest_phone, membership_number, member_id, check_in, check_out, num_guests, total_price_cents, notes, booking_site_link(nights, booking_sites(name, site_type, site_number))')
        .eq('venue_id', venueId)
        .eq('status', 'PAID')
        .order('check_in', { ascending: true });
      if (error) throw error;
      // Keep only bookings touching a caravan or camping site.
      return ((data ?? []) as BookingRow[]).filter((b) =>
        (b.booking_site_link ?? []).some((l) => l.booking_sites && MANAGED_TYPES.includes(l.booking_sites.site_type))
      );
    },
    enabled: !!venueId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const shown = useMemo(() => {
    if (view === 'upcoming') {
      return bookings.filter((b) => b.check_out >= todayStr); // current + future stays, soonest first
    }
    return [...bookings].sort((a, b) => (a.check_in < b.check_in ? 1 : -1)); // all, most recent first
  }, [bookings, view, todayStr]);

  return (
    <AdminLayout
      title="Caravan & Camping Bookings"
      action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['upcoming', 'all'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0',
                background: view === v ? '#1B3A4B' : '#FFFFFF', color: view === v ? '#FFFFFF' : '#475569', cursor: 'pointer',
              }}
            >
              {v === 'upcoming' ? 'Upcoming' : 'All'}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <BedDouble size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15 }}>No {view === 'upcoming' ? 'upcoming' : ''} confirmed caravan or camping bookings</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((b) => <BookingCard key={b.id} booking={b} isPast={b.check_out < todayStr} />)}
        </div>
      )}
    </AdminLayout>
  );
}

function BookingCard({ booking, isPast }: { booking: BookingRow; isPast: boolean }) {
  const sites = (booking.booking_site_link ?? [])
    .map((l) => l.booking_sites)
    .filter((s): s is NonNullable<SiteLinkRow['booking_sites']> => !!s);
  const siteLabel = sites
    .map((s) => (s.site_type === 'caravan' && s.site_number ? `${s.name} (Site ${s.site_number})` : s.name))
    .join(', ') || '—';
  const isCamping = sites.some((s) => s.site_type === 'camping');
  const nights = nightsBetween(booking.check_in, booking.check_out);

  return (
    <div style={{ ...cardStyle, opacity: isPast ? 0.65 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A202C' }}>{booking.guest_name}</span>
            {booking.member_id ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: 4 }}>Member</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 4 }}>Visitor</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1E40AF', background: '#DBEAFE', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: 4 }}>
              {isCamping ? 'Camping' : 'Caravan'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{booking.booking_code}</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2E5FA3' }}>
          {booking.total_price_cents > 0 ? formatCents(booking.total_price_cents) : 'Free'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
        <Info icon={<MapPin size={14} />} text={siteLabel} />
        <Info icon={<BedDouble size={14} />} text={`${fmtDate(booking.check_in)} → ${fmtDate(booking.check_out)} · ${nights} night${nights > 1 ? 's' : ''}`} />
        <Info icon={<Users size={14} />} text={`${booking.num_guests} guest${booking.num_guests > 1 ? 's' : ''}`} />
        {booking.guest_phone && <Info icon={<Phone size={14} />} text={<a href={`tel:${booking.guest_phone}`} style={{ color: '#2A9D8F' }}>{booking.guest_phone}</a>} />}
        {booking.guest_email && <Info icon={<Mail size={14} />} text={<a href={`mailto:${booking.guest_email}`} style={{ color: '#2A9D8F' }}>{booking.guest_email}</a>} />}
      </div>

      {booking.notes && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 6, fontSize: 13, color: '#334155' }}>
          <StickyNote size={14} style={{ marginTop: 2, flexShrink: 0, color: '#94A3B8' }} />
          <span style={{ whiteSpace: 'pre-wrap' }}>{booking.notes}</span>
        </div>
      )}
    </div>
  );
}

function Info({ icon, text }: { icon: React.ReactNode; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569', minWidth: 0 }}>
      <span style={{ color: '#94A3B8', flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}
