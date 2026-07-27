import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarClock, X, Loader2, Plus, Check, Ban } from 'lucide-react';

interface LeaveRequest {
  id: string;
  admin_user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'declined';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

interface AdminUserLite { id: string; name: string }

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  pending: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
  declined: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
};
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', approved: 'Approved', declined: 'Declined' };

function dateRange(start: string, end: string) {
  const s = format(new Date(start + 'T00:00:00'), 'd MMM yyyy');
  const e = format(new Date(end + 'T00:00:00'), 'd MMM yyyy');
  return start === end ? s : `${s} – ${e}`;
}

export default function Leave() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const isCommittee = adminUser?.role === 'admin' || adminUser?.role === 'superadmin';

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [admins, setAdmins] = useState<AdminUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const adminName = useCallback((id: string | null) => admins.find((a) => a.id === id)?.name ?? '—', [admins]);

  const fetchRequests = useCallback(async () => {
    if (!venueId || !adminUser) return;
    setLoading(true);
    let query = supabase
      .from('leave_requests')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });
    // Committee sees everyone's requests; a manager sees only their own.
    if (!isCommittee) query = query.eq('admin_user_id', adminUser.id);
    const { data, error } = await query;
    if (!error) setRequests((data as LeaveRequest[]) ?? []);
    setLoading(false);
  }, [venueId, adminUser, isCommittee]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    if (!venueId || !isCommittee) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('admin_users').select('id, name').eq('venue_id', venueId);
      if (!cancelled && data) setAdmins(data as AdminUserLite[]);
    })();
    return () => { cancelled = true; };
  }, [venueId, isCommittee]);

  const review = async (id: string, status: 'approved' | 'declined', notes: string) => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: adminUser?.id ?? null, reviewed_at: new Date().toISOString(), review_notes: notes.trim() || null })
      .eq('id', id);
    if (error) { toast.error('Could not update request.'); return; }
    toast.success(`Leave ${status}.`);
    await fetchRequests();
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const history = requests.filter((r) => r.status !== 'pending');

  return (
    <AdminLayout
      title={isCommittee ? 'Leave requests' : 'My Leave'}
      action={
        !isCommittee ? (
          <button
            onClick={() => setApplying(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6,
              fontSize: 13, fontWeight: 600, border: 'none', background: '#2E5FA3', color: '#FFFFFF', cursor: 'pointer',
            }}
          >
            <Plus size={15} /> Apply for leave
          </button>
        ) : undefined
      }
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <CalendarClock size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15 }}>No leave requests</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {isCommittee && (
            <section>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                Awaiting review ({pending.length})
              </h3>
              {pending.length === 0 ? (
                <p style={{ color: '#94A3B8', fontSize: 14 }}>Nothing awaiting review.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pending.map((r) => (
                    <ReviewCard key={r.id} request={r} requesterName={adminName(r.admin_user_id)} onReview={review} />
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              {isCommittee ? 'History' : 'My requests'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(isCommittee ? history : requests).map((r) => (
                <LeaveRow key={r.id} request={r} showName={isCommittee} name={adminName(r.admin_user_id)} reviewerName={adminName(r.reviewed_by)} />
              ))}
              {(isCommittee ? history : requests).length === 0 && (
                <p style={{ color: '#94A3B8', fontSize: 14 }}>Nothing here yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {applying && (
        <ApplyModal
          onClose={() => setApplying(false)}
          onSubmitted={async () => { setApplying(false); await fetchRequests(); }}
        />
      )}
    </AdminLayout>
  );
}

function LeaveRow({ request, showName, name, reviewerName }: {
  request: LeaveRequest; showName: boolean; name: string; reviewerName: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', background: '#FFFFFF',
      border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>
          {showName ? `${name} · ` : ''}{dateRange(request.start_date, request.end_date)}
        </div>
        {request.reason && <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{request.reason}</div>}
        {request.status !== 'pending' && request.reviewed_at && (
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            {STATUS_LABELS[request.status]} by {reviewerName} on {format(new Date(request.reviewed_at), 'd MMM yyyy')}
            {request.review_notes ? ` — ${request.review_notes}` : ''}
          </div>
        )}
      </div>
      <span style={{ ...STATUS_STYLES[request.status], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, flexShrink: 0 }}>
        {STATUS_LABELS[request.status]}
      </span>
    </div>
  );
}

function ReviewCard({ request, requesterName, onReview }: {
  request: LeaveRequest;
  requesterName: string;
  onReview: (id: string, status: 'approved' | 'declined', notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (status: 'approved' | 'declined') => {
    setBusy(true);
    await onReview(request.id, status, notes);
    setBusy(false);
  };

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>{requesterName}</div>
      <div style={{ fontSize: 14, color: '#334155', marginTop: 2 }}>{dateRange(request.start_date, request.end_date)}</div>
      {request.reason && <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>{request.reason}</div>}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional note to the requester…"
        style={{ width: '100%', fontSize: 13, padding: 9, borderRadius: 8, border: '1px solid #E2E8F0', marginTop: 12, fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => act('approved')} disabled={busy} style={{
          flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 8px', borderRadius: 6,
          fontSize: 13, fontWeight: 600, border: 'none', background: '#2A9D8F', color: '#FFFFFF', cursor: 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve
        </button>
        <button onClick={() => act('declined')} disabled={busy} style={{
          flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 8px', borderRadius: 6,
          fontSize: 13, fontWeight: 600, border: '1px solid #FECACA', background: '#FFFFFF', color: '#C0392B', cursor: 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          <Ban size={15} /> Decline
        </button>
      </div>
    </div>
  );
}

function ApplyModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => Promise<void> }) {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!startDate || !endDate) { toast.error('Choose start and end dates.'); return; }
    if (endDate < startDate) { toast.error('End date can’t be before the start date.'); return; }
    if (!adminUser) return;
    setSaving(true);
    const { error } = await supabase.from('leave_requests').insert({
      venue_id: venueId,
      admin_user_id: adminUser.id,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error('Could not submit request.'); return; }
    toast.success('Leave request submitted.');
    await onSubmitted();
  };

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 14, padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', fontFamily: 'inherit' };
  const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: '#FFFFFF', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.2)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>Apply for leave</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>From</div>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>To</div>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={fieldLabel}>Reason (optional)</div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Annual leave" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={submit} disabled={saving} style={{
            padding: '10px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, border: 'none', background: '#2E5FA3',
            color: '#FFFFFF', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.6 : 1,
          }}>
            {saving && <Loader2 size={16} className="animate-spin" />} Submit request
          </button>
        </div>
      </div>
    </div>
  );
}
