// Admin sidebar sections. Each section is one sidebar entry; its tabs are separate routes, so
// deep links, bookmarks and AttentionCenter links keep working. AdminLayout renders the tab strip
// automatically whenever the current route belongs to a section.

export type AdminSectionId = 'bar' | 'members' | 'ground' | 'whatsapp';

export interface AdminSectionTab {
  label: string;
  /** admin sub-path, e.g. 'products' */
  sub: string;
  /** hidden from the club-manager role */
  adminOnly?: boolean;
}

export interface AdminSection {
  id: AdminSectionId;
  label: string;
  tabs: AdminSectionTab[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'bar',
    label: 'Bar',
    tabs: [
      { label: 'Products', sub: 'products', adminOnly: true },
      { label: 'Reports', sub: 'reports', adminOnly: true },
    ],
  },
  {
    id: 'members',
    label: 'Members',
    tabs: [
      { label: 'Members', sub: 'members', adminOnly: true },
      { label: 'Applications', sub: 'applications', adminOnly: true },
    ],
  },
  {
    id: 'ground',
    label: 'Ground Management',
    tabs: [
      { label: 'Issues', sub: 'issues' },
      { label: 'Jobs', sub: 'jobs' },
      { label: 'Stand Map', sub: 'stand-map' },
      { label: 'Electricity Meters', sub: 'electricity-meters', adminOnly: true },
      { label: 'Leave', sub: 'leave' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    tabs: [
      { label: 'Follow-ups', sub: 'whatsapp/followups', adminOnly: true },
      { label: 'Assistant', sub: 'whatsapp/assistant', adminOnly: true },
    ],
  },
];

export function sectionById(id: AdminSectionId): AdminSection {
  return ADMIN_SECTIONS.find((s) => s.id === id)!;
}
