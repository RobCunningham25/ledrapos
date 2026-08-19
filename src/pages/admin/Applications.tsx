import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { UserPlus } from 'lucide-react';
import ApplicationDrawer from '@/components/admin/ApplicationDrawer';

export interface Application {
  id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  membership_category: string;
  surname: string;
  first_names: string;
  email: string;
  contact_mobile: string;
  id_number: string | null;
  date_of_birth: string | null;
  postal_address: string | null;
  postal_code: string | null;
  home_address: string | null;
  home_code: string | null;
  contact_work: string | null;
  contact_home: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  occupation: string | null;
  employer: string | null;
  business_type: string | null;
  other_clubs: string | null;
  partner_name: string | null;
  partner_dob: string | null;
  children: { name: string; dob: string }[] | null;
  addon_members: { category: 'junior' | 'intermediate'; name: string; dob: string }[] | null;
  boating_experience: string | null;
  boats: { type: string; name: string; reg_no: string; ownership: string }[] | null;
  photo_url: string | null;
  calculated_fees: {
    joining_fee_cents: number;
    land_levy_cents: number;
    pro_rata_subs_cents: number;
    months_remaining: number;
    addon_fees_cents?: number;
    addon_breakdown?: { label: string; cents: number }[];
    total_cents: number;
  } | null;
  interview_conducted_at: string | null;
  members_notified_at: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  member_id: string | null;
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  pending: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
  rejected: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
};

const CATEGORY_LABELS: Record<string, string> = {
  ordinary: 'Ordinary',
  social: 'Social',
  intermediate: 'Intermediate',
  junior: 'Junior',
  crew_visitor: 'Crew Visitor',
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function Applications() {
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Application | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('membership_applications')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (!error) setApplications((data as Application[]) ?? []);
    setLoading(false);
  }, [venueId, statusFilter]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const handleCreateMember = (app: Application) => {
    // MEMBER_TYPE_FROM_CATEGORY: application categories (ordinary/social/intermediate/
    // junior/crew_visitor) aren't the same domain as members.membership_type
    // (ordinary/pensioner/honorary/member/associate) — map the ones with an obvious
    // match and fall back to 'ordinary' rather than passing through an invalid value.
    const MEMBER_TYPE_FROM_CATEGORY: Record<string, string> = {
      ordinary: 'ordinary',
      crew_visitor: 'associate',
    };
    const partnerParts = (app.partner_name ?? '').trim().split(/\s+/).filter(Boolean);
    const homeAddress = [app.home_address?.trim(), app.home_code?.trim()].filter(Boolean).join(', ');

    // Navigate to members page with pre-fill state; Members.tsx opens the Add
    // Member drawer pre-filled and links membership_applications.member_id
    // back once the member is saved.
    navigate(adminPath('members'), {
      state: {
        prefill: {
          first_name: app.first_names.trim().split(' ')[0] ?? app.first_names.trim(),
          last_name: app.surname.trim(),
          email: app.email,
          phone: app.contact_mobile,
          home_address: homeAddress,
          emergency_contact_name: app.emergency_contact_name?.trim() ?? '',
          emergency_contact_phone: app.emergency_contact_number?.trim() ?? '',
          partner_first_name: partnerParts[0] ?? '',
          partner_last_name: partnerParts.slice(1).join(' '),
          membership_type: MEMBER_TYPE_FROM_CATEGORY[app.membership_category] ?? 'ordinary',
          application_id: app.id,
          boats: (app.boats ?? []).map(b => ({ name: b.name, reg: b.reg_no })),
          children: (app.children ?? []).map(c => ({ name: c.name, dob: c.dob })),
        },
      },
    });
    toast.info('Member details pre-filled from application.');
  };

  return (
    <AdminLayout
      title="Applications"
      action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid #E2E8F0',
                background: statusFilter === s ? '#1B3A4B' : '#FFFFFF',
                color: statusFilter === s ? '#FFFFFF' : '#475569',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : applications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <UserPlus size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15 }}>No {statusFilter !== 'all' ? statusFilter : ''} applications</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {applications.map((app) => (
            <button
              key={app.id}
              onClick={() => setSelected(app)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 18px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1A202C' }}>
                  {app.first_names} {app.surname}
                </div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                  {CATEGORY_LABELS[app.membership_category] ?? app.membership_category} · {app.email}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {app.members_notified_at && (
                  <span style={{ fontSize: 11, color: '#2A9D8F', background: 'rgba(42,157,143,0.08)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                    Members notified
                  </span>
                )}
                <span style={{ ...STATUS_STYLES[app.status], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4 }}>
                  {app.status}
                </span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  {format(new Date(app.created_at), 'd MMM yyyy')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ApplicationDrawer
          application={selected}
          venueId={venueId}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            await fetchApplications();
            // Re-select the updated record
            const { data } = await supabase.from('membership_applications').select('*').eq('id', selected.id).single();
            if (data) setSelected(data as Application);
          }}
          onCreateMember={handleCreateMember}
        />
      )}
    </AdminLayout>
  );
}
