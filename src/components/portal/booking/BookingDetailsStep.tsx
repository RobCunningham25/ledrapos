import { useState } from 'react';
import { User, UserPlus } from 'lucide-react';

interface Props {
  guestName: string; guestEmail: string; guestPhone: string; notes: string;
  memberName: string; membershipNumber: string;
  bookingFor: 'self' | 'visitor';
  onBookingForChange: (v: 'self' | 'visitor') => void;
  onChange: (field: 'guestName' | 'guestEmail' | 'guestPhone' | 'notes', value: string) => void;
  onNext: () => void; onBack: () => void;
}

export default function BookingDetailsStep({ guestName, guestEmail, guestPhone, notes, memberName, membershipNumber, bookingFor, onBookingForChange, onChange, onNext, onBack }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!guestName.trim()) e.guestName = 'Name is required';
    if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) e.guestEmail = 'Valid email is required';
    setErrors(e);
    if (Object.keys(e).length === 0) onNext();
  };

  const inputStyle: React.CSSProperties = { border: `1px solid var(--portal-card-border)`, borderRadius: 8, padding: '10px 12px', fontSize: 14, background: 'var(--portal-card-bg)', width: '100%' };
  const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)', marginBottom: 4, display: 'block' };

  const toggleCard = (selected: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? 'var(--portal-accent)' : 'var(--portal-card-border)'}`,
    background: selected ? '#F0FDFA' : 'var(--portal-card-bg)',
    borderRadius: 'var(--portal-button-radius)', padding: 16, cursor: 'pointer', textAlign: 'center', flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    transition: 'border-color 0.15s, background 0.15s',
  });

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 12 }}>Who is this booking for?</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => onBookingForChange('self')} style={toggleCard(bookingFor === 'self')}>
            <User size={24} color="var(--portal-primary)" />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)' }}>For myself</span>
          </button>
          <button type="button" onClick={() => onBookingForChange('visitor')} style={toggleCard(bookingFor === 'visitor')}>
            <UserPlus size={24} color="var(--portal-primary)" />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)' }}>Send to a visitor</span>
          </button>
        </div>
      </div>

      <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginBottom: 16 }}>
        {bookingFor === 'self' ? (
          <>Booking as <span style={{ fontWeight: 600 }}>{memberName}</span> (Membership <span style={{ fontWeight: 600 }}>#{membershipNumber}</span>)</>
        ) : (
          <>Enter the visitor's details below. A payment link will be generated for them to complete the booking.</>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Guest Name</label>
        <input value={guestName} onChange={e => onChange('guestName', e.target.value)}
          placeholder={bookingFor === 'visitor' ? "Visitor's full name" : "Full name"} style={inputStyle} />
        {bookingFor === 'self' && (
          <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginTop: 4 }}>You can change the guest name if you're booking on behalf of someone else.</div>
        )}
        {errors.guestName && <div style={{ fontSize: 13, color: 'var(--portal-danger)', marginTop: 4 }}>{errors.guestName}</div>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Email</label>
        <input type="email" value={guestEmail} onChange={e => onChange('guestEmail', e.target.value)}
          placeholder={bookingFor === 'visitor' ? "Visitor's email address" : "Email address"} style={inputStyle} />
        {errors.guestEmail && <div style={{ fontSize: 13, color: 'var(--portal-danger)', marginTop: 4 }}>{errors.guestEmail}</div>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Phone</label>
        <input type="tel" value={guestPhone} onChange={e => onChange('guestPhone', e.target.value)}
          placeholder={bookingFor === 'visitor' ? "Visitor's phone number" : "Phone number"} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Special Requests / Notes</label>
        <textarea value={notes} onChange={e => onChange('notes', e.target.value)} rows={3} placeholder="Any special requirements or notes for your stay" style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={onBack} style={{ border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-button-radius)', height: 48, padding: '0 24px', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Back</button>
        <button onClick={validate} disabled={!guestName.trim() || !guestEmail.trim()}
          style={{ background: guestName.trim() && guestEmail.trim() ? 'var(--portal-primary)' : 'var(--portal-card-border)', color: guestName.trim() && guestEmail.trim() ? '#FFFFFF' : 'var(--portal-text-muted)', borderRadius: 'var(--portal-button-radius)', height: 48, fontSize: 16, fontWeight: 600, border: 'none', padding: '0 32px', cursor: guestName.trim() && guestEmail.trim() ? 'pointer' : 'not-allowed', maxWidth: 320, flex: 1 }}>
          Next
        </button>
      </div>
    </div>
  );
}
