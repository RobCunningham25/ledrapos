import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Mail, Eye } from 'lucide-react';
import { format } from 'date-fns';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';

interface BroadcastRow {
  id: string;
  subject: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: '#E2E8F0', text: '#475569', label: 'Draft' },
  queued:    { bg: '#DBEAFE', text: '#1E40AF', label: 'Queued' },
  sending:   { bg: '#FEF3C7', text: '#92400E', label: 'Sending' },
  sent:      { bg: '#D1FAE5', text: '#065F46', label: 'Sent' },
  partial:   { bg: '#FFEDD5', text: '#9A3412', label: 'Partial' },
  failed:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed' },
  cancelled: { bg: '#E2E8F0', text: '#475569', label: 'Cancelled' },
};

export default function Broadcasts() {
  const navigate = useNavigate();
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchBroadcasts = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_broadcasts')
        .select('id, subject, status, total_recipients, sent_count, failed_count, skipped_count, scheduled_for, sent_at, created_at')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false });

      if (!cancelled) {
        if (error) {
          console.error('Failed to fetch broadcasts:', error.message);
          setBroadcasts([]);
        } else {
          setBroadcasts((data as BroadcastRow[]) || []);
        }
        setLoading(false);
      }
    };
    fetchBroadcasts();
    return () => { cancelled = true; };
  }, [venueId]);

  const formatWhen = (b: BroadcastRow): string => {
    if (b.sent_at) return format(new Date(b.sent_at), 'd MMM yyyy, HH:mm');
    if (b.status === 'sending') return 'Sending now';
    if (b.scheduled_for) return `Scheduled ${format(new Date(b.scheduled_for), 'd MMM yyyy, HH:mm')}`;
    if (b.status === 'queued') return 'Queued';
    return format(new Date(b.created_at), 'd MMM yyyy, HH:mm');
  };

  return (
    <AdminLayout title="Broadcasts" action={
      <Button
        onClick={() => navigate(adminPath('broadcasts/new'))}
        style={{ height: 40, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6 }}
      >
        <Plus className="h-4 w-4 mr-2" />
        Compose new
      </Button>
    }>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">When</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Recipients</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map(i => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-3" colSpan={5}><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!loading && broadcasts.length === 0 && (
              <tr>
                <td className="px-4 py-12 text-center text-muted-foreground" colSpan={5}>
                  <div className="flex flex-col items-center gap-3">
                    <Mail className="h-10 w-10" style={{ color: '#94A3B8' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#475569' }}>No broadcasts yet</p>
                      <p className="text-xs mt-1">Click "Compose new" to send your first member email.</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {broadcasts.map(b => {
              const s = STATUS_STYLES[b.status] || STATUS_STYLES.draft;
              const sendable = Math.max(b.total_recipients - b.skipped_count, 0);
              return (
                <tr
                  key={b.id}
                  className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => navigate(adminPath(`broadcasts/${b.id}`))}
                >
                  <td className="px-4 py-3 font-medium text-foreground" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.subject}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: 13 }}>
                    {formatWhen(b)}
                  </td>
                  <td className="px-4 py-3">
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                      fontSize: 12, fontWeight: 600, color: s.text, background: s.bg,
                    }}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontSize: 13 }}>
                    <span style={{ color: '#0F172A', fontWeight: 500 }}>{b.sent_count}</span>
                    <span className="text-muted-foreground">/{sendable}</span>
                    {b.failed_count > 0 && (
                      <span style={{ color: '#991B1B', marginLeft: 8 }}>· {b.failed_count} failed</span>
                    )}
                    {b.skipped_count > 0 && (
                      <span className="text-muted-foreground" style={{ marginLeft: 8 }}>· {b.skipped_count} skipped</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(adminPath(`broadcasts/${b.id}`)); }}
                      title="View"
                      className="w-8 h-8 inline-flex items-center justify-center rounded transition-colors"
                      style={{ color: '#718096' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#2E5FA3')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#718096')}
                    >
                      <Eye size={16} />
                    </button>
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
