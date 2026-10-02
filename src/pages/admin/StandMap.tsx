import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import { getMembershipLabel } from '@/constants/membershipTypes';
import { STAND_SHAPES, STAND_NUMBERS, STAND_MAP_WIDTH, STAND_MAP_HEIGHT } from '@/data/standMapShapes';

// Stand map for the club-manager + admin roles. Same narrow-select discipline as
// ManagerMemberDirectory: email is only fetched for non-manager roles, and never
// WhatsApp / credit / tab data.
interface StandMember {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  phone: string | null;
  email?: string | null;
  is_active: boolean | null;
  sites: string[];
  sheds: string[];
  boats: { name: string; reg: string }[];
}

const fullName = (m: StandMember) => `${m.first_name} ${m.last_name}`.trim();

export default function StandMap() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const [params] = useSearchParams();
  const debug = params.get('debug') === '1';
  const canSeeEmail = !!adminUser && adminUser.role !== 'manager';

  const [members, setMembers] = useState<StandMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cols = 'id, first_name, last_name, membership_number, membership_type, phone, is_active' + (canSeeEmail ? ', email' : '');
      const [membersRes, sitesRes, shedsRes, boatsRes] = await Promise.all([
        supabase.from('members').select(cols).eq('venue_id', venueId),
        supabase.from('member_sites').select('member_id, site_number').eq('venue_id', venueId),
        supabase.from('member_boat_sheds').select('member_id, shed_number').eq('venue_id', venueId),
        supabase.from('member_boats').select('member_id, boat_name, registration_number').eq('venue_id', venueId),
      ]);
      if (cancelled) return;

      const group = <T extends { member_id: string }, V,>(rows: T[] | null, pick: (r: T) => V) => {
        const map = new Map<string, V[]>();
        for (const r of rows || []) map.set(r.member_id, [...(map.get(r.member_id) || []), pick(r)]);
        return map;
      };
      const sites = group(sitesRes.data, r => r.site_number);
      const sheds = group(shedsRes.data, r => r.shed_number);
      const boats = group(boatsRes.data, r => ({ name: r.boat_name, reg: r.registration_number || '' }));

      const rows = ((membersRes.data as unknown as Omit<StandMember, 'sites' | 'sheds' | 'boats'>[]) || []).map(m => ({
        ...m,
        sites: sites.get(m.id) || [],
        sheds: sheds.get(m.id) || [],
        boats: boats.get(m.id) || [],
      }));
      setMembers(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [venueId, canSeeEmail]);

  // stand number -> members on it (a stand can be shared; a member can hold several stands)
  const byStand = useMemo(() => {
    const map = new Map<string, StandMember[]>();
    for (const m of members) {
      for (const s of m.sites) {
        const key = s.trim();
        map.set(key, [...(map.get(key) || []), m]);
      }
    }
    return map;
  }, [members]);

  const offMap = useMemo(
    () => [...byStand.keys()].filter(k => !STAND_SHAPES[k]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [byStand],
  );

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return new Set<string>();
    const hit = new Set<string>();
    for (const [stand, ms] of byStand) {
      if (ms.some(m =>
        fullName(m).toLowerCase().includes(q) ||
        m.membership_number.toLowerCase().includes(q) ||
        m.boats.some(b => b.name.toLowerCase().includes(q)),
      )) hit.add(stand);
      if (stand.toLowerCase() === q) hit.add(stand);
    }
    return hit;
  }, [q, byStand]);

  const selectedMembers = selected ? byStand.get(selected) || [] : [];

  const fillFor = (stand: string) => {
    if (matches.has(stand)) return 'hsl(var(--primary) / 0.55)';
    if (selected === stand || hover === stand) return 'hsl(var(--primary) / 0.4)';
    if (byStand.has(stand)) return 'hsl(var(--primary) / 0.18)';
    return 'transparent';
  };

  const standLabel = (stand: string) => {
    const ms = byStand.get(stand);
    return ms?.length ? `Stand ${stand} – ${ms.map(fullName).join(', ')}` : `Stand ${stand} – no member on record`;
  };

  return (
    <AdminLayout title="Stand Map">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Find member, boat or stand…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
            style={{ height: 40 }}
          />
        </div>
        <span className="text-sm text-muted-foreground">Tap a stand to see who is on it. Shaded stands have a member on record.</span>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <Skeleton className="w-full" style={{ aspectRatio: `${STAND_MAP_WIDTH} / ${STAND_MAP_HEIGHT}` }} />
        ) : (
          <div className="relative w-full" style={{ aspectRatio: `${STAND_MAP_WIDTH} / ${STAND_MAP_HEIGHT}` }}>
            <img src="/standmap.jpg" alt="Map of the club stands" className="absolute inset-0 w-full h-full select-none" draggable={false} />
            <svg viewBox={`0 0 ${STAND_MAP_WIDTH} ${STAND_MAP_HEIGHT}`} className="absolute inset-0 w-full h-full">
              {STAND_NUMBERS.map(stand => (
                <polygon
                  key={stand}
                  points={STAND_SHAPES[stand].map(p => p.join(',')).join(' ')}
                  role="button"
                  tabIndex={0}
                  aria-label={standLabel(stand)}
                  onClick={() => setSelected(stand)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(stand); } }}
                  onMouseEnter={() => setHover(stand)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    fill: fillFor(stand),
                    stroke: debug ? 'red' : 'transparent',
                    strokeWidth: debug ? 2 : 0,
                    cursor: 'pointer',
                    outlineOffset: -2,
                  }}
                />
              ))}
              {debug && STAND_NUMBERS.map(stand => {
                const pts = STAND_SHAPES[stand];
                const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
                const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
                return <text key={stand} x={cx} y={cy + 8} textAnchor="middle" fontSize={22} fill="red" pointerEvents="none">{stand}</text>;
              })}
            </svg>
          </div>
        )}
      </div>

      {offMap.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Not on the map (no matching stand number): {offMap.map(s => `${s} (${byStand.get(s)!.map(fullName).join(', ')})`).join('; ')}
        </p>
      )}

      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stand {selected}</DialogTitle>
          </DialogHeader>
          {selectedMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No member on record for this stand.</p>
          ) : (
            <div className="space-y-4">
              {selectedMembers.map(m => (
                <div key={m.id} className="rounded-lg border border-border p-4 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground">{fullName(m)}</div>
                      <div className="text-muted-foreground">
                        #{m.membership_number} · {getMembershipLabel(m.membership_type)}
                      </div>
                    </div>
                    <span className={m.is_active ? 'text-green-700 font-medium' : 'text-destructive font-medium'}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Row label="Cell">{m.phone ? <a className="underline" href={`tel:${m.phone.replace(/\s+/g, '')}`}>{m.phone}</a> : '—'}</Row>
                  {canSeeEmail && (
                    <Row label="Email">{m.email ? <a className="underline break-all" href={`mailto:${m.email}`}>{m.email}</a> : '—'}</Row>
                  )}
                  <Row label="Sites">{m.sites.length ? m.sites.join(', ') : '—'}</Row>
                  <Row label="Boat sheds">{m.sheds.length ? m.sheds.join(', ') : '—'}</Row>
                  <Row label="Boats">{m.boats.length ? m.boats.map(b => b.name + (b.reg ? ` (${b.reg})` : '')).join(', ') : '—'}</Row>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}
