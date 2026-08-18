import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { usePortalTheme } from '@/contexts/PortalThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Home, Calendar, BedDouble, BookOpen, MessageSquarePlus, LogOut } from 'lucide-react';
import { useVenueNav } from '@/hooks/useVenueNav';
import PwaInstallPrompt from '@/components/portal/PwaInstallPrompt';

function usePortalTabs() {
  const { portalPath } = useVenueNav();
  return [
    { label: 'Home', icon: Home, path: portalPath(), key: null },
    { label: 'Calendar', icon: Calendar, path: portalPath('calendar'), key: 'portal_tab_calendar' },
    { label: 'Bookings', icon: BedDouble, path: portalPath('bookings'), key: 'portal_tab_bookings' },
    { label: 'Constitution', icon: BookOpen, path: portalPath('constitution'), key: 'portal_tab_constitution' },
    { label: 'Report', icon: MessageSquarePlus, path: portalPath('report-issue'), key: 'portal_tab_report_issue' },
  ];
}

export default function PortalLayout() {
  const { member, signOut } = usePortalAuth();
  const T = usePortalTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { portalPath } = useVenueNav();
  const allTabs = usePortalTabs();
  const [enabledKeys, setEnabledKeys] = useState<Record<string, boolean>>({
    portal_tab_calendar: true,
    portal_tab_bookings: true,
    portal_tab_constitution: true,
    portal_tab_report_issue: true,
  });

  useEffect(() => {
    if (!member?.venue_id) return;
    supabase
      .from('venue_settings')
      .select('key, value')
      .eq('venue_id', member.venue_id)
      .in('key', ['portal_tab_calendar', 'portal_tab_bookings', 'portal_tab_constitution', 'portal_tab_report_issue'])
      .then(({ data }) => {
        if (data) {
          const result: Record<string, boolean> = {
            portal_tab_calendar: true,
            portal_tab_bookings: true,
            portal_tab_constitution: true,
            portal_tab_report_issue: true,
          };
          for (const row of data) {
            result[row.key] = row.value !== 'false';
          }
          setEnabledKeys(result);
        }
      });
  }, [member?.venue_id]);

  const visibleTabs = allTabs.filter(t => t.key === null || enabledKeys[t.key]);

  const isActive = (path: string) => {
    const portalHome = portalPath();
    if (path === portalHome) return location.pathname === portalHome || location.pathname === portalPath('bar-tab');
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex" style={{ minHeight: '100vh', background: 'var(--portal-page-bg)' }}>
      <PwaInstallPrompt />
      {/* Desktop sidebar — hidden below lg */}
      <aside
        className="hidden lg:flex flex-col shrink-0"
        style={{ width: 240, background: 'var(--portal-primary)', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 30 }}
      >
        <div style={{ padding: '24px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          {T.logoUrl && (
            <span style={{ display: 'inline-flex', background: '#FFFFFF', borderRadius: 8, padding: 4, flexShrink: 0 }}>
              <img src={T.logoUrl} alt="" style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block' }} />
            </span>
          )}
          <span style={{ fontWeight: 700, fontSize: 18, color: '#FFFFFF' }}>{T.venueName}</span>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', padding: '8px 20px 0', marginBottom: 32 }}>
          Welcome, {member?.first_name}
        </p>

        <nav className="flex-1 flex flex-col gap-1 px-2">
          {visibleTabs.map(tab => {
            const active = isActive(tab.path);
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="flex items-center gap-3"
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? `3px solid var(--portal-accent)` : '3px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'rgba(255,255,255,0.08)'); }}
                onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={signOut}
          className="flex items-center gap-3"
          style={{
            width: '100%', padding: '12px 20px', margin: '8px 8px 24px',
            borderRadius: 8, fontSize: 14, fontWeight: 500,
            color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut size={20} />
          Log out
        </button>
      </aside>

      {/* Main content area */}
      <div className="flex flex-col flex-1 lg:ml-[240px]" style={{ minHeight: '100vh' }}>
        {/* Top bar */}
        <header
          className="flex items-center justify-between shrink-0"
          style={{ height: 64, background: 'var(--portal-primary)', padding: '0 20px' }}
        >
          <div className="flex items-center gap-2">
            {T.logoUrl && (
              <span className="lg:hidden" style={{ display: 'inline-flex', background: '#FFFFFF', borderRadius: 6, padding: 3, flexShrink: 0 }}>
                <img src={T.logoUrl} alt="" style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }} />
              </span>
            )}
            <span className="hidden lg:inline" style={{ fontWeight: 600, fontSize: 16, color: '#FFFFFF' }}>
              {T.venueName}
            </span>
            <span className="lg:hidden" style={{ fontWeight: 600, fontSize: 16, color: '#FFFFFF' }}>
              {T.venueName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{member?.first_name}</span>
            <button
              onClick={signOut}
              className="lg:hidden"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.7)', width: 44, height: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Content — extra bottom padding on mobile so content clears the fixed tab bar */}
        <main
          className="flex-1 overflow-y-auto p-4 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] lg:pb-4"
        >
          <Outlet />
        </main>

        {/* Bottom tab bar — fixed to the viewport, visible below lg */}
        <nav
          className="flex items-center lg:hidden"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            height: 64,
            background: 'var(--portal-card-bg)',
            borderTop: `1px solid var(--portal-card-border)`,
            boxShadow: '0 -2px 8px rgba(43,35,25,0.04)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {visibleTabs.map(tab => {
            const active = isActive(tab.path);
            const color = active ? 'var(--portal-primary)' : 'var(--portal-text-muted)';
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center justify-center gap-0.5"
                style={{
                  flex: 1, minHeight: 64, background: 'none', border: 'none',
                  cursor: 'pointer', position: 'relative',
                }}
              >
                {active && (
                  <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 32, height: 3, borderRadius: 2, background: 'var(--portal-accent)',
                  }} />
                )}
                <tab.icon size={24} color={color} strokeWidth={active ? 2.5 : 2} />
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, color }}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
