import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import MemberFavouritesDrawer from '@/components/admin/MemberFavouritesDrawer';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  is_active: boolean;
}

export default function Members() {
  const { venueId } = useVenue();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('members')
        .select('id, first_name, last_name, membership_number, membership_type, is_active')
        .eq('venue_id', venueId)
        .order('last_name');
      setMembers(data || []);
      setLoading(false);
    };
    fetch();
  }, [venueId]);

  return (
    <AdminLayout title="Members">
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membership #</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map(i => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-3" colSpan={5}><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!loading && members.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>No members found</td>
              </tr>
            )}
            {members.map(m => (
              <tr key={m.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{m.first_name} {m.last_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.membership_number}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs capitalize">{m.membership_type}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={m.is_active ? 'default' : 'secondary'} className="text-xs">
                    {m.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedMember(m)}>
                    Manage Favourites
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedMember && (
        <MemberFavouritesDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </AdminLayout>
  );
}
