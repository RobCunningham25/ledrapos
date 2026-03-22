import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { Wine, Calendar, User, CalendarCheck, LogOut } from 'lucide-react';

const tabs = [
  { label: 'Bar Tab', icon: Wine, path: '/portal' },
  { label: 'Calendar', icon: Calendar, path: '/portal/calendar' },
  { label: 'My Details', icon: User, path: '/portal/my-details' },
  { label: 'Bookings', icon: CalendarCheck, path: '/portal/bookings' },
];

export default function PortalLayout() {
  const { member, signOut } = usePortalAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
        {tabs.map(tab => {
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
