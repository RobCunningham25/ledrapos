import { ReactNode, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Package, Users, BarChart3, Settings, Menu, X, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface AdminLayoutProps {
  children?: ReactNode;
  title?: string;
  action?: ReactNode;
}

const navItems = [
  { label: 'Products', path: '/admin/products', icon: Package },
  { label: 'Members', path: '/admin/members', icon: Users },
  { label: 'Reports', path: '/admin/reports', icon: BarChart3 },
  { label: 'Settings', path: '/admin/settings', icon: Settings },
];

const pageTitles: Record<string, string> = {
  '/admin/products': 'Products',
  '/admin/members': 'Members',
  '/admin/reports': 'Reports',
  '/admin/settings': 'Settings',
};

export default function AdminLayout({ children, title, action }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { adminUser, signOut } = useAdminAuth();

  const resolvedTitle = title || pageTitles[location.pathname] || '';

  const isActive = (path: string) =>
    location.pathname === path || (path === '/admin/products' && location.pathname === '/admin');

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-primary">LedraPOS</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Admin Panel</p>
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
            <h2 className="text-lg font-semibold text-foreground">{resolvedTitle}</h2>
          </div>
          {action && <div>{action}</div>}
        </header>
        <main className="flex-1 overflow-auto bg-page p-4 md:p-8">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
