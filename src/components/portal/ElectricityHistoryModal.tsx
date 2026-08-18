import { formatCents } from '@/utils/currency';
import { X, Zap } from 'lucide-react';

interface MonthRow {
  period_month: string;
  amount_cents: number;
  as_of_date: string;
}

function formatMonth(periodMonth: string) {
  return new Date(periodMonth + 'T00:00:00').toLocaleDateString('en-ZA', {
    month: 'long', year: 'numeric',
  });
}

export default function ElectricityHistoryModal({
  monthly, lifetimeCents, onClose,
}: {
  monthly: MonthRow[];
  lifetimeCents: number;
  onClose: () => void;
}) {
  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16,
    padding: '10px 0', borderBottom: `1px solid var(--portal-card-border)`,
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div role="dialog" aria-modal="true" aria-label="Electricity purchase history" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)',
        border: `1px solid var(--portal-card-border)`, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: 24, zIndex: 51,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--portal-text-primary)', margin: 0 }}>Electricity History</h2>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '4px 0 0' }}>
              Prepaid meter purchases, by month
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)',
            padding: 4, lineHeight: 0,
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--portal-page-bg)', borderRadius: 'var(--portal-card-radius)',
          padding: '12px 16px', margin: '20px 0 4px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} /> Lifetime total
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text-primary)' }}>
            {formatCents(lifetimeCents)}
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          {monthly.map(m => (
            <div key={m.period_month} style={rowStyle}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)' }}>
                  {formatMonth(m.period_month)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                  As at {new Date(m.as_of_date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)', whiteSpace: 'nowrap' }}>
                {formatCents(m.amount_cents)}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '16px 0 0' }}>
          Figures are updated weekly from meter readings and may lag actual usage by a few days.
        </p>

        <button onClick={onClose} style={{
          marginTop: 20, width: '100%', height: 44, background: 'var(--portal-accent)', color: '#FFFFFF',
          fontWeight: 600, borderRadius: 'var(--portal-button-radius)', border: 'none', cursor: 'pointer',
        }}>Close</button>
      </div>
    </>
  );
}
