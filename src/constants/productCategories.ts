export const CATEGORY_COLORS: Record<string, string> = {
  beer: '#D97706',
  wine: '#7C3AED',
  spirits: '#2563EB',
  soft_drinks: '#16A34A',
  water: '#0891B2',
  ciders: '#DC2626',
  shooters: '#EC4899',
  mixers: '#9333EA',
  snacks: '#EA580C',
  other: '#6B7280',
};

export const CATEGORIES = [
  { value: 'beer', label: 'Beer' },
  { value: 'wine', label: 'Wine' },
  { value: 'spirits', label: 'Spirits' },
  { value: 'soft_drinks', label: 'Soft Drinks' },
  { value: 'water', label: 'Water' },
  { value: 'ciders', label: 'Ciders' },
  { value: 'shooters', label: 'Shooters' },
  { value: 'mixers', label: 'Mixers' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'other', label: 'Other' },
] as const;

export type ProductCategory =
  | 'beer'
  | 'wine'
  | 'spirits'
  | 'soft_drinks'
  | 'water'
  | 'ciders'
  | 'shooters'
  | 'mixers'
  | 'snacks'
  | 'other';

export function getCategoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
