import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, AlertTriangle, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';

interface Props {
  venueId: string;
  bookingCode: string;
  totalCents: number;
}

export default function EFTDetailsScreen({ venueId, bookingCode, totalCents }: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const { data: bankDetails } = useQuery({
    queryKey: ['eft-bank-details', venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from('venue_settings')
        .select('key, value')
        .eq('venue_id', venueId)
        .in('key', ['eft_bank_name', 'eft_account_holder', 'eft_account_number', 'eft_branch_code', 'eft_account_type']);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value || ''; });
      return map;
    },
  });

  const rows = [
    { label: 'Bank', value: bankDetails?.eft_bank_name || '—' },
    { label: 'Account Holder', value: bankDetails?.eft_account_holder || '—' },
    { label: 'Account Number', value: bankDetails?.eft_account_number || '—' },
    { label: 'Branch Code', value: bankDetails?.eft_branch_code || '—' },
    { label: 'Account Type', value: bankDetails?.eft_account_type || '—' },
    { label: 'Payment Reference', value: bookingCode, highlight: true },
    { label: 'Amount', value: formatCents(totalCents), highlight: true },
  ];

  const handleCopy = async () => {
    const text = [
      `Bank: ${bankDetails?.eft_bank_name || ''}`,
      `Account: ${bankDetails?.eft_account_holder || ''}`,
      `Acc No: ${bankDetails?.eft_account_number || ''}`,
      `Branch: ${bankDetails?.eft_branch_code || ''}`,
      `Type: ${bankDetails?.eft_account_type || ''}`,
      `Reference: ${bookingCode}`,
      `Amount: ${formatCents(totalCents)}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copied]);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px', textAlign: 'center' }}>
      <Building2 size={48} color={T.navy} style={{ margin: '0 auto 16px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 700, color: T.navy, marginBottom: 24 }}>EFT Payment Details</h2>

      <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12, boxShadow: T.cardShadow, padding: 24, textAlign: 'left' }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < rows.length - 1 ? `1px solid ${T.cardBorder}` : 'none',
          }}>
            <span style={{ fontSize: 14, color: row.highlight ? T.navy : T.textMuted, fontWeight: row.highlight ? 700 : 500 }}>
              {row.label}
            </span>
            <span style={{
              fontSize: row.highlight ? 16 : 14, color: row.highlight ? T.navy : T.textPrimary,
              fontWeight: row.highlight ? 700 : 500,
              fontFamily: row.label === 'Payment Reference' ? 'monospace' : 'inherit',
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Warning notice */}
      <div style={{
        background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 8, padding: 16, marginTop: 16,
        display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left',
      }}>
        <AlertTriangle size={16} color="#92400E" style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 14, color: '#92400E' }}>
          Please use your booking code <strong>{bookingCode}</strong> as the payment reference. Your booking will expire in 24 hours if payment is not confirmed.
        </span>
      </div>

      {/* Copy button */}
      <button onClick={handleCopy} style={{
        width: '100%', height: 44, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: copied ? T.teal : T.navy, color: '#FFFFFF', transition: 'background 0.2s',
      }}>
        {copied ? <><Check size={16} /> Copied ✓</> : <><Copy size={16} /> Copy Bank Details</>}
      </button>

      {/* Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        <button onClick={() => { window.scrollTo(0, 0); window.location.reload(); }}
          style={{ width: '100%', height: 44, background: T.teal, color: '#FFFFFF', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          View My Bookings
        </button>
        <button onClick={() => navigate('/portal')}
          style={{ width: '100%', height: 44, background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
