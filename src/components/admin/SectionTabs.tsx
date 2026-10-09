import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { ADMIN_SECTIONS } from './adminSections';

/** Tab strip for the section the current route belongs to; renders nothing for standalone pages. */
export default function SectionTabs() {
  const { adminPath } = useVenueNav();
  const { adminUser } = useAdminAuth();
  const location = useLocation();
  const isManager = adminUser?.role === 'manager';

  const section = ADMIN_SECTIONS.find((s) => s.tabs.some((t) => adminPath(t.sub) === location.pathname));
  if (!section) return null;

  const tabs = section.tabs.filter((t) => !(isManager && t.adminOnly));
  if (tabs.length < 2) return null;

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const path = adminPath(tab.sub);
        const active = location.pathname === path;
        return (
          <Link
            key={tab.sub}
            to={path}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
