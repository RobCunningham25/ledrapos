import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import { ArrowLeft, Paperclip, Loader2 } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';

interface Broadcast {
  id: string;
  subject: string;
  body_html: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  scheduled_for: string | null;
  started_at: string | null;
  sent_at: string | null;
  created_at: string;
  attachment_paths: unknown;
  created_by: string | null;
}

interface RecipientWithMember {
  id: string;
  email: string;
  status: string;
  resend_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  members: { first_name: string; last_name: string; membership_number: string } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:               { bg: '#E2E8F0', text: '#475569', label: 'Draft' },
  queued:              { bg: '#DBEAFE', text: '#1E40AF', label: 'Queued' },
  sending:             { bg: '#FEF3C7', text: '#92400E', label: 'Sending' },
  sent:                { bg: '#D1FAE5', text: '#065F46', label: 'Sent' },
  partial:             { bg: '#FFEDD5', text: '#9A3412', label: 'Partial' },
  failed:              { bg: '#FEE2E2', text: '#991B1B', label: 'Failed' },
  cancelled:           { bg: '#E2E8F0', text: '#475569', label: 'Cancelled' },
  pending:             { bg: '#E2E8F0', text: '#475569', label: 'Pending' },
  bounced:             { bg: '#FEE2E2', text: '#991B1B', label: 'Bounced' },
  complained:          { bg: '#FEE2E2', text: '#991B1B', label: 'Complained' },
  no_email_skipped:    { bg: '#F1F5F9', text: '#64748B', label: 'No email' },
  opted_out_skipped:   { bg: '#F1F5F9', text: '#64748B', label: 'Opted out' },
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return format(new Date(d), 'd MMM yyyy, HH:mm');
}

export default function BroadcastDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<RecipientWithMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async (showRefresh = false) => {
    if (!id) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const [bRes, rRes] = await Promise.all([
      supabase
        .from('email_broadcasts')
        .select('*')
        .eq('id', id)
        .eq('venue_id', venueId)
        .maybeSingle(),
      supabase
        .from('broadcast_recipients')
        .select('id, email, status, resend_message_id, error, sent_at, members(first_name, last_name, membership_number)')
        .eq('broadcast_id', id)
        .order('updated_at', { ascending: true }),
    ]);

    if (bRes.data) setBroadcast(bRes.data as Broadcast);
    if (rRes.data) setRecipients(rRes.data as unknown as RecipientWithMember[]);

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, venueId]);

  if (loading) {
    return (
      <AdminLayout title="Broadcast">
        <div className="space-y-3">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!broadcast) {
    return (
      <AdminLayout title="Broadcast">
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Broadcast not found.
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate(adminPath('broadcasts'))}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to broadcasts
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const status = STATUS_STYLES[broadcast.status] || STATUS_STYLES.draft;
  const attachmentPaths = Array.isArray(broadcast.attachment_paths) ? broadcast.attachment_paths as string[] : [];
  const sendable = Math.max(broadcast.total_recipients - broadcast.skipped_count, 0);
  const isInFlight = broadcast.status === 'sending' || broadcast.status === 'queued';

  return (
    <AdminLayout title="Broadcast" action={
      <Button variant="outline" onClick={() => navigate(adminPath('broadcasts'))}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>
    }>
      <div className="space-y-5">
        {/* Header card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground break-words">{broadcast.subject}</h2>
              <div className="mt-1 text-sm text-muted-foreground">
                Created {formatDate(broadcast.created_at)}
                {broadcast.sent_at && ` · Sent ${formatDate(broadcast.sent_at)}`}
                {broadcast.scheduled_for && !broadcast.sent_at && ` · Scheduled for ${formatDate(broadcast.scheduled_for)}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                fontSize: 12, fontWeight: 600, color: status.text, background: status.bg,
              }}>
                {status.label}
              </span>
              {isInFlight && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchAll(true)}
                  disabled={refreshing}
                >
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Sendable" value={sendable} />
            <Stat label="Sent" value={broadcast.sent_count} color="#065F46" />
            <Stat label="Failed" value={broadcast.failed_count} color={broadcast.failed_count > 0 ? '#991B1B' : undefined} />
            <Stat label="Skipped" value={broadcast.skipped_count} />
          </div>
        </div>

        {/* Body preview */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/40">
            <div className="text-sm font-semibold text-foreground">Body</div>
          </div>
          <div className="p-5">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(broadcast.body_html ?? '') }}
            />
          </div>
        </div>

        {/* Attachments */}
        {attachmentPaths.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-sm font-semibold text-foreground mb-3">Attachments</div>
            <ul className="space-y-1.5">
              {attachmentPaths.map((path, i) => {
                const base = path.split('/').pop() || path;
                const idx = base.indexOf('_');
                const filename = idx >= 0 ? base.slice(idx + 1) : base;
                return (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Paperclip size={14} className="text-muted-foreground" />
                    <span>{filename}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Recipient table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">Recipients ({recipients.length})</div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Sent at</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No recipients.</td>
                </tr>
              )}
              {recipients.map(r => {
                const s = STATUS_STYLES[r.status] || STATUS_STYLES.pending;
                const memberName = r.members ? `${r.members.first_name} ${r.members.last_name}` : '(unknown)';
                return (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 text-foreground">{memberName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground" style={{ fontSize: 13 }}>
                      {r.email || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600, color: s.text, background: s.bg,
                      }}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground" style={{ fontSize: 13 }}>
                      {formatDate(r.sent_at)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground" style={{ fontSize: 12, maxWidth: 360 }}>
                      {r.error ? (
                        <span style={{ color: '#991B1B' }}>{r.error}</span>
                      ) : r.resend_message_id ? (
                        <span className="font-mono text-xs">{r.resend_message_id}</span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-0.5" style={{ color: color ?? '#1B3A4B' }}>{value}</div>
    </div>
  );
}
