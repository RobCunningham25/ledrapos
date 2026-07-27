import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { MessageSquare, X, Loader2, Wrench } from 'lucide-react';

interface IssueReport {
  id: string;
  created_at: string;
  category: 'issue' | 'suggestion' | 'other';
  message: string;
  attachment_paths: string[];
  reporter_name: string | null;
  reporter_email: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  admin_notes: string | null;
  resolved_at: string | null;
  remedy: string | null;
  remedied_by: string | null;
  remedied_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  issue: 'Issue',
  suggestion: 'Suggestion',
  other: 'Other',
};

const CATEGORY_STYLES: Record<string, React.CSSProperties> = {
  issue: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
  suggestion: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' },
  other: { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' },
};

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  open: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  in_progress: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' },
  resolved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved';

export default function Issues() {
  const { venueId } = useVenue();
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selected, setSelected] = useState<IssueReport | null>(null);

  const fetchReports = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    let query = supabase
      .from('issue_reports')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (!error) setReports((data as IssueReport[]) ?? []);
    setLoading(false);
  }, [venueId, statusFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  return (
    <AdminLayout
      title="Issues & Suggestions"
      action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'open', 'in_progress', 'resolved'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: '1px solid #E2E8F0',
                background: statusFilter === s ? '#1B3A4B' : '#FFFFFF',
                color: statusFilter === s ? '#FFFFFF' : '#475569',
                cursor: 'pointer',
              }}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <MessageSquare size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15 }}>No {statusFilter !== 'all' ? STATUS_LABELS[statusFilter].toLowerCase() : ''} reports</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8,
                cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ ...CATEGORY_STYLES[r.category], fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
                    {CATEGORY_LABELS[r.category]}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>
                    {r.reporter_name || 'Member'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.message}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {r.remedy && (
                  <span title="Remedy recorded" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                    <Wrench size={11} /> Remedy
                  </span>
                )}
                {r.attachment_paths?.length > 0 && (
                  <span style={{ fontSize: 11, color: '#2A9D8F', background: 'rgba(42,157,143,0.08)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                    {r.attachment_paths.length} photo{r.attachment_paths.length > 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ ...STATUS_STYLES[r.status], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4 }}>
                  {STATUS_LABELS[r.status]}
                </span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  {format(new Date(r.created_at), 'd MMM yyyy')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <IssueDrawer
          report={selected}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            await fetchReports();
            const { data } = await supabase.from('issue_reports').select('*').eq('id', selected.id).single();
            if (data) setSelected(data as IssueReport);
          }}
        />
      )}
    </AdminLayout>
  );
}

function IssueDrawer({ report, onClose, onRefresh }: {
  report: IssueReport;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { adminUser } = useAdminAuth();
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState(report.admin_notes ?? '');
  const [remedy, setRemedy] = useState(report.remedy ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!report.attachment_paths?.length) { setPhotoUrls([]); return; }
      const urls: string[] = [];
      for (const path of report.attachment_paths) {
        const { data } = await supabase.storage.from('issue-attachments').createSignedUrl(path, 60 * 60);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (!cancelled) setPhotoUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [report.id, report.attachment_paths]);

  useEffect(() => { setNotes(report.admin_notes ?? ''); }, [report.id, report.admin_notes]);
  useEffect(() => { setRemedy(report.remedy ?? ''); }, [report.id, report.remedy]);

  const updateStatus = async (status: IssueReport['status']) => {
    setSaving(true);
    const { error } = await supabase
      .from('issue_reports')
      .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
      .eq('id', report.id);
    setSaving(false);
    if (error) { toast.error('Could not update status.'); return; }
    toast.success(`Marked as ${STATUS_LABELS[status].toLowerCase()}.`);
    await onRefresh();
  };

  const saveNotes = async () => {
    setSaving(true);
    const { error } = await supabase.from('issue_reports').update({ admin_notes: notes.trim() || null }).eq('id', report.id);
    setSaving(false);
    if (error) { toast.error('Could not save notes.'); return; }
    toast.success('Notes saved.');
    await onRefresh();
  };

  const saveRemedy = async () => {
    setSaving(true);
    const trimmed = remedy.trim();
    const { error } = await supabase
      .from('issue_reports')
      .update({
        remedy: trimmed || null,
        remedied_by: trimmed ? adminUser?.id ?? null : null,
        remedied_at: trimmed ? new Date().toISOString() : null,
      })
      .eq('id', report.id);
    setSaving(false);
    if (error) { toast.error('Could not save remedy.'); return; }
    toast.success('Remedy saved.');
    await onRefresh();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480, height: '100%', background: '#FFFFFF',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ ...CATEGORY_STYLES[report.category], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4 }}>
              {CATEGORY_LABELS[report.category]}
            </span>
            <span style={{ ...STATUS_STYLES[report.status], fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4 }}>
              {STATUS_LABELS[report.status]}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1A202C' }}>{report.reporter_name || 'Member'}</div>
          {report.reporter_email && (
            <a href={`mailto:${report.reporter_email}`} style={{ fontSize: 13, color: '#2A9D8F' }}>{report.reporter_email}</a>
          )}
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            {format(new Date(report.created_at), 'EEEE d MMM yyyy, HH:mm')}
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 14, lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-wrap' }}>
          {report.message}
        </div>

        {photoUrls.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>Photos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`attachment ${i + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2E8F0', display: 'block' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Status controls */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>Update status</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['open', 'in_progress', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={saving || report.status === s}
                style={{
                  flex: 1, padding: '9px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  border: '1px solid #E2E8F0', cursor: report.status === s ? 'default' : 'pointer',
                  background: report.status === s ? '#1B3A4B' : '#FFFFFF',
                  color: report.status === s ? '#FFFFFF' : '#475569',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Remedy / action taken */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>Remedy / action taken</div>
          <textarea
            value={remedy}
            onChange={(e) => setRemedy(e.target.value)}
            rows={4}
            placeholder="What was done to resolve this? (e.g. replaced tap washer on site 2)…"
            style={{ width: '100%', fontSize: 14, padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', resize: 'vertical', fontFamily: 'inherit' }}
          />
          {report.remedied_at && (
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
              Last updated {format(new Date(report.remedied_at), 'd MMM yyyy, HH:mm')}
            </div>
          )}
          <button
            onClick={saveRemedy}
            disabled={saving}
            style={{
              marginTop: 10, padding: '9px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600,
              border: 'none', background: '#2A9D8F', color: '#FFFFFF', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving && <Loader2 size={16} className="animate-spin" />} Save remedy
          </button>
        </div>

        {/* Admin notes */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>Internal notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes for the committee (not shown to the member)…"
            style={{ width: '100%', fontSize: 14, padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            onClick={saveNotes}
            disabled={saving}
            style={{
              marginTop: 10, padding: '9px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600,
              border: 'none', background: '#2A9D8F', color: '#FFFFFF', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving && <Loader2 size={16} className="animate-spin" />} Save notes
          </button>
        </div>
      </div>
    </div>
  );
}
