import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { X, Loader2, Printer, Bell, Check, UserPlus, ExternalLink } from 'lucide-react';
import { formatZAR, type MembershipCategory } from '@/utils/membershipFees';
import { buildMemberNotificationEmail } from '@/utils/buildMemberNotificationEmail';
import type { Application } from '@/pages/admin/Applications';

const CATEGORY_LABELS: Record<string, string> = {
  ordinary: 'Ordinary Member',
  social: 'Social Member',
  intermediate: 'Intermediate Member',
  junior: 'Junior Member',
  crew_visitor: 'Crew Visitor',
};

const T = {
  navy: '#1B3A4B',
  teal: '#2A9D8F',
  border: '#E2E8F0',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  error: '#DC2626',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.textMuted, width: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1A202C' }}>{value}</span>
    </div>
  );
}

interface Props {
  application: Application;
  venueId: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onCreateMember: (app: Application) => void;
}

export default function ApplicationDrawer({ application: app, venueId, onClose, onRefresh, onCreateMember }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState(app.reviewer_notes ?? '');
  const [notesChanged, setNotesChanged] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [approvingStatus, setApprovingStatus] = useState<null | 'approved' | 'rejected'>(null);
  const [notifying, setNotifying] = useState(false);

  // Load signed URL for photo
  useEffect(() => {
    if (!app.photo_url) return;
    (async () => {
      const { data } = await supabase.storage
        .from('application-photos')
        .createSignedUrl(app.photo_url!, 60 * 60 * 24 * 30); // 30 days
      if (data?.signedUrl) setPhotoUrl(data.signedUrl);
    })();
  }, [app.photo_url]);

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from('membership_applications')
      .update({ reviewer_notes: notes })
      .eq('id', app.id);
    if (error) toast.error('Failed to save notes.');
    else { toast.success('Notes saved.'); setNotesChanged(false); }
    setSavingNotes(false);
  };

  const updateStatus = async (status: 'approved' | 'rejected') => {
    setApprovingStatus(status);
    const { data: { session } } = await supabase.auth.getSession();
    const adminEmail = session?.user?.email;

    // Fetch admin user id
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('venue_id', venueId)
      .eq('email', adminEmail ?? '')
      .single();

    const { error } = await supabase
      .from('membership_applications')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminRow?.id ?? null,
        reviewer_notes: notes,
      })
      .eq('id', app.id);

    if (error) {
      toast.error(`Failed to ${status === 'approved' ? 'approve' : 'reject'} application.`);
    } else {
      toast.success(status === 'approved' ? 'Application approved.' : 'Application rejected.');
      await onRefresh();
    }
    setApprovingStatus(null);
  };

  const notifyMembers = async () => {
    setNotifying(true);
    try {
      // Get venue details
      const { data: venue } = await supabase.from('venues').select('name, broadcast_from_email').eq('id', venueId).single();

      const { subject, body_html } = buildMemberNotificationEmail({
        venueName: venue?.name ?? 'Vaal Cruising Association',
        applicantFirstNames: app.first_names,
        applicantSurname: app.surname,
        partnerName: app.partner_name,
        membershipCategory: app.membership_category as MembershipCategory,
        boats: app.boats,
        photoSignedUrl: photoUrl,
      });

      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('send-broadcast', {
        body: {
          venue_id: venueId,
          subject,
          body_html,
          recipient_filter: {},
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.error) throw new Error(res.error.message);

      // Mark notification sent
      await supabase
        .from('membership_applications')
        .update({ interview_conducted_at: new Date().toISOString(), members_notified_at: new Date().toISOString() })
        .eq('id', app.id);

      toast.success('Members notified successfully.');
      await onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to notify members.');
    } finally {
      setNotifying(false);
    }
  };

  const openPrintNotice = () => {
    window.open(`/vca/admin/applications/${app.id}/notice`, '_blank', 'noopener');
  };

  const fees = app.calculated_fees;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />

      {/* Drawer */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 560,
        height: '100%',
        background: '#FFFFFF',
        overflowY: 'auto',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.navy }}>{app.first_names} {app.surname}</div>
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>
              {CATEGORY_LABELS[app.membership_category] ?? app.membership_category} · {format(new Date(app.created_at), 'd MMM yyyy')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}>
            <X size={20} color={T.textSecondary} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* Status badge */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatusBadge status={app.status} />
            {app.members_notified_at && (
              <span style={{ fontSize: 12, color: T.teal, background: 'rgba(42,157,143,0.08)', padding: '3px 10px', borderRadius: 4, fontWeight: 600 }}>
                Members notified {format(new Date(app.members_notified_at), 'd MMM yyyy')}
              </span>
            )}
            {app.member_id && (
              <span style={{ fontSize: 12, color: '#059669', background: '#D1FAE5', padding: '3px 10px', borderRadius: 4, fontWeight: 600 }}>
                Member record created
              </span>
            )}
          </div>

          {/* Photo */}
          {photoUrl && (
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
              <img src={photoUrl} alt={`${app.first_names} ${app.surname}`} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, border: `1px solid ${T.border}`, objectFit: 'cover' }} />
            </div>
          )}

          {/* Personal */}
          <Section title="Personal details">
            <Row label="Surname" value={app.surname} />
            <Row label="First names" value={app.first_names} />
            <Row label="ID number" value={app.id_number} />
            <Row label="Date of birth" value={app.date_of_birth ? format(new Date(app.date_of_birth + 'T00:00:00'), 'd MMM yyyy') : null} />
            <Row label="Mobile" value={app.contact_mobile} />
            <Row label="Work" value={app.contact_work} />
            <Row label="Home" value={app.contact_home} />
            <Row label="Email" value={app.email} />
            <Row label="Postal address" value={[app.postal_address, app.postal_code].filter(Boolean).join(', ')} />
            <Row label="Home address" value={[app.home_address, app.home_code].filter(Boolean).join(', ')} />
            <Row label="Emergency contact" value={[app.emergency_contact_name, app.emergency_contact_number].filter(Boolean).join(' — ')} />
            <Row label="Occupation" value={[app.occupation, app.employer, app.business_type].filter(Boolean).join(' · ')} />
            <Row label="Other clubs" value={app.other_clubs} />
          </Section>

          {/* Family */}
          <Section title="Family">
            {app.partner_name && <Row label="Partner" value={[app.partner_name, app.partner_dob ? format(new Date(app.partner_dob + 'T00:00:00'), 'd MMM yyyy') : null].filter(Boolean).join(', ')} />}
            {(app.children ?? []).map((c, i) => (
              <Row key={i} label={`Child ${i + 1} (under 12)`} value={[c.name, c.dob ? format(new Date(c.dob + 'T00:00:00'), 'd MMM yyyy') : null].filter(Boolean).join(', ')} />
            ))}
            {(app.addon_members ?? []).map((m, i) => (
              <Row key={i} label={m.category === 'intermediate' ? `Intermediate (19–30)` : `Junior (12–18)`} value={[m.name, m.dob ? format(new Date(m.dob + 'T00:00:00'), 'd MMM yyyy') : null].filter(Boolean).join(', ')} />
            ))}
            {!app.partner_name && !(app.children?.length) && !(app.addon_members?.length) && <p style={{ fontSize: 13, color: T.textMuted }}>None specified</p>}
          </Section>

          {/* Boats */}
          <Section title="Vessels & experience">
            {app.boating_experience && <p style={{ fontSize: 13, color: '#334155', marginBottom: 12, lineHeight: 1.6 }}>{app.boating_experience}</p>}
            {(app.boats ?? []).map((b, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, color: '#1A202C', fontWeight: 600 }}>{b.name}</span>
                <span style={{ fontSize: 12, color: T.textSecondary }}> · {b.type}{b.reg_no ? ` · Reg: ${b.reg_no}` : ''} · {b.ownership}</span>
              </div>
            ))}
            {!app.boating_experience && !(app.boats?.length) && <p style={{ fontSize: 13, color: T.textMuted }}>None specified</p>}
          </Section>

          {/* Fees */}
          {fees && (
            <Section title="Calculated fees">
              {fees.joining_fee_cents > 0 && <Row label="Joining fee (once-off)" value={formatZAR(fees.joining_fee_cents)} />}
              {fees.land_levy_cents > 0 && <Row label="Levy (first 5 years, per year)" value={formatZAR(fees.land_levy_cents)} />}
              <Row label={`Pro-rata subs (${fees.months_remaining} months)`} value={formatZAR(fees.pro_rata_subs_cents)} />
              {(fees.addon_breakdown ?? []).map((item, i) => (
                <Row key={i} label={item.label} value={formatZAR(item.cents)} />
              ))}
              <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>Total due</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>{formatZAR(fees.total_cents)}</span>
              </div>
            </Section>
          )}

          {/* Reviewer notes */}
          <Section title="Reviewer notes">
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesChanged(true); }}
              placeholder="Internal notes visible only to admins…"
              style={{
                width: '100%', padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 6,
                fontSize: 13, resize: 'vertical', minHeight: 80, boxSizing: 'border-box', outline: 'none',
              }}
            />
            {notesChanged && (
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                style={{ marginTop: 8, padding: '6px 16px', background: T.navy, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer' }}
              >
                {savingNotes ? 'Saving…' : 'Save notes'}
              </button>
            )}
          </Section>
        </div>

        {/* Action footer */}
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '16px 24px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Notify + Print row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionButton
              icon={<Bell size={15} />}
              label={app.members_notified_at ? `Notified ${format(new Date(app.members_notified_at), 'd MMM')}` : 'Notify Members'}
              onClick={notifyMembers}
              loading={notifying}
              disabled={!!app.members_notified_at || notifying}
              variant="secondary"
              title={app.members_notified_at ? 'Members have already been notified' : 'Send redacted introduction email to all members'}
            />
            <ActionButton
              icon={<Printer size={15} />}
              label="Print Notice"
              onClick={openPrintNotice}
              variant="secondary"
              title="Open printable notice board version"
            />
            {app.status === 'approved' && !app.member_id && (
              <ActionButton
                icon={<UserPlus size={15} />}
                label="Create Member"
                onClick={() => onCreateMember(app)}
                variant="primary"
                title="Create a member record from this application"
              />
            )}
            {app.status === 'approved' && app.member_id && (
              <ActionButton
                icon={<ExternalLink size={15} />}
                label="View Member"
                onClick={() => window.open(`/vca/admin/members/${app.member_id}`, '_blank')}
                variant="secondary"
              />
            )}
          </div>

          {/* Approve/Reject row */}
          {app.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionButton
                icon={approvingStatus === 'rejected' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                label="Reject"
                onClick={() => updateStatus('rejected')}
                loading={approvingStatus === 'rejected'}
                disabled={!!approvingStatus}
                variant="danger"
                fullWidth
              />
              <ActionButton
                icon={approvingStatus === 'approved' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                label="Approve"
                onClick={() => updateStatus('approved')}
                loading={approvingStatus === 'approved'}
                disabled={!!approvingStatus}
                variant="success"
                fullWidth
              />
            </div>
          )}
          {app.status === 'approved' && (
            <div style={{ fontSize: 12, color: '#059669', textAlign: 'center' }}>
              Approved {app.reviewed_at ? format(new Date(app.reviewed_at), 'd MMM yyyy') : ''}
            </div>
          )}
          {app.status === 'rejected' && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ActionButton
                icon={<Check size={15} />}
                label="Reopen (set pending)"
                onClick={() => updateStatus('approved')}
                disabled={!!approvingStatus}
                variant="secondary"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    pending: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
    approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
    rejected: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
  };
  return (
    <span style={{ ...styles[status], fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 4, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function ActionButton({
  icon, label, onClick, loading, disabled, variant, fullWidth, title,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant: 'primary' | 'secondary' | 'danger' | 'success';
  fullWidth?: boolean;
  title?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: '#1B3A4B', color: '#FFFFFF', border: 'none' },
    secondary: { background: '#FFFFFF', color: '#475569', border: '1px solid #E2E8F0' },
    danger: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
    success: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      style={{
        ...styles[variant],
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        flex: fullWidth ? 1 : undefined,
        justifyContent: 'center',
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
