import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_FEES, ADDON_FEES, formatZAR } from '@/utils/membershipFees';
import { Skeleton } from '@/components/ui/skeleton';
import { X } from 'lucide-react';

interface BookingSiteRate {
  name: string;
  site_type: string;
  price_cents: number;
  pricing_tiers: { min_guests: number; max_guests: number; price_cents: number }[] | null;
  description: string | null;
  sort_order: number;
}

/**
 * Read-only rate card shown from the Club Account card. Membership fees come from
 * the same schedule the application form charges (src/utils/membershipFees.ts);
 * accommodation rates are read live from booking_sites so they can never drift
 * from what the booking flow actually quotes.
 */
export default function ClubRatesModal({ venueId, onClose }: { venueId: string; onClose: () => void }) {
  const { data: sites, isLoading } = useQuery({
    queryKey: ['portal-club-rates', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_sites')
        .select('name, site_type, price_cents, pricing_tiers, description, sort_order')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as unknown as BookingSiteRate[];
    },
    enabled: !!venueId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const caravans = (sites ?? []).filter(s => s.site_type === 'caravan');
  const camping = (sites ?? []).filter(s => s.site_type === 'camping');
  const dayVisitor = (sites ?? []).filter(s => s.site_type === 'day_visitor');

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16,
    padding: '10px 0', borderBottom: `1px solid var(--portal-card-border)`,
  };
  const nameStyle: React.CSSProperties = { fontSize: 14, color: 'var(--portal-text-primary)', fontWeight: 500 };
  const noteStyle: React.CSSProperties = { fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 2 };
  const priceStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)', whiteSpace: 'nowrap' };
  const sectionTitle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
    color: 'var(--portal-text-muted)', margin: '24px 0 4px',
  };

  const Row = ({ label, note, price }: { label: string; note?: string; price: string }) => (
    <div style={rowStyle}>
      <div>
        <div style={nameStyle}>{label}</div>
        {note ? <div style={noteStyle}>{note}</div> : null}
      </div>
      <div style={priceStyle}>{price}</div>
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div role="dialog" aria-modal="true" aria-label="Current club rates" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        maxWidth: 520, width: 'calc(100% - 32px)', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)',
        border: `1px solid var(--portal-card-border)`, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: 24, zIndex: 51,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--portal-text-primary)', margin: 0 }}>Current Club Rates</h2>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '4px 0 0' }}>
              Club year runs 1 May – 30 April.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)',
            padding: 4, lineHeight: 0,
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={sectionTitle}>Annual Subscriptions</div>
        <Row label={CATEGORY_FEES.ordinary.label} note="Includes partner and children under 12" price={`${formatZAR(CATEGORY_FEES.ordinary.annualCents)} / year`} />
        <Row label={CATEGORY_FEES.social.label} note="Max 48 days a year (14 consecutive)" price={`${formatZAR(CATEGORY_FEES.social.annualCents)} / year`} />
        <Row label={ADDON_FEES.intermediate.label} note="Ages 19–30, added to an Ordinary membership" price={`${formatZAR(ADDON_FEES.intermediate.annualCents)} / year`} />
        <Row label={CATEGORY_FEES.crew_visitor.label} note="25% of the Ordinary subscription" price={`${formatZAR(CATEGORY_FEES.crew_visitor.annualCents)} / year`} />
        <Row label={CATEGORY_FEES.junior.label} note="Member's child aged 12–18" price={`${formatZAR(CATEGORY_FEES.junior.annualCents)} / year`} />

        <div style={sectionTitle}>Joining Costs (new members)</div>
        <Row label="Joining fee" note="Once-off, Ordinary and Social members" price={formatZAR(CATEGORY_FEES.ordinary.joiningFeeCents)} />
        <Row label="Levy" note="Payable for the first five years of membership" price={`${formatZAR(CATEGORY_FEES.ordinary.landLevyCents)} / year`} />
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '10px 0 0' }}>
          Subscriptions are pro-rated by the month you join — the application month is charged in full.
        </p>

        <div style={sectionTitle}>Caravan &amp; Camping</div>
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full mt-2" />
            <Skeleton className="h-10 w-full mt-2" />
          </>
        ) : (
          <>
            {caravans.map(s => (
              <Row
                key={s.name}
                label={s.name}
                note={s.description ?? undefined}
                price={`${formatZAR(s.price_cents)} / night`}
              />
            ))}
            {camping.map(s => {
              const tiers = Array.isArray(s.pricing_tiers) ? s.pricing_tiers : null;
              if (!tiers?.length) {
                return <Row key={s.name} label={s.name} note={s.description ?? undefined} price={`${formatZAR(s.price_cents)} / night`} />;
              }
              return (
                <div key={s.name}>
                  <div style={{ ...nameStyle, marginTop: 10 }}>{s.name}</div>
                  <div style={noteStyle}>Priced per site per night, by group size</div>
                  {tiers.map(t => (
                    <Row
                      key={`${t.min_guests}-${t.max_guests}`}
                      label={t.max_guests >= 99 ? `${t.min_guests}+ guests` : t.min_guests === t.max_guests ? `${t.min_guests} guests` : `${t.min_guests}–${t.max_guests} guests`}
                      price={`${formatZAR(t.price_cents)} / night`}
                    />
                  ))}
                </div>
              );
            })}
            {dayVisitor.map(s => (
              <Row key={s.name} label={s.name} note={s.description ?? undefined} price={s.price_cents === 0 ? 'Free' : formatZAR(s.price_cents)} />
            ))}
          </>
        )}

        <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '16px 0 0' }}>
          Permanent caravan sites, boat sheds and moorings are billed separately on your club
          account and are not shown here. Rates are subject to change — speak to a committee
          member if anything looks out of date.
        </p>

        <button onClick={onClose} style={{
          marginTop: 20, width: '100%', height: 44, background: 'var(--portal-accent)', color: '#FFFFFF',
          fontWeight: 600, borderRadius: 'var(--portal-button-radius)', border: 'none', cursor: 'pointer',
        }}>Close</button>
      </div>
    </>
  );
}
