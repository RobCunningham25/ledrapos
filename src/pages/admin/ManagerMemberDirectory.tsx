import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import { MEMBERSHIP_TYPE_COLORS, getMembershipLabel } from '@/constants/membershipTypes';

// Read-only member directory for the club-manager role. Deliberately fetched
// with a narrow .select() (never the get_members_with_auth RPC, which returns
// email and other contact fields) so no sensitive column ever reaches this page —
// no email, no WhatsApp, no credit/club-account/bar-tab data.
interface DirectoryMember {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  phone: string | null;
  is_active: boolean;
  sites: string[];
  sheds: string[];
  boats: { name: string; reg: string }[];
}

export default function ManagerMemberDirectory() {
  const { venueId } = useVenue();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [membersRes, sitesRes, shedsRes, boatsRes] = await Promise.all([
        supabase
          .from('members')
          .select('id, first_name, last_name, membership_number, membership_type, phone, is_active')
          .eq('venue_id', venueId)
          .order('last_name', { ascending: true }),
        supabase.from('member_sites').select('member_id, site_number').eq('venue_id', venueId),
        supabase.from('member_boat_sheds').select('member_id, shed_number').eq('venue_id', venueId),
        supabase.from('member_boats').select('member_id, boat_name, registration_number').eq('venue_id', venueId),
      ]);
      if (cancelled) return;

      const sitesByMember = new Map<string, string[]>();
      for (const r of (sitesRes.data as { member_id: string; site_number: string }[]) || []) {
        sitesByMember.set(r.member_id, [...(sitesByMember.get(r.member_id) || []), r.site_number]);
      }
      const shedsByMember = new Map<string, string[]>();
      for (const r of (shedsRes.data as { member_id: string; shed_number: string }[]) || []) {
        shedsByMember.set(r.member_id, [...(shedsByMember.get(r.member_id) || []), r.shed_number]);
      }
      const boatsByMember = new Map<string, { name: string; reg: string }[]>();
      for (const r of (boatsRes.data as { member_id: string; boat_name: string; registration_number: string | null }[]) || []) {
        boatsByMember.set(r.member_id, [...(boatsByMember.get(r.member_id) || []), { name: r.boat_name, reg: r.registration_number || '' }]);
      }

      const rows = ((membersRes.data as Omit<DirectoryMember, 'sites' | 'sheds' | 'boats'>[]) || []).map(m => ({
        ...m,
        sites: sitesByMember.get(m.id) || [],
        sheds: shedsByMember.get(m.id) || [],
        boats: boatsByMember.get(m.id) || [],
      }));
      setMembers(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [venueId]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(m =>
      m.first_name.toLowerCase().includes(q) ||
      m.last_name.toLowerCase().includes(q) ||
      m.membership_number.toLowerCase().includes(q) ||
      (m.phone && m.phone.toLowerCase().includes(q)) ||
      m.sites.some(s => s.toLowerCase().includes(q)) ||
      m.boats.some(b => b.name.toLowerCase().includes(q))
    );
  }, [members, searchQuery]);

  return (
    <AdminLayout title="Members">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#718096' }} />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            style={{ height: 40 }}
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membership #</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cell</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sites</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Boat Sheds</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Boats</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map(i => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-3" colSpan={8}><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!loading && filteredMembers.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>No members found</td>
              </tr>
            )}
            {filteredMembers.map(m => {
              const tc = MEMBERSHIP_TYPE_COLORS[m.membership_type] || MEMBERSHIP_TYPE_COLORS.member;
              return (
                <tr key={m.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{m.first_name} {m.last_name}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#718096', fontFamily: 'monospace' }}>{m.membership_number}</td>
                  <td className="px-4 py-3">
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                      fontSize: 12, fontWeight: 600, color: tc.text, background: tc.bg,
                    }}>
                      {getMembershipLabel(m.membership_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#2D2A26' }}>{m.phone || '—'}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#2D2A26' }}>{m.sites.length ? m.sites.join(', ') : '—'}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#2D2A26' }}>{m.sheds.length ? m.sheds.join(', ') : '—'}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#2D2A26' }}>
                    {m.boats.length ? m.boats.map(b => b.name + (b.reg ? ` (${b.reg})` : '')).join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1" style={{ fontSize: 13, fontWeight: 500, color: m.is_active ? '#1E8449' : '#C0392B' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.is_active ? '#1E8449' : '#C0392B', display: 'inline-block' }} />
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
