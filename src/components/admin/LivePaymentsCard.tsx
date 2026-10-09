import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useVenue } from '@/contexts/VenueContext';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchMoneyReceived,
  summarizeMoney,
  CHANNEL_META,
  type MoneyChannel,
  type MoneyEvent,
} from '@/utils/moneyReceived';

const REFRESH_MS = 20_000;

const GROUPS: Array<{ label: string; channels: MoneyChannel[] }> = [
  { label: 'Bar tabs', channels: ['bar_cash', 'bar_card'] },
  { label: 'Online (Yoco)', channels: ['yoco_credit_topup', 'yoco_booking'] },
  { label: 'Settled from credit', channels: ['bar_credit'] },
];

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

function todayRange(): { fromISO: string; toISO: string } {
  const day = format(new Date(), 'yyyy-MM-dd');
  return { fromISO: `${day}T00:00:00`, toISO: `${day}T23:59:59` };
}

export default function LivePaymentsCard() {
  const { venueId } = useVenue();
  const [events, setEvents] = useState<MoneyEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [flash, setFlash] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const prevCount = useRef(0);

  const load = useCallback(async () => {
    const { fromISO, toISO } = todayRange();
    try {
      const rows = await fetchMoneyReceived(venueId, fromISO, toISO);
      setEvents((prev) => {
        // Flash the header when a new event lands after the first load.
        if (prev !== null && rows.length > prevCount.current) {
          setFlash(true);
          setTimeout(() => setFlash(false), 1200);
        }
        prevCount.current = rows.length;
        return rows;
      });
      setError(false);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error('LivePaymentsCard load failed', err);
      setError(true);
    }
  }, [venueId]);

  useEffect(() => {
    setEvents(null);
    prevCount.current = 0;
    load();
    const id = setInterval(load, REFRESH_MS);
    // Refresh immediately when the admin returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const summary = events ? summarizeMoney(events) : null;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: error ? '#DC2626' : '#16A34A',
              boxShadow: error ? 'none' : '0 0 0 0 rgba(22,163,74,0.6)',
              animation: error ? 'none' : 'livePulse 1.8s ease-out infinite',
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Payments Received Today
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>
          {error
            ? 'Reconnecting…'
            : updatedAt
              ? `Updated ${format(updatedAt, 'HH:mm:ss')}`
              : 'Live'}
        </span>
      </div>

      <style>{`
        @keyframes livePulse {
          0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.5); }
          70% { box-shadow: 0 0 0 7px rgba(22,163,74,0); }
          100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
        }
      `}</style>

      {events === null ? (
        <div style={{ marginTop: 16 }}>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-56 mt-3" />
          <Skeleton className="h-16 w-full mt-4" />
        </div>
      ) : (
        <>
          <div
            style={{
              marginTop: 12,
              fontSize: 30,
              fontWeight: 700,
              color: '#2E5FA3',
              lineHeight: 1.1,
              transition: 'color 0.4s',
              ...(flash ? { color: '#16A34A' } : {}),
            }}
          >
            {formatCents(summary!.receivedCents)}
          </div>
          <p style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>
            {summary!.count} payment{summary!.count === 1 ? '' : 's'} received
            {summary!.creditRedeemedCents > 0 && (
              <span style={{ color: '#94A3B8' }}>
                {'  ·  '}
                {formatCents(summary!.creditRedeemedCents)} settled from credit
              </span>
            )}
          </p>

          {/* Grouped totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
            {GROUPS.map((g) => {
              const parts = g.channels.map((ch) => summary!.byChannel[ch]);
              const count = parts.reduce((n, p) => n + p.count, 0);
              if (count === 0) return null;
              const total = parts.reduce((n, p) => n + p.totalCents, 0);
              return (
                <div key={g.label} style={{ background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1A202C', marginTop: 2 }}>{formatCents(total)}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {g.channels
                      .filter((ch) => summary!.byChannel[ch].count > 0)
                      .map((ch) => `${CHANNEL_META[ch].label.split(' · ')[1] ?? CHANNEL_META[ch].label} ${formatCents(summary!.byChannel[ch].totalCents)}`)
                      .join(' · ')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feed — collapsed by default */}
          {events.length === 0 ? (
            <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 16 }}>No payments received yet today.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowFeed((v) => !v)}
                style={{ marginTop: 14, background: 'none', border: 'none', padding: 0, color: '#2E5FA3', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {showFeed ? 'Hide payments' : `Show all ${events.length} payment${events.length === 1 ? '' : 's'}`}
              </button>
              {showFeed && (
                <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto', border: '1px solid #EEF2F7', borderRadius: 8 }}>
                  {events.map((e, i) => (
                    <div
                      key={e.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '8px 12px',
                        background: i % 2 === 1 ? '#FAFBFC' : '#FFFFFF',
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', background: CHANNEL_META[e.channel].color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.who}
                        </span>
                        <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                          {CHANNEL_META[e.channel].label} · {format(new Date(e.at), 'HH:mm')}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: e.isNewMoney ? '#1A202C' : '#94A3B8', whiteSpace: 'nowrap' }}>
                        {formatCents(e.amountCents)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
