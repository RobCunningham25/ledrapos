import { ReactNode, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Users, CalendarDays, BedDouble, BarChart3, Settings, Menu, X, LogOut, Mail, MessageCircle, AlertCircle, UserPlus, MessageSquareWarning, ClipboardList, CalendarClock, CalendarRange, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  action?: ReactNode;
}

// managerSees: item is also shown to the club-manager role.
// managerOnly: item is shown ONLY to the manager (admins use the fuller equivalent —
// e.g. the read-only Calendar for managers vs. the Events management page for admins).
interface NavItem {
  label: string;
  sub: string;
  icon: LucideIcon;
  managerSees?: boolean;
  managerOnly?: boolean;
}

const navKeys: NavItem[] = [
  { label: 'Dashboard', sub: '', icon: LayoutDashboard, managerSees: true },
  { label: 'Products', sub: 'products', icon: Package },
  { label: 'Members', sub: 'members', icon: Users },
  { label: 'Applications', sub: 'applications', icon: UserPlus },
  { label: 'Issues', sub: 'issues', icon: MessageSquareWarning, managerSees: true },
  { label: 'Calendar', sub: 'calendar', icon: CalendarRange, managerOnly: true },
  { label: 'Events', sub: 'events', icon: CalendarDays },
  { label: 'Jobs', sub: 'jobs', icon: ClipboardList, managerSees: true },
  { label: 'Leave', sub: 'leave', icon: CalendarClock, managerSees: true },
  { label: 'Bookings', sub: 'bookings', icon: BedDouble, managerSees: true },
  { label: 'Reports', sub: 'reports', icon: BarChart3 },
  { label: 'Broadcasts', sub: 'broadcasts', icon: Mail },
  { label: 'WhatsApp AI', sub: 'whatsapp/assistant', icon: MessageCircle },
  { label: 'Follow-ups', sub: 'whatsapp/followups', icon: AlertCircle },
  { label: 'Settings', sub: 'settings', icon: Settings },
];

export default function AdminLayout({ children, title, action }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { adminUser, signOut } = useAdminAuth();
  const { venue, venueName } = useVenue();
  const { adminPath } = useVenueNav();

  const isManager = adminUser?.role === 'manager';
  const navItems = navKeys
    .filter((item) => (isManager ? item.managerSees || item.managerOnly : !item.managerOnly))
    .map((item) => ({ ...item, path: adminPath(item.sub) }));

  const isActive = (path: string) => location.pathname === path;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5 border-b border-border">
        {venue?.logo_url && (
          <img src={venue.logo_url} alt={venueName} className="h-12 object-contain mb-2" />
        )}
        <h1 className="text-base font-bold text-primary leading-snug">{venueName}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{isManager ? 'Manager Panel' : 'Admin Panel'}</p>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setSidebarOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary border-l-[3px] border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground border-l-[3px] border-transparent'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Admin user info + logout */}
      <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 'auto' }}>
        {adminUser && (
          <div style={{ padding: '12px 16px' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1A202C' }}>{adminUser.name}</p>
            <p style={{ fontSize: 12, color: '#718096' }}>{adminUser.email}</p>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 transition-colors"
          style={{ padding: '12px 16px', color: '#C0392B', fontSize: 14, fontWeight: 500 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-card border-r border-border">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-60 h-full bg-card shadow-lg">
            <div className="absolute top-3 right-3">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center justify-between px-4 md:px-8 bg-card border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          {action && <div>{action}</div>}
        </header>
        <main className="flex-1 overflow-auto bg-page p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
