import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import MemberDrawer from '@/components/admin/MemberDrawer';
import MemberFavouritesDrawer from '@/components/admin/MemberFavouritesDrawer';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Loader2, Plus, Eye, Pencil, Star, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  is_active: boolean;
  auth_user_id: string | null;
  email: string | null;
  phone: string | null;
  partner_name: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
}

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  member: { text: '#2E5FA3', bg: 'rgba(46,95,163,0.1)' },
  associate: { text: '#D68910', bg: 'rgba(214,137,16,0.1)' },
  honorary: { text: '#1E8449', bg: 'rgba(30,132,73,0.1)' },
};

export default function Members() {
  const navigate = useNavigate();
  const { venueId } = useVenue();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, membership_number, membership_type, is_active, auth_user_id, email, phone, partner_name, partner_first_name, partner_last_name')
      .eq('venue_id', venueId)
      .order('last_name');
    setMembers((data as Member[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [venueId]);

  const handleInvite = async (member: Member) => {
    setInvitingId(member.id);
    try {
      const res = await supabase.functions.invoke('invite-member', {
        body: { member_id: member.id, venue_id: venueId },
      });
      if (res.error) {
        toast.error(res.error.message || 'Failed to send invite');
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Invite sent to ${member.email}`);
        await fetchMembers();
      }
    } catch {
      toast.error('Failed to send invite');
    }
    setInvitingId(null);
  };

  const filteredMembers = useMemo(() => {
    let result = members;
    if (typeFilter !== 'all') {
      result = result.filter(m => m.membership_type === typeFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(m => statusFilter === 'active' ? m.is_active : !m.is_active);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.first_name.toLowerCase().includes(q) ||
        m.last_name.toLowerCase().includes(q) ||
        m.membership_number.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
      );
    }
    return result;
  }, [members, searchQuery, typeFilter, statusFilter]);

  const openAddDrawer = () => { setEditMember(null); setDrawerOpen(true); };
  const openEditDrawer = (m: Member) => { setEditMember(m); setDrawerOpen(true); };

  return (
    <AdminLayout title="Members" action={
      <Button onClick={openAddDrawer} style={{ height: 40, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6 }}>
        <Plus className="h-4 w-4 mr-2" />
        Add Member
      </Button>
    }>
      {/* Filters */}
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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger style={{ width: 140, height: 40 }}>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="associate">Associate</SelectItem>
            <SelectItem value="honorary">Honorary</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger style={{ width: 140, height: 40 }}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membership #</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Portal</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map(i => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-3" colSpan={7}><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!loading && filteredMembers.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>No members found</td>
              </tr>
            )}
            {filteredMembers.map(m => {
              const tc = TYPE_COLORS[m.membership_type] || TYPE_COLORS.member;
              return (
                <tr key={m.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{m.first_name} {m.last_name}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#718096', fontFamily: 'monospace' }}>{m.membership_number}</td>
                  <td className="px-4 py-3">
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                      fontSize: 12, fontWeight: 600, color: tc.text, background: tc.bg,
                    }}>
                      {m.membership_type.charAt(0).toUpperCase() + m.membership_type.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: '#718096', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1" style={{ fontSize: 13, fontWeight: 500, color: m.is_active ? '#1E8449' : '#C0392B' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.is_active ? '#1E8449' : '#C0392B', display: 'inline-block' }} />
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.auth_user_id ? (
                      <span className="inline-flex items-center gap-1" style={{ fontSize: 13, fontWeight: 500, color: '#1E8449' }}>
                        <Check size={14} /> Invited
                      </span>
                    ) : (
                      m.email ? (
                        <button
                          disabled={invitingId === m.id}
                          onClick={() => handleInvite(m)}
                          className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
                          style={{
                            padding: '4px 10px', border: '1px solid #2E5FA3', color: '#2E5FA3',
                            background: 'transparent', borderRadius: 6, cursor: invitingId === m.id ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={e => { if (invitingId !== m.id) { (e.target as HTMLElement).style.background = '#2E5FA3'; (e.target as HTMLElement).style.color = '#FFFFFF'; } }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#2E5FA3'; }}
                        >
                          {invitingId === m.id ? <Loader2 size={14} className="animate-spin" /> : null}
                          {invitingId === m.id ? 'Sending...' : 'Invite'}
                        </button>
                      ) : null
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/admin/members/${m.id}`)}
                        title="View"
                        className="w-8 h-8 flex items-center justify-center rounded transition-colors"
                        style={{ color: '#718096' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#2E5FA3')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#718096')}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => openEditDrawer(m)}
                        title="Edit"
                        className="w-8 h-8 flex items-center justify-center rounded transition-colors"
                        style={{ color: '#718096' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#2E5FA3')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#718096')}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setSelectedMember(m)}
                        title="Favourites"
                        className="w-8 h-8 flex items-center justify-center rounded transition-colors"
                        style={{ color: '#718096' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#2E5FA3')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#718096')}
                      >
                        <Star size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedMember && (
        <MemberFavouritesDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}

      <MemberDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        venueId={venueId}
        member={editMember}
        onSuccess={fetchMembers}
      />
    </AdminLayout>
  );
}
