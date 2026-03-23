import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { usePortalCredit } from '@/hooks/usePortalCredit';
import { usePortalOpenTab } from '@/hooks/usePortalOpenTab';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { Calendar, BedDouble } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import CreditLoadSheet from '@/components/portal/CreditLoadSheet';
import { supabase } from '@/integrations/supabase/client';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── Weather Widget ────────────────────────────────────────────
function WeatherWidget() {
  const [weather, setWeather] = useState<{ temp: number; desc: string; icon: string } | null>(null);

  useEffect(() => {
    const key = import.meta.env.VITE_OPENWEATHER_API_KEY;
    if (!key) return;

    const cacheKey = 'portal_weather';
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 30 * 60 * 1000) { setWeather(data); return; }
      } catch { /* ignore */ }
    }

    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=-26.8700&lon=28.1200&units=metric&appid=${key}`)
      .then(r => r.json())
      .then(d => {
        if (d?.main?.temp != null) {
          const w = { temp: Math.round(d.main.temp), desc: d.weather?.[0]?.description || '', icon: d.weather?.[0]?.icon || '' };
          setWeather(w);
          sessionStorage.setItem(cacheKey, JSON.stringify({ data: w, ts: Date.now() }));
        }
      })
      .catch(() => {});
  }, []);

  if (!weather) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {weather.icon && (
        <img src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt="" style={{ width: 48, height: 48 }} />
      )}
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, margin: 0 }}>{weather.temp}°C</p>
        <p style={{ fontSize: 12, color: T.textMuted, margin: 0, textTransform: 'capitalize' }}>{weather.desc}</p>
        <p style={{ fontSize: 11, color: T.textMuted, margin: 0 }}>Vaal Dam</p>
      </div>
    </div>
  );
}

// ─── Credit & Tab Card ─────────────────────────────────────────
function CreditTabCard({ memberId, venueId }: { memberId: string; venueId: string }) {
  const { balance, isLoading: creditLoading } = usePortalCredit(memberId, venueId);
  const { tabTotal, amountDue, isLoading: tabLoading, items } = usePortalOpenTab(memberId, venueId);
  const [showCredit, setShowCredit] = useState(false);
  const navigate = useNavigate();

  const hasTab = items !== null && items.length > 0;
  const netOutstanding = amountDue;

  return (
    <>
      <div style={{
        background: T.creditCardGradient,
        borderRadius: 16, padding: 24,
        boxShadow: '0 4px 16px rgba(27,58,75,0.2)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Your Balance</p>
        {creditLoading ? (
          <Skeleton className="h-10 w-[140px] mt-1" style={{ background: 'rgba(255,255,255,0.15)' }} />
        ) : (
          <p style={{ fontSize: 36, fontWeight: 700, color: '#FFFFFF', margin: '4px 0 0' }}>{formatCents(balance)}</p>
        )}

        <div style={{ marginTop: 16 }}>
          {tabLoading ? (
            <Skeleton className="h-5 w-[180px]" style={{ background: 'rgba(255,255,255,0.15)' }} />
          ) : hasTab ? (
            <>
              <p style={{ fontSize: 15, fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
                Open tab: {formatCents(tabTotal)}
              </p>
              <p style={{
                fontSize: 14, margin: '4px 0 0',
                color: netOutstanding > 0 ? '#FBBF24' : '#86EFAC',
              }}>
                Outstanding: {formatCents(netOutstanding)}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>No open tab</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setShowCredit(true)}
            style={{
              flex: 1, height: 44, borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: 'rgba(255,255,255,0.15)', color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
            }}
          >
            Load Credit
          </button>
          <button
            onClick={() => navigate('/portal/bar-tab')}
            style={{
              flex: 1, height: 44, borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: 'rgba(255,255,255,0.15)', color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
            }}
          >
            View Bar Tab
          </button>
        </div>
      </div>

      <CreditLoadSheet open={showCredit} onClose={() => setShowCredit(false)} memberId={memberId} venueId={venueId} />
    </>
  );
}

// ─── Placeholder Widget Card ───────────────────────────────────
function WidgetCard({ title, linkLabel, linkTo, icon: Icon, emptyText }: {
  title: string; linkLabel: string; linkTo: string; icon: React.ElementType; emptyText: string;
}) {
  const navigate = useNavigate();
  return (
    <div style={{
      background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
      padding: 20, boxShadow: T.cardShadow,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>{title}</span>
        <button
          onClick={() => navigate(linkTo)}
          style={{ fontSize: 14, fontWeight: 500, color: T.teal, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {linkLabel} →
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <Icon size={40} color={T.cardBorder} />
        <p style={{ fontSize: 14, color: T.textMuted, marginTop: 8 }}>{emptyText}</p>
      </div>
    </div>
  );
}

// ─── Dashboard Page ────────────────────────────────────────────
export default function PortalDashboard() {
  const { member } = usePortalAuth();
  const memberId = member?.id ?? '';
  const venueId = member?.venue_id ?? '';

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Greeting + Weather */}
      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.textPrimary, margin: 0 }}>
            {getGreeting()}, {member?.first_name}
          </h1>
          <p style={{ fontSize: 14, color: T.textMuted, marginTop: 4 }}>{formatDate()}</p>
        </div>
        <WeatherWidget />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
        <CreditTabCard memberId={memberId} venueId={venueId} />
        <WidgetCard title="Upcoming Events" linkLabel="View all" linkTo="/portal/calendar" icon={Calendar} emptyText="No upcoming events" />
        <WidgetCard title="Your Bookings" linkLabel="Book now" linkTo="/portal/bookings" icon={BedDouble} emptyText="No upcoming bookings" />
      </div>
    </div>
  );
}
