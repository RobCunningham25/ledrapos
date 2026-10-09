import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AttentionItem {
  key: string;
  label: string;
  detail: string;
  count: number;
  urgent: boolean;
  /** admin sub-path, e.g. 'whatsapp/followups' */
  to: string;
}

const REFRESH_MS = 60_000;

/**
 * One place for "things that need a human". Aggregates WhatsApp follow-ups,
 * open issue reports, overdue water sign-outs, pending applications and EFT
 * bookings awaiting payment into a compact banner + modal.
 */
export default function AttentionCenter() {
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();
  const navigate = useNavigate();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [followups, issues, signouts, apps, eft] = await Promise.all([
      supabase
        .from('whatsapp_followups')
        .select('id, urgency')
        .eq('venue_id', venueId)
        .in('status', ['open', 'in_progress']),
      supabase
        .from('issue_reports')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('status', 'open'),
      supabase
        .from('water_signouts')
        .select('id')
        .eq('venue_id', venueId)
        .eq('status', 'out')
        .lt('expected_return_at', nowIso),
      supabase
        .from('membership_applications')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('status', 'pending'),
      supabase.from('bookings').select('status, payment_method').eq('venue_id', venueId),
    ]);

    const next: AttentionItem[] = [];

    const fu = followups.data ?? [];
    if (fu.length > 0) {
      const urgent = fu.filter((f) => f.urgency === 'urgent').length;
      next.push({
        key: 'whatsapp',
        label: 'WhatsApp messages waiting on you',
        detail: urgent > 0 ? `${urgent} marked urgent` : 'Escalations, unanswered questions and new enquiries',
        count: fu.length,
        urgent: urgent > 0,
        to: 'whatsapp/followups',
      });
    }

    const overdue = signouts.data?.length ?? 0;
    if (overdue > 0) {
      next.push({
        key: 'water',
        label: 'Boats overdue on the water',
        detail: 'Past their expected return time',
        count: overdue,
        urgent: true,
        to: 'water-signouts',
      });
    }

    if ((issues.count ?? 0) > 0) {
      next.push({
        key: 'issues',
        label: 'Open issue reports',
        detail: 'Reported by members, not yet actioned',
        count: issues.count ?? 0,
        urgent: false,
        to: 'issues',
      });
    }

    if ((apps.count ?? 0) > 0) {
      next.push({
        key: 'applications',
        label: 'Membership applications to review',
        detail: 'Awaiting a decision',
        count: apps.count ?? 0,
        urgent: false,
        to: 'applications',
      });
    }

    // Booking status casing is inconsistent across the codebase — compare case-insensitively.
    const pendingEft = (eft.data ?? []).filter(
      (b) => (b.status ?? '').toUpperCase() === 'PENDING' && (b.payment_method ?? '').toLowerCase() === 'eft',
    ).length;
    if (pendingEft > 0) {
      next.push({
        key: 'eft',
        label: 'EFT bookings awaiting payment',
        detail: 'Check Sage for incoming deposits',
        count: pendingEft,
        urgent: false,
        to: 'bookings',
      });
    }

    setItems(next);
  }, [venueId]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (items === null) return null;

  const total = items.reduce((s, i) => s + i.count, 0);
  const anyUrgent = items.some((i) => i.urgent);

  const tone = items.length === 0
    ? { bg: '#F0FDF4', border: '#BBF7D0', fg: '#166534' }
    : anyUrgent
      ? { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B' }
      : { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E' };

  return (
    <>
      <button
        type="button"
        onClick={() => items.length > 0 && setOpen(true)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          color: tone.fg,
          borderRadius: 8,
          padding: '12px 16px',
          cursor: items.length > 0 ? 'pointer' : 'default',
        }}
      >
        {items.length === 0 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
          {items.length === 0
            ? 'All clear — nothing needs your attention'
            : `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} your attention`}
          {items.length > 0 && (
            <span style={{ fontWeight: 500, opacity: 0.85 }}>
              {'  ·  '}
              {items.map((i) => `${i.count} ${i.key === 'whatsapp' ? 'WhatsApp' : i.key === 'water' ? 'overdue' : i.key === 'issues' ? 'issue' + (i.count === 1 ? '' : 's') : i.key === 'applications' ? 'application' + (i.count === 1 ? '' : 's') : 'EFT'}`).join(', ')}
            </span>
          )}
        </span>
        {items.length > 0 && <ChevronRight size={18} />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Needs your attention</DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(adminPath(i.to));
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'left',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderLeft: `4px solid ${i.urgent ? '#DC2626' : '#D97706'}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 24, fontWeight: 700, color: i.urgent ? '#DC2626' : '#D97706', minWidth: 32 }}>
                  {i.count}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#1A202C' }}>{i.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748B' }}>{i.detail}</span>
                </span>
                <ChevronRight size={16} color="#94A3B8" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
