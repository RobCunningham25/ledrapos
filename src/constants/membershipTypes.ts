export const MEMBERSHIP_TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  ordinary: { text: '#2E5FA3', bg: 'rgba(46,95,163,0.1)' },
  pensioner: { text: '#D68910', bg: 'rgba(214,137,16,0.1)' },
  honorary: { text: '#7D3C98', bg: 'rgba(125,60,152,0.1)' },
  member: { text: '#2E5FA3', bg: 'rgba(46,95,163,0.1)' },
  associate: { text: '#148F77', bg: 'rgba(20,143,119,0.1)' },
};

export const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  ordinary: 'Ordinary',
  pensioner: 'Pensioner',
  honorary: 'Honorary',
  member: 'Member',
  associate: 'Associate',
};

export const MEMBERSHIP_TYPES = ['ordinary', 'pensioner', 'honorary', 'member', 'associate'] as const;

export function getMembershipLabel(type: string): string {
  return MEMBERSHIP_TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}
