import { useEffect, useState, useMemo } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { differenceInCalendarDays } from 'date-fns';

interface BookingSite {
  id: string; name: string; site_type: string; price_cents: number;
  pricing_tiers: any; is_virtual: boolean; description: string | null;
}

interface Props {
  venueId: string; siteType: 'caravan' | 'camping' | 'day_visitor'; sites: BookingSite[];
  selectedSiteId: string | null; checkIn: string; checkOut: string; numGuests: number;
  onSiteSelect: (id: string) => void; onCheckInChange: (v: string) => void;
  onCheckOutChange: (v: string) => void; onGuestsChange: (v: number) => void;
  onNext: () => void; onBack: () => void;
}

function getPerNightPrice(site: BookingSite, numGuests: number): number {
  if (site.site_type === 'day_visitor') return 0;
  if (site.site_type === 'camping' && site.pricing_tiers && Array.isArray(site.pricing_tiers)) {
    const tier = (site.pricing_tiers as any[]).find((t: any) => numGuests >= t.min_guests && numGuests <= t.max_guests);
    if (tier) return tier.price_cents;
  }
  return site.price_cents;
}

export default function BookingDatesStep(props: Props) {
  const { venueId, siteType, sites, selectedSiteId, checkIn, checkOut, numGuests,
    onSiteSelect, onCheckInChange, onCheckOutChange, onGuestsChange, onNext, onBack } = props;

  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (siteType !== 'caravan' && !selectedSiteId) {
      const s = sites.find(s => s.site_type === siteType);
      if (s) onSiteSelect(s.id);
    }
  }, [siteType, sites, selectedSiteId, onSiteSelect]);

  const selectedSite = useMemo(() => sites.find(s => s.id === selectedSiteId), [sites, selectedSiteId]);
  const nights = useMemo(() => {
    if (siteType === 'day_visitor') return 1;
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  }, [checkIn, checkOut, siteType]);

  const perNight = useMemo(() => selectedSite ? getPerNightPrice(selectedSite, numGuests) : 0, [selectedSite, numGuests]);
  const total = siteType === 'day_visitor' ? 0 : nights * perNight;
  const datesValid = siteType === 'day_visitor' ? !!checkIn : (!!checkIn && !!checkOut && checkOut > checkIn);

  useEffect(() => {
    if (!selectedSiteId || !datesValid) { setAvailability('idle'); return; }
    setAvailability('checking');
    const timer = setTimeout(async () => {
      const effectiveCheckOut = siteType === 'day_visitor'
        ? new Date(new Date(checkIn).getTime() + 86400000).toISOString().split('T')[0]
        : checkOut;
      let blocked = false;
      if (selectedSite && !selectedSite.is_virtual) {
        const { data: conflicts } = await supabase
          .from('booking_site_link')
          .select('id, booking_id, bookings!inner(status, check_in, check_out, venue_id)')
          .eq('site_id', selectedSiteId)
          .eq('venue_id', venueId);
        if (conflicts) {
          blocked = conflicts.some((c: any) => {
            const b = c.bookings;
            return b && b.venue_id === venueId && ['PENDING', 'PAID'].includes(b.status)
              && b.check_in < effectiveCheckOut && b.check_out > checkIn;
          });
        }
      }
      if (!blocked) {
        const lastNight = siteType === 'day_visitor' ? checkIn :
          new Date(new Date(checkOut).getTime() - 86400000).toISOString().split('T')[0];
        const { data: blackouts } = await supabase
          .from('booking_blackouts').select('*').eq('venue_id', venueId)
          .lte('start_date', lastNight).gte('end_date', checkIn);
        if (blackouts) { blocked = blackouts.some(bo => bo.site_id === null || bo.site_id === selectedSiteId); }
      }
      setAvailability(blocked ? 'unavailable' : 'available');
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedSiteId, checkIn, checkOut, venueId, datesValid, siteType, selectedSite]);

  const canProceed = datesValid && selectedSiteId && availability === 'available';
  const inputStyle: React.CSSProperties = {
    border: `1px solid var(--portal-card-border)`, borderRadius: 8, padding: '10px 12px',
    fontSize: 14, background: 'var(--portal-card-bg)', width: '100%',
  };
  const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)', marginBottom: 4, display: 'block' };

  return (
    <div>
      {siteType === 'caravan' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 12 }}>Choose a site</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {sites.filter(s => s.site_type === 'caravan').map(site => (
              <div key={site.id} onClick={() => onSiteSelect(site.id)}
                style={{
                  background: selectedSiteId === site.id ? '#F0FDFA' : 'var(--portal-card-bg)',
                  border: `2px solid ${selectedSiteId === site.id ? 'var(--portal-accent)' : 'var(--portal-card-border)'}`,
                  borderRadius: 'var(--portal-card-radius)', padding: 16, cursor: 'pointer', flex: '1 1 180px', minWidth: 180, transition: 'all 0.2s',
                }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)' }}>{site.name}</div>
                <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 4 }}>{formatCents(site.price_cents)}/night</div>
                {site.description && <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginTop: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{site.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(siteType !== 'caravan' || selectedSiteId) && (
        <div style={{ marginBottom: 20 }}>
          {siteType === 'day_visitor' ? (
            <div style={{ maxWidth: 280 }}>
              <label style={labelStyle}>Date of visit</label>
              <input type="date" value={checkIn} min={today} onChange={e => { onCheckInChange(e.target.value); onCheckOutChange(e.target.value); }} style={inputStyle} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={labelStyle}>Check-in</label>
                <input type="date" value={checkIn} min={today} onChange={e => onCheckInChange(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={labelStyle}>Check-out</label>
                <input type="date" value={checkOut} min={checkIn ? new Date(new Date(checkIn).getTime() + 86400000).toISOString().split('T')[0] : today}
                  onChange={e => onCheckOutChange(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}
        </div>
      )}

      {(siteType === 'camping' || siteType === 'day_visitor') && (
        <div style={{ marginBottom: 20, maxWidth: 200 }}>
          <label style={labelStyle}>{siteType === 'day_visitor' ? 'Number of visitors' : 'Number of guests'}</label>
          <input type="number" value={numGuests} min={1} max={20} onChange={e => onGuestsChange(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))} style={inputStyle} />
          {siteType === 'camping' && selectedSite && (
            <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 8 }}>
              {formatCents(perNight)} / night for {numGuests} guest{numGuests !== 1 ? 's' : ''}
            </div>
          )}
          {siteType === 'day_visitor' && (
            <div style={{ fontSize: 14, color: 'var(--portal-accent)', fontWeight: 500, marginTop: 8 }}>Free — no charge for day visitors</div>
          )}
        </div>
      )}

      {datesValid && selectedSiteId && (
        <div style={{ marginBottom: 16 }}>
          {availability === 'checking' && <div style={{ fontSize: 14, color: 'var(--portal-text-muted)' }}>Checking availability…</div>}
          {availability === 'available' && <div style={{ fontSize: 14, color: 'var(--portal-accent)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={16} /> Dates available ✓</div>}
          {availability === 'unavailable' && <div style={{ fontSize: 14, color: 'var(--portal-danger)', display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={16} /> These dates are not available. Please choose different dates.</div>}
        </div>
      )}

      {datesValid && selectedSite && (
        <div style={{ background: 'var(--portal-page-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 500, color: 'var(--portal-text-primary)' }}>{selectedSite.name}</div>
          <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 4 }}>
            {siteType === 'day_visitor' ? '1 day' : `${nights} night${nights !== 1 ? 's' : ''}`} · {siteType === 'day_visitor' ? 'Free' : `${formatCents(perNight)} / night`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-primary)', marginTop: 8 }}>
            {siteType === 'day_visitor' || total === 0 ? 'Free' : formatCents(total)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={onBack} style={{ border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-button-radius)', height: 48, padding: '0 24px', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Back</button>
        <button onClick={onNext} disabled={!canProceed}
          style={{ background: canProceed ? 'var(--portal-primary)' : 'var(--portal-card-border)', color: canProceed ? '#FFFFFF' : 'var(--portal-text-muted)', borderRadius: 'var(--portal-button-radius)', height: 48, fontSize: 16, fontWeight: 600, border: 'none', padding: '0 32px', cursor: canProceed ? 'pointer' : 'not-allowed', maxWidth: 320, flex: 1, transition: 'all 0.2s' }}>
          Next
        </button>
      </div>
    </div>
  );
}

export { getPerNightPrice };
export type { BookingSite };
