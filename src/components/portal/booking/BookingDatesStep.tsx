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
  selectedSiteIds: string[]; checkIn: string; checkOut: string; numGuests: number;
  onSitesChange: (ids: string[]) => void; onCheckInChange: (v: string) => void;
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
  const { venueId, siteType, sites, selectedSiteIds, checkIn, checkOut, numGuests,
    onSitesChange, onCheckInChange, onCheckOutChange, onGuestsChange, onNext, onBack } = props;

  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [blockedNames, setBlockedNames] = useState<string[]>([]);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (siteType !== 'caravan' && selectedSiteIds.length === 0) {
      const s = sites.find(s => s.site_type === siteType);
      if (s) onSitesChange([s.id]);
    }
  }, [siteType, sites, selectedSiteIds, onSitesChange]);

  const selectedSites = useMemo(() => sites.filter(s => selectedSiteIds.includes(s.id)), [sites, selectedSiteIds]);
  const nights = useMemo(() => {
    if (siteType === 'day_visitor') return 1;
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  }, [checkIn, checkOut, siteType]);

  const perNight = useMemo(
    () => selectedSites.reduce((sum, s) => sum + getPerNightPrice(s, numGuests), 0),
    [selectedSites, numGuests]
  );
  const total = siteType === 'day_visitor' ? 0 : nights * perNight;
  const datesValid = siteType === 'day_visitor' ? !!checkIn : (!!checkIn && !!checkOut && checkOut > checkIn);
  const hasSelection = selectedSiteIds.length > 0;

  const toggleSite = (id: string) => {
    onSitesChange(
      selectedSiteIds.includes(id)
        ? selectedSiteIds.filter(s => s !== id)
        : [...selectedSiteIds, id]
    );
  };

  useEffect(() => {
    if (!hasSelection || !datesValid) { setAvailability('idle'); setBlockedNames([]); return; }
    setAvailability('checking');
    const timer = setTimeout(async () => {
      const effectiveCheckOut = siteType === 'day_visitor'
        ? new Date(new Date(checkIn).getTime() + 86400000).toISOString().split('T')[0]
        : checkOut;
      const blocked = new Set<string>();
      const realSiteIds = selectedSites.filter(s => !s.is_virtual).map(s => s.id);
      if (realSiteIds.length > 0) {
        const { data: conflicts } = await supabase
          .from('booking_site_link')
          .select('id, site_id, booking_id, bookings!inner(status, check_in, check_out, venue_id)')
          .in('site_id', realSiteIds)
          .eq('venue_id', venueId);
        (conflicts || []).forEach((c: any) => {
          const b = c.bookings;
          if (b && b.venue_id === venueId && ['PENDING', 'PAID'].includes(b.status)
            && b.check_in < effectiveCheckOut && b.check_out > checkIn) {
            blocked.add(c.site_id);
          }
        });
      }
      if (blocked.size === 0) {
        const lastNight = siteType === 'day_visitor' ? checkIn :
          new Date(new Date(checkOut).getTime() - 86400000).toISOString().split('T')[0];
        const { data: blackouts } = await supabase
          .from('booking_blackouts').select('*').eq('venue_id', venueId)
          .lte('start_date', lastNight).gte('end_date', checkIn);
        (blackouts || []).forEach(bo => {
          if (bo.site_id === null) selectedSiteIds.forEach(id => blocked.add(id));
          else if (selectedSiteIds.includes(bo.site_id)) blocked.add(bo.site_id);
        });
      }
      setBlockedNames(sites.filter(s => blocked.has(s.id)).map(s => s.name));
      setAvailability(blocked.size > 0 ? 'unavailable' : 'available');
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedSiteIds, selectedSites, sites, checkIn, checkOut, venueId, datesValid, siteType, hasSelection]);

  const canProceed = datesValid && hasSelection && availability === 'available';
  const inputStyle: React.CSSProperties = {
    border: `1px solid var(--portal-card-border)`, borderRadius: 8, padding: '10px 12px',
    fontSize: 14, background: 'var(--portal-card-bg)', width: '100%',
  };
  const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)', marginBottom: 4, display: 'block' };

  return (
    <div>
      {siteType === 'caravan' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 4 }}>Choose your sites</div>
          <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginBottom: 12 }}>Select one or more caravan sites — booking for a group? Take neighbouring sites in one go.</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {sites.filter(s => s.site_type === 'caravan').map(site => {
              const isSelected = selectedSiteIds.includes(site.id);
              return (
                <div key={site.id} onClick={() => toggleSite(site.id)}
                  style={{
                    background: isSelected ? '#F0FDFA' : 'var(--portal-card-bg)',
                    border: `2px solid ${isSelected ? 'var(--portal-accent)' : 'var(--portal-card-border)'}`,
                    borderRadius: 'var(--portal-card-radius)', padding: 16, cursor: 'pointer', flex: '1 1 180px', minWidth: 180, transition: 'all 0.2s',
                    position: 'relative',
                  }}>
                  {isSelected && <CheckCircle2 size={18} color="var(--portal-accent)" style={{ position: 'absolute', top: 12, right: 12 }} />}
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)' }}>{site.name}</div>
                  <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 4 }}>{formatCents(site.price_cents)}/night</div>
                  {site.description && <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginTop: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{site.description}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(siteType !== 'caravan' || hasSelection) && (
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
          {siteType === 'camping' && selectedSites.length > 0 && (
            <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 8 }}>
              {formatCents(perNight)} / night for {numGuests} guest{numGuests !== 1 ? 's' : ''}
            </div>
          )}
          {siteType === 'day_visitor' && (
            <div style={{ fontSize: 14, color: 'var(--portal-accent)', fontWeight: 500, marginTop: 8 }}>Free — no charge for day visitors</div>
          )}
        </div>
      )}

      {datesValid && hasSelection && (
        <div style={{ marginBottom: 16 }}>
          {availability === 'checking' && <div style={{ fontSize: 14, color: 'var(--portal-text-muted)' }}>Checking availability…</div>}
          {availability === 'available' && <div style={{ fontSize: 14, color: 'var(--portal-accent)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={16} /> Dates available ✓</div>}
          {availability === 'unavailable' && (
            <div style={{ fontSize: 14, color: 'var(--portal-danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={16} />
              {blockedNames.length > 0
                ? `${blockedNames.join(' and ')} ${blockedNames.length === 1 ? 'is' : 'are'} not available for these dates. Deselect ${blockedNames.length === 1 ? 'it' : 'them'} or choose different dates.`
                : 'These dates are not available. Please choose different dates.'}
            </div>
          )}
        </div>
      )}

      {datesValid && selectedSites.length > 0 && (
        <div style={{ background: 'var(--portal-page-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 500, color: 'var(--portal-text-primary)' }}>{selectedSites.map(s => s.name).join(' + ')}</div>
          <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 4 }}>
            {siteType === 'day_visitor' ? '1 day' : `${nights} night${nights !== 1 ? 's' : ''}`} · {siteType === 'day_visitor' ? 'Free' : `${formatCents(perNight)} / night${selectedSites.length > 1 ? ` across ${selectedSites.length} sites` : ''}`}
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
