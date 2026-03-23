import { useEffect, useState } from 'react';
import { Tent, Sun, Home } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';

interface BookingSite {
  id: string;
  name: string;
  site_type: string;
  price_cents: number;
  pricing_tiers: any;
  is_virtual: boolean;
  sort_order: number;
  description: string | null;
  site_number: number | null;
  capacity: number | null;
}

interface Props {
  venueId: string;
  onSelect: (type: 'caravan' | 'camping' | 'day_visitor', sites: BookingSite[]) => void;
}

const ICONS: Record<string, typeof Home> = { caravan: Home, camping: Tent, day_visitor: Sun };

export default function BookingTypeStep({ venueId, onSelect }: Props) {
  const [sites, setSites] = useState<BookingSite[]>([]);

  useEffect(() => {
    supabase.from('booking_sites').select('*').eq('venue_id', venueId).eq('is_active', true).order('sort_order')
      .then(({ data }) => { if (data) setSites(data as BookingSite[]); });
  }, [venueId]);

  const types = ['caravan', 'camping', 'day_visitor'] as const;

  const getSubtitle = (type: string) => {
    const typeSites = sites.filter(s => s.site_type === type);
    if (type === 'day_visitor') return { text: 'Free', color: T.teal, weight: 600 };
    if (type === 'camping') {
      let minPrice = Infinity;
      typeSites.forEach(s => {
        if (s.pricing_tiers && Array.isArray(s.pricing_tiers)) {
          (s.pricing_tiers as any[]).forEach((t: any) => { if (t.price_cents < minPrice) minPrice = t.price_cents; });
        }
        if (s.price_cents < minPrice) minPrice = s.price_cents;
      });
      return { text: `From ${formatCents(minPrice === Infinity ? 0 : minPrice)} / night`, color: T.textSecondary, weight: 400 };
    }
    const min = Math.min(...typeSites.map(s => s.price_cents));
    return { text: `From ${formatCents(min || 0)} / night`, color: T.textSecondary, weight: 400 };
  };

  const descriptions: Record<string, string> = {
    caravan: 'Private caravan stand with power and water',
    camping: 'Open camping area. Price varies by group size.',
    day_visitor: 'Day access to club facilities. No overnight stay.',
  };
  const titles: Record<string, string> = { caravan: 'Caravan', camping: 'Camping', day_visitor: 'Day Visitor' };

  const [hover, setHover] = useState<string | null>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {types.filter(t => sites.some(s => s.site_type === t)).map(type => {
        const Icon = ICONS[type];
        const sub = getSubtitle(type);
        return (
          <div key={type}
            onMouseEnter={() => setHover(type)} onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(type, sites.filter(s => s.site_type === type))}
            style={{
              background: T.cardBg, border: `1px solid ${hover === type ? T.teal : T.cardBorder}`,
              borderRadius: 12, boxShadow: hover === type ? '0 4px 12px rgba(43,35,25,0.1)' : T.cardShadow,
              padding: 24, cursor: 'pointer', transition: 'all 0.2s',
            }}>
            <Icon size={48} color={T.navy} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary }}>{titles[type]}</div>
            <div style={{ fontSize: 14, color: sub.color, fontWeight: sub.weight, marginTop: 4 }}>{sub.text}</div>
            <div style={{ fontSize: 14, color: T.textMuted, marginTop: 8 }}>{descriptions[type]}</div>
          </div>
        );
      })}
    </div>
  );
}
