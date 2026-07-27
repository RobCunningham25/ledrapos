import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ClipboardList, X, Loader2, Plus, Trash2 } from 'lucide-react';

interface StaffJob {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  priority: 'low' | 'normal' | 'high';
  due_date: string | null;
  status: 'open' | 'in_progress' | 'done';
  manager_notes: string | null;
  created_at: string;
  completed_at: string | null;
}

interface AdminUserLite {
  id: string;
  name: string;
  role: string;
}

const PRIORITY_STYLES: Record<string, React.CSSProperties> = {
  low: { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' },
  normal: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' },
  high: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
};
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High' };

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  open: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  in_progress: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' },
  done: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
};
const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In progress', done: 'Done' };

type StatusFilter = 'all' | 'open' | 'in_progress' | 'done';

export default function Jobs() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const isManager = adminUser?.role === 'manager';
  const isCommittee = adminUser?.role === 'admin' || adminUser?.role === 'superadmin';

  const [jobs, setJobs] = useState<StaffJob[]>([]);
  const [admins, setAdmins] = useState<AdminUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selected, setSelected] = useState<StaffJob | null>(null);
  const [creating, setCreating] = useState(false);

  const adminName = useCallback((id: string | null) => admins.find((a) => a.id === id)?.name ?? '—', [admins]);

  const fetchJobs = useCallback(async () => {
    if (!venueId || !adminUser) return;
    setLoading(true);
    let query = supabase
      .from('staff_jobs')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });
    if (isManager) query = query.eq('assigned_to', adminUser.id);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (!error) setJobs((data as StaffJob[]) ?? []);
    setLoading(false);
  }, [venueId, adminUser, isManager, statusFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Committee needs the roster for the assignee dropdown + name display.
  useEffect(() => {
    if (!venueId || !isCommittee) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('admin_users')
        .select('id, name, role')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (!cancelled && data) setAdmins(data as AdminUserLite[]);
    })();
    return () => { cancelled = true; };
  }, [venueId, isCommittee]);

  const refreshSelected = async (id: string) => {
    await fetchJobs();
    const { data } = await supabase.from('staff_jobs').select('*').eq('id', id).single();
    if (data) setSelected(data as StaffJob);
  };

  return (
    <AdminLayout
      title={isManager ? 'My Jobs' : 'Jobs'}
      action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'open', 'in_progress', 'done'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0',
                background: statusFilter === s ? '#1B3A4B' : '#FFFFFF',
                color: statusFilter === s ? '#FFFFFF' : '#475569', cursor: 'pointer',
              }}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
          {isCommittee && (
            <button
              onClick={() => { setCreating(true); setSelected(null); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6,
                fontSize: 13, fontWeight: 600, border: 'none', background: '#2E5FA3', color: '#FFFFFF', cursor: 'pointer',
              }}
            >
              <Plus size={15} /> Assign job
            </button>
          )}
        </div>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <ClipboardList size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15 }}>No {statusFilter !== 'all' ? STATUS_LABELS[statusFilter].toLowerCase() : ''} jobs</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map((j) => (
            <button
              key={j.id}
              onClick={() => { setSelected(j); setCreating(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', background: '#FFFFFF',
                border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ ...PRIORITY_STYLES[j.priority], fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
                    {PRIORITY_LABELS[j.priority]}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {j.title}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#64748B' }}>
                  {isCommittee && <span>{adminName(j.assigned_to)} · </span>}
                  {j.due_date ? `Due ${format(new Date(j.due_date + 'T00:00:00'), 'd MMM yyyy')}` : 'No due date'}
                </div>
              </div>
              <span style={{ ...STATUS_STYLES[j.status], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, flexShrink: 0 }}>
                {STATUS_LABELS[j.status]}
              </span>
            </button>
          ))}
        </div>
      )}

      {(selected || creating) && (
        <JobDrawer
          job={selected}
          admins={admins}
          isCommittee={isCommittee}
          onClose={() => { setSelected(null); setCreating(false); }}
          onSavedNew={async () => { await fetchJobs(); setCreating(false); }}
          onRefresh={refreshSelected}
        />
      )}
    </AdminLayout>
  );
}

function JobDrawer({ job, admins, isCommittee, onClose, onSavedNew, onRefresh }: {
  job: StaffJob | null;
  admins: AdminUserLite[];
  isCommittee: boolean;
  onClose: () => void;
  onSavedNew: () => Promise<void>;
  onRefresh: (id: string) => Promise<void>;
}) {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const isNew = !job;
  const managerDefault = admins.find((a) => a.role === 'manager')?.id ?? '';

  const [title, setTitle] = useState(job?.title ?? '');
  const [description, setDescription] = useState(job?.description ?? '');
  const [assignedTo, setAssignedTo] = useState(job?.assigned_to ?? managerDefault);
  const [priority, setPriority] = useState<StaffJob['priority']>(job?.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(job?.due_date ?? '');
  const [managerNotes, setManagerNotes] = useState(job?.manager_notes ?? '');
  const [saving, setSaving] = useState(false);

  // Committee create / edit of the job definition.
  const saveJob = async () => {
    if (!title.trim()) { toast.error('A title is required.'); return; }
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      assigned_to: assignedTo || null,
      priority,
      due_date: dueDate || null,
    };
    if (isNew) {
      const { error } = await supabase.from('staff_jobs').insert({
        ...payload, venue_id: venueId, assigned_by: adminUser?.id ?? null,
      });
      setSaving(false);
      if (error) { toast.error('Could not create job.'); return; }
      toast.success('Job assigned.');
      await onSavedNew();
      onClose();
    } else {
      const { error } = await supabase.from('staff_jobs').update(payload).eq('id', job.id);
      setSaving(false);
      if (error) { toast.error('Could not save job.'); return; }
      toast.success('Job updated.');
      await onRefresh(job.id);
    }
  };

  const deleteJob = async () => {
    if (!job) return;
    if (!confirm('Delete this job?')) return;
    setSaving(true);
    const { error } = await supabase.from('staff_jobs').delete().eq('id', job.id);
    setSaving(false);
    if (error) { toast.error('Could not delete job.'); return; }
    toast.success('Job deleted.');
    await onSavedNew();
    onClose();
  };

  // Manager progresses status + records notes.
  const updateStatus = async (status: StaffJob['status']) => {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase
      .from('staff_jobs')
      .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
      .eq('id', job.id);
    setSaving(false);
    if (error) { toast.error('Could not update status.'); return; }
    toast.success(`Marked as ${STATUS_LABELS[status].toLowerCase()}.`);
    await onRefresh(job.id);
  };

  const saveNotes = async () => {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase.from('staff_jobs').update({ manager_notes: managerNotes.trim() || null }).eq('id', job.id);
    setSaving(false);
    if (error) { toast.error('Could not save notes.'); return; }
    toast.success('Notes saved.');
    await onRefresh(job.id);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 14, padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', fontFamily: 'inherit',
  };
  const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 6 };
  const primaryBtn: React.CSSProperties = {
    marginTop: 4, padding: '9px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, border: 'none',
    background: '#2A9D8F', color: '#FFFFFF', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480, height: '100%', background: '#FFFFFF',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', margin: 0 }}>
            {isNew ? 'Assign a job' : job.title}
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>

        {isCommittee ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={fieldLabel}>Title</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Repair caravan site 2 water tap" style={inputStyle} />
            </div>
            <div>
              <div style={fieldLabel}>Details</div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Any extra context…" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <div style={fieldLabel}>Assign to</div>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={inputStyle}>
                <option value="">— Unassigned —</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.role === 'manager' ? ' (Manager)' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={fieldLabel}>Priority</div>
                <select value={priority} onChange={(e) => setPriority(e.target.value as StaffJob['priority'])} style={inputStyle}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={fieldLabel}>Due date</div>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={saveJob} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving && <Loader2 size={16} className="animate-spin" />} {isNew ? 'Assign job' : 'Save changes'}
              </button>
              {!isNew && (
                <button onClick={deleteJob} disabled={saving} style={{
                  padding: '9px 14px', borderRadius: 6, fontSize: 14, fontWeight: 600, border: '1px solid #FECACA',
                  background: '#FFFFFF', color: '#C0392B', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <Trash2 size={15} /> Delete
                </button>
              )}
            </div>

            {!isNew && (
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
                <div style={fieldLabel}>Manager's progress notes</div>
                <div style={{ fontSize: 14, color: job.manager_notes ? '#334155' : '#94A3B8', whiteSpace: 'pre-wrap' }}>
                  {job.manager_notes || 'No notes yet.'}
                </div>
                <div style={{ marginTop: 10 }}>
                  <span style={{ ...STATUS_STYLES[job.status], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4 }}>
                    {STATUS_LABELS[job.status]}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Manager view — read the brief, progress status, add notes.
          job && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...PRIORITY_STYLES[job.priority], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4 }}>
                  {PRIORITY_LABELS[job.priority]}
                </span>
                {job.due_date && (
                  <span style={{ fontSize: 13, color: '#64748B' }}>Due {format(new Date(job.due_date + 'T00:00:00'), 'd MMM yyyy')}</span>
                )}
              </div>
              {job.description && (
                <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, padding: 16, fontSize: 14, lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-wrap' }}>
                  {job.description}
                </div>
              )}
              <div>
                <div style={fieldLabel}>Update status</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['open', 'in_progress', 'done'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(s)}
                      disabled={saving || job.status === s}
                      style={{
                        flex: 1, padding: '9px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0',
                        cursor: job.status === s ? 'default' : 'pointer',
                        background: job.status === s ? '#1B3A4B' : '#FFFFFF',
                        color: job.status === s ? '#FFFFFF' : '#475569', opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>My notes</div>
                <textarea value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} rows={4} placeholder="Progress, blockers, what you did…" style={{ ...inputStyle, resize: 'vertical' }} />
                <button onClick={saveNotes} disabled={saving} style={{ ...primaryBtn, marginTop: 10, opacity: saving ? 0.6 : 1 }}>
                  {saving && <Loader2 size={16} className="animate-spin" />} Save notes
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
