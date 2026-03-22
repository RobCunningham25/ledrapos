import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Wine, Calendar, User, CalendarCheck, LogOut } from 'lucide-react';

const allTabs = [
  { label: 'Bar Tab', icon: Wine, path: '/portal', key: null },
  { label: 'Calendar', icon: Calendar, path: '/portal/calendar', key: 'portal_tab_calendar' },
  { label: 'My Details', icon: User, path: '/portal/my-details', key: 'portal_tab_my_details' },
  { label: 'Bookings', icon: CalendarCheck, path: '/portal/bookings', key: 'portal_tab_bookings' },
];

export default function PortalLayout() {
  const { member, signOut } = usePortalAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [enabledKeys, setEnabledKeys] = useState<Record<string, boolean>>({
    portal_tab_calendar: true,
    portal_tab_my_details: true,
    portal_tab_bookings: true,
  });

  useEffect(() => {
    if (!member?.venue_id) return;
    supabase
      .from('venue_settings')
      .select('key, value')
      .eq('venue_id', member.venue_id)
      .in('key', ['portal_tab_calendar', 'portal_tab_my_details', 'portal_tab_bookings'])
      .then(({ data }) => {
        if (data) {
          const result: Record<string, boolean> = {
            portal_tab_calendar: true,
            portal_tab_my_details: true,
            portal_tab_bookings: true,
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
    if (path === '/portal') return location.pathname === '/portal';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex flex-col" style={{ minHeight: '100vh', background: '#F4F6F9' }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between shrink-0"
        style={{ height: 56, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', padding: '0 16px' }}
      >
        <span style={{ fontWeight: 700, fontSize: 18, color: '#2E5FA3' }}>Ledra</span>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 14, color: '#718096' }}>{member?.first_name}</span>
          <button
            onClick={signOut}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <LogOut size={24} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav
        className="flex items-center shrink-0"
        style={{ height: 64, background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}
      >
        {visibleTabs.map(tab => {
          const active = isActive(tab.path);
          const color = active ? '#2E5FA3' : '#718096';
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center justify-center gap-0.5"
              style={{ flex: 1, minHeight: 64, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <tab.icon size={24} color={color} strokeWidth={active ? 2.5 : 2} />
              <span style={{ fontSize: 11, fontWeight: 500, color }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
