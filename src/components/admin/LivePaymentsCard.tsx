import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useVenue } from '@/contexts/VenueContext';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchMoneyReceived,
  summarizeMoney,
  CHANNEL_META,
  type MoneyEvent,
} from '@/utils/moneyReceived';

const REFRESH_MS = 20_000;

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
              fontSize: 36,
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

          {/* Channel chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {(Object.keys(CHANNEL_META) as Array<keyof typeof CHANNEL_META>)
              .filter((ch) => summary!.byChannel[ch].count > 0)
              .map((ch) => (
                <span
                  key={ch}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#334155',
                    background: '#F1F5F9',
                    borderRadius: 999,
                    padding: '4px 10px',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHANNEL_META[ch].color }} />
                  {CHANNEL_META[ch].label}
                  <span style={{ color: '#64748B' }}>{formatCents(summary!.byChannel[ch].totalCents)}</span>
                </span>
              ))}
          </div>

          {/* Feed */}
          {events.length === 0 ? (
            <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 16 }}>No payments received yet today.</p>
          ) : (
            <div style={{ marginTop: 16, maxHeight: 320, overflowY: 'auto', border: '1px solid #EEF2F7', borderRadius: 8 }}>
              {events.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 14px',
                    background: i % 2 === 1 ? '#FAFBFC' : '#FFFFFF',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.who}
                      {e.membershipNumber && (
                        <span style={{ color: '#94A3B8', fontWeight: 500 }}>{`  (${e.membershipNumber})`}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: CHANNEL_META[e.channel].color }} />
                      <span style={{ fontSize: 12, color: '#64748B' }}>{CHANNEL_META[e.channel].label}</span>
                      <span style={{ fontSize: 12, color: '#CBD5E1' }}>·</span>
                      <span style={{ fontSize: 12, color: '#64748B' }}>{format(new Date(e.at), 'HH:mm')}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: e.isNewMoney ? '#1A202C' : '#94A3B8', whiteSpace: 'nowrap' }}>
                    {formatCents(e.amountCents)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
