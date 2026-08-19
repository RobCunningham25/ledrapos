import { useEffect, useState } from 'react';
import { X, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import MeterBarcode from './MeterBarcode';

interface MeterInfo {
  meter_number: string;
  unit_label: string | null;
}

function CopyMeterNumber({ meterNumber }: { meterNumber: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(meterNumber); setCopied(true); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--portal-accent)', fontSize: 13, fontWeight: 600, padding: 4,
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy number'}
    </button>
  );
}

// Shown when a member is at a till buying prepaid electricity — large,
// high-contrast meter number + scannable barcode, so a phone screen held up
// to a cashier or vending kiosk actually works. Members with more than one
// meter (permanent site + boat shed, say) pick which one first, since a
// vending kiosk only ever loads a single meter at a time.
export default function BuyElectricityModal({ meters, onClose }: { meters: MeterInfo[]; onClose: () => void }) {
  const [selected, setSelected] = useState<MeterInfo | null>(meters.length === 1 ? meters[0] : null);

  const showPicker = meters.length > 1 && !selected;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div role="dialog" aria-modal="true" aria-label="Buy electricity" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        maxWidth: 420, width: 'calc(100% - 32px)', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)',
        border: `1px solid var(--portal-card-border)`, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: 24, zIndex: 51,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!showPicker && meters.length > 1 && (
              <button onClick={() => setSelected(null)} aria-label="Back to site list" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)',
                padding: 4, lineHeight: 0,
              }}>
                <ChevronLeft size={20} />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--portal-text-primary)', margin: 0 }}>Buy Electricity</h2>
              <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '4px 0 0' }}>
                {showPicker ? 'Choose which site you’re buying for' : 'Show this screen at the till or vending point'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)',
            padding: 4, lineHeight: 0,
          }}>
            <X size={20} />
          </button>
        </div>

        {showPicker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            {meters.map(m => (
              <button
                key={m.meter_number}
                onClick={() => setSelected(m)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '14px 16px', textAlign: 'left',
                  background: 'var(--portal-bg)', border: `1px solid var(--portal-card-border)`,
                  borderRadius: 'var(--portal-button-radius)', cursor: 'pointer',
                }}
              >
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text-primary)', margin: 0 }}>
                    {m.unit_label ? `Site ${m.unit_label}` : 'Meter'}
                  </p>
                  <p style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--portal-text-muted)', margin: '2px 0 0' }}>
                    {m.meter_number}
                  </p>
                </div>
                <ChevronRight size={18} color="var(--portal-text-muted)" />
              </button>
            ))}
          </div>
        ) : selected && (
          <>
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              {selected.unit_label && (
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--portal-text-muted)', margin: '0 0 4px' }}>
                  Site {selected.unit_label}
                </p>
              )}
              <p style={{
                fontSize: 28, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace',
                color: 'var(--portal-text-primary)', margin: 0, wordBreak: 'break-all',
              }}>
                {selected.meter_number}
              </p>
              <div style={{ margin: '12px 0 8px' }}>
                <MeterBarcode meterNumber={selected.meter_number} />
              </div>
              <CopyMeterNumber meterNumber={selected.meter_number} />
            </div>

            <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '20px 0 0' }}>
              This is your meter number, not a payment method — pay the cashier or vending kiosk as
              normal and give them this number to load.
            </p>
          </>
        )}

        <button onClick={onClose} style={{
          marginTop: 16, width: '100%', height: 44, background: 'var(--portal-accent)', color: '#FFFFFF',
          fontWeight: 600, borderRadius: 'var(--portal-button-radius)', border: 'none', cursor: 'pointer',
        }}>Close</button>
      </div>
    </>
  );
}
