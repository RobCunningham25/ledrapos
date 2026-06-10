export interface CustomDomainConfig {
  slug: string;
  section: 'portal' | 'pos' | 'admin';
}

export const CUSTOM_DOMAINS: Record<string, CustomDomainConfig> = {
  'portal.vaalcruising.co.za': { slug: 'vca', section: 'portal' },
  'pos.vaalcruising.co.za': { slug: 'vca', section: 'pos' },
  'admin.vaalcruising.co.za': { slug: 'vca', section: 'admin' },
};

export function getCustomDomainConfig(): CustomDomainConfig | null {
  return CUSTOM_DOMAINS[window.location.hostname] ?? null;
}
