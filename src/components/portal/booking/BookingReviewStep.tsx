import { useState } from 'react';
import { Home, Tent, Sun } from 'lucide-react';
import { formatCents } from '@/utils/currency';
import { format } from 'date-fns';

interface Props {
  siteType: 'caravan' | 'camping' | 'day_visitor'; siteName: string;
  checkIn: string; checkOut: string; nights: number; numGuests: number;
  perNightCents: number; totalCents: number;
  guestName: string; guestEmail: string; guestPhone: string;
  membershipNumber: string; notes: string;
  bookingFor?: 'self' | 'visitor'; memberName?: string;
  onBack: () => void; onEditStep: (step: number) => void; onConfirm: () => Promise<void>;
}

const TYPE_ICONS: Record<string, typeof Home> = { caravan: Home, camping: Tent, day_visitor: Sun };
const TYPE_LABELS: Record<string, string> = { caravan: 'Caravan', camping: 'Camping', day_visitor: 'Day Visitor' };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
      <span style={{ color: 'var(--portal-text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--portal-text-primary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function SectionHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text-primary)' }}>{title}</span>
      {onEdit && <span onClick={onEdit} style={{ fontSize: 13, color: 'var(--portal-accent)', cursor: 'pointer' }}>Edit</span>}
    </div>
  );
}

export default function BookingReviewStep(props: Props) {
  const { siteType, siteName, checkIn, checkOut, nights, numGuests, perNightCents, totalCents,
    guestName, guestEmail, guestPhone, membershipNumber, notes,
    bookingFor = 'self', memberName,
    onBack, onEditStep, onConfirm } = props;
  const [loading, setLoading] = useState(false);
  const Icon = TYPE_ICONS[siteType];
  const isDayVisitor = siteType === 'day_visitor';
  const isFree = totalCents === 0;
  const isVisitor = bookingFor === 'visitor';

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };

  const fmtDate = (d: string) => { try { return format(new Date(d + 'T12:00:00'), 'EEEE, d MMMM yyyy'); } catch { return d; } };

  return (
    <div>
      <div style={{ background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-card-radius)', boxShadow: 'var(--portal-card-shadow)', padding: 24 }}>
        <SectionHeader title="Stay Details" onEdit={() => onEditStep(2)} />
        <Row label="Type" value={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={16} />{TYPE_LABELS[siteType]}</span>} />
        {siteType === 'caravan' && <Row label="Site" value={siteName} />}
        <Row label="Check-in" value={fmtDate(checkIn)} />
        {!isDayVisitor && <Row label="Check-out" value={fmtDate(checkOut)} />}
        <Row label={isDayVisitor ? 'Duration' : 'Nights'} value={isDayVisitor ? '1 day' : `${nights}`} />
        <Row label="Guests" value={numGuests} />

        <div style={{ borderBottom: `1px solid var(--portal-card-border)`, margin: '16px 0' }} />

        <SectionHeader title={isVisitor ? 'Visitor Details' : 'Guest Details'} onEdit={() => onEditStep(3)} />
        {isVisitor && memberName && <Row label="Booked by" value={memberName} />}
        <Row label="Name" value={guestName} />
        <Row label="Email" value={guestEmail} />
        {guestPhone && <Row label="Phone" value={guestPhone} />}
        {!isVisitor && <Row label="Membership #" value={membershipNumber} />}
        {notes && <div style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 4 }}>Notes: {notes}</div>}

        <div style={{ borderBottom: `1px solid var(--portal-card-border)`, margin: '16px 0' }} />

        <SectionHeader title="Pricing" />
        <div style={{ fontSize: 14, color: 'var(--portal-text-primary)' }}>
          {isDayVisitor ? 'Day Visitor: Free' : `${siteName}: ${nights} night${nights !== 1 ? 's' : ''} × ${formatCents(perNightCents)} = ${formatCents(totalCents)}`}
        </div>

        <div style={{ borderBottom: `2px solid var(--portal-card-border)`, margin: '16px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-primary)' }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: isFree ? 'var(--portal-accent)' : 'var(--portal-primary)' }}>
            {isFree ? 'Free' : formatCents(totalCents)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-button-radius)', height: 52, padding: '0 24px', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Back</button>
        <button onClick={handleConfirm} disabled={loading}
          style={{ background: 'var(--portal-accent)', color: '#FFFFFF', borderRadius: 'var(--portal-button-radius)', height: 52, fontSize: 16, fontWeight: 600, border: 'none', padding: '0 40px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, maxWidth: 400, flex: 1 }}>
          {loading ? 'Creating Booking…' : 'Confirm Booking'}
        </button>
      </div>
    </div>
  );
}
