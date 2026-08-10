import { formatCents } from '@/utils/currency';
import { Loader2 } from 'lucide-react';

/** Confirmation step before redirecting to Yoco to settle an open bar tab. */
export default function PayTabDialog({ amountCents, onConfirm, onCancel, loading }: {
  amountCents: number; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        maxWidth: 340, width: 'calc(100% - 32px)', background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)',
        padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 51, textAlign: 'center',
        border: `1px solid var(--portal-card-border)`,
      }}>
        <p style={{ fontSize: 16, color: 'var(--portal-text-primary)', margin: 0 }}>
          Pay your bar tab of <strong>{formatCents(amountCents)}</strong> by card?
        </p>
        <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '8px 0 0' }}>
          This settles your open tab — it does not load credit.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 44, border: `1px solid var(--portal-card-border)`, background: 'var(--portal-card-bg)',
            color: 'var(--portal-text-secondary)', fontWeight: 500, borderRadius: 'var(--portal-button-radius)', cursor: 'pointer',
          }}>Cancel</button>
          <button disabled={loading} onClick={onConfirm} style={{
            flex: 1, height: 44, background: 'var(--portal-accent)', color: '#FFFFFF',
            fontWeight: 600, borderRadius: 'var(--portal-button-radius)', border: 'none',
            cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Pay Now
          </button>
        </div>
      </div>
    </>
  );
}
