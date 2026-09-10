import { useState, useEffect, useCallback } from 'react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Anchor, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface BoatRow { id: string; boat_name: string; registration_number: string | null }

interface OpenSignout {
  id: string;
  boat_name: string;
  passenger_count: number;
  passenger_note: string | null;
  departure_at: string;
  expected_return_at: string;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PortalWaterSignout() {
  const { member } = usePortalAuth();
  const memberId = member?.id;
  const venueId = member?.venue_id;

  const [loading, setLoading] = useState(true);
  const [boats, setBoats] = useState<BoatRow[]>([]);
  const [openSignout, setOpenSignout] = useState<OpenSignout | null>(null);
  const [contactSnapshot, setContactSnapshot] = useState({
    phone: '', emergency_contact_name: '', emergency_contact_phone: '',
  });

  // Form state
  const [selectedBoatId, setSelectedBoatId] = useState<string>('');
  const [freeBoatName, setFreeBoatName] = useState('');
  const [passengerCount, setPassengerCount] = useState('0');
  const [passengerNote, setPassengerNote] = useState('');
  const [expectedReturn, setExpectedReturn] = useState(() => toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!memberId || !venueId) return;
    setLoading(true);
    const [boatsRes, memberRes, openRes] = await Promise.all([
      supabase.from('member_boats').select('id, boat_name, registration_number').eq('member_id', memberId).eq('venue_id', venueId).order('created_at'),
      supabase.from('members').select('phone, emergency_contact_name, emergency_contact_phone').eq('id', memberId).eq('venue_id', venueId).single(),
      supabase.from('water_signouts').select('id, boat_name, passenger_count, passenger_note, departure_at, expected_return_at')
        .eq('member_id', memberId).eq('venue_id', venueId).eq('status', 'out').maybeSingle(),
    ]);
    setBoats((boatsRes.data as BoatRow[]) || []);
    if (memberRes.data) {
      setContactSnapshot({
        phone: memberRes.data.phone || '',
        emergency_contact_name: memberRes.data.emergency_contact_name || '',
        emergency_contact_phone: memberRes.data.emergency_contact_phone || '',
      });
    }
    setOpenSignout((openRes.data as OpenSignout) || null);
    if (boatsRes.data && boatsRes.data.length > 0) setSelectedBoatId(boatsRes.data[0].id);
    setLoading(false);
  }, [memberId, venueId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const signOut = async () => {
    if (!memberId || !venueId) return;
    const boat = boats.find(b => b.id === selectedBoatId);
    const boatName = boat ? boat.boat_name : freeBoatName.trim();
    if (!boatName) { toast.error('Please select or enter a boat'); return; }
    if (!expectedReturn) { toast.error('Please set an expected return time'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('water_signouts').insert({
      venue_id: venueId,
      member_id: memberId,
      member_boat_id: boat?.id ?? null,
      boat_name: boatName,
      passenger_count: Number(passengerCount) || 0,
      passenger_note: passengerNote.trim() || null,
      contact_phone: contactSnapshot.phone || null,
      emergency_contact_name: contactSnapshot.emergency_contact_name || null,
      emergency_contact_phone: contactSnapshot.emergency_contact_phone || null,
      departure_at: new Date().toISOString(),
      expected_return_at: new Date(expectedReturn).toISOString(),
      source: 'portal',
    });
    setSubmitting(false);
    if (error) { toast.error('Could not sign out — please try again.'); return; }
    toast.success("You're signed out. Have a great time on the water!");
    fetchAll();
  };

  const signIn = async () => {
    if (!openSignout) return;
    setSigningIn(true);
    const { error } = await supabase.from('water_signouts')
      .update({ actual_return_at: new Date().toISOString(), status: 'in' })
      .eq('id', openSignout.id);
    setSigningIn(false);
    if (error) { toast.error('Could not sign in — please try again.'); return; }
    toast.success('Welcome back! Signed in safely.');
    fetchAll();
  };

  const inputStyle: React.CSSProperties = { height: 44, borderRadius: 8, fontSize: 14, borderColor: 'var(--portal-card-border)' };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--portal-text-secondary)', marginBottom: 4, display: 'block' };
  const sectionCardStyle: React.CSSProperties = {
    background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)', border: `1px solid var(--portal-card-border)`,
    padding: 20, marginBottom: 16, boxShadow: 'var(--portal-card-shadow)',
  };
  const sectionHeading: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 16 };

  if (loading) {
    return (
      <div style={{ paddingTop: 60, display: 'flex', justifyContent: 'center' }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--portal-primary)' }} />
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 4 }}>
        <Anchor size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />
        Water Sign-Out
      </h1>
      <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginBottom: 24 }}>
        Log a float plan before you head out, so the club knows to look for you if you're not back.
      </p>

      {openSignout ? (
        <div style={sectionCardStyle}>
          <h2 style={sectionHeading}>You're currently signed out</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, fontSize: 14, color: 'var(--portal-text-primary)' }}>
            <div><strong>Boat:</strong> {openSignout.boat_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} /> {openSignout.passenger_count} {openSignout.passenger_count === 1 ? 'person' : 'people'} aboard
              {openSignout.passenger_note ? ` — ${openSignout.passenger_note}` : ''}
            </div>
            <div>Departed: {format(new Date(openSignout.departure_at), 'd MMM, HH:mm')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Expected back: {format(new Date(openSignout.expected_return_at), 'd MMM, HH:mm')}
            </div>
          </div>
          <Button onClick={signIn} disabled={signingIn} className="w-full sm:w-auto" style={{ height: 44, background: 'var(--portal-primary)', color: '#FFFFFF', fontWeight: 600, borderRadius: 'var(--portal-button-radius)', paddingLeft: 24, paddingRight: 24 }}>
            {signingIn && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Sign In — I'm Back
          </Button>
        </div>
      ) : (
        <div style={sectionCardStyle}>
          <h2 style={sectionHeading}>Sign out</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label style={labelStyle}>Boat</label>
              {boats.length > 0 ? (
                <select
                  value={selectedBoatId}
                  onChange={e => setSelectedBoatId(e.target.value)}
                  style={{ ...inputStyle, width: '100%', padding: '0 12px', border: '1px solid var(--portal-card-border)', background: 'var(--portal-card-bg)', color: 'var(--portal-text-primary)' }}
                >
                  {boats.map(b => <option key={b.id} value={b.id}>{b.boat_name}</option>)}
                  <option value="">Other / not listed</option>
                </select>
              ) : null}
              {(boats.length === 0 || selectedBoatId === '') && (
                <Input
                  placeholder="Boat name"
                  value={freeBoatName}
                  onChange={e => setFreeBoatName(e.target.value)}
                  style={{ ...inputStyle, marginTop: boats.length > 0 ? 8 : 0 }}
                />
              )}
            </div>
            <div>
              <label style={labelStyle}>People aboard (including you)</label>
              <Input type="number" min={0} max={50} value={passengerCount} onChange={e => setPassengerCount(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Expected return time</label>
              <Input type="datetime-local" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} style={inputStyle} />
            </div>
            <div className="sm:col-span-2">
              <label style={labelStyle}>Names / notes (optional)</label>
              <Input placeholder="e.g. with the Smith family" value={passengerNote} onChange={e => setPassengerNote(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 12 }}>
            Departure time is logged as now. Your cellphone and emergency contact on file will be attached automatically.
          </p>
          <Button onClick={signOut} disabled={submitting} className="mt-4 w-full sm:w-auto" style={{ height: 44, background: 'var(--portal-primary)', color: '#FFFFFF', fontWeight: 600, borderRadius: 'var(--portal-button-radius)', paddingLeft: 24, paddingRight: 24 }}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );
}
