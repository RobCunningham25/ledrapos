// VCA membership fee calculator.
// Club year runs May 1 → April 30. Pro-rata is based on the month of application;
// the application month is charged in full.

/** Standalone categories available on the public application form. */
export type MembershipCategory = 'ordinary' | 'social' | 'crew_visitor' | 'junior';

/** Add-on member types that attach to an Ordinary membership. */
export type AddOnCategory = 'intermediate' | 'junior';

interface FeeSchedule {
  label: string;
  description: string;
  annualCents: number;
  joiningFeeCents: number;
  landLevyCents: number;
}

export const CATEGORY_FEES: Record<MembershipCategory, FeeSchedule> = {
  ordinary: {
    label: 'Ordinary Member',
    description: 'Full membership including partner and children under 12. May own Caravan Sites, a Boat Shed, and Moorings.',
    annualCents: 997900,
    joiningFeeCents: 249400,
    landLevyCents: 100000,
  },
  social: {
    label: 'Social Member',
    description: 'Limited to 48 days per year (max 14 consecutive). Includes partner and children under 19.',
    annualCents: 628800,
    joiningFeeCents: 249400,
    landLevyCents: 100000,
  },
  crew_visitor: {
    label: 'Crew Visitor',
    description: '25% of the Ordinary Member annual fee. No joining fee or levy.',
    annualCents: 249400,
    joiningFeeCents: 0,
    landLevyCents: 0,
  },
  junior: {
    label: 'Junior Member',
    description: "Member's child aged 12–18.",
    annualCents: 100,
    joiningFeeCents: 0,
    landLevyCents: 0,
  },
};

/** Add-on members attached to an Ordinary membership (no joining fee — they're existing family). */
export const ADDON_FEES: Record<AddOnCategory, { label: string; annualCents: number; description: string }> = {
  intermediate: {
    label: 'Intermediate Member',
    description: "Your child or young adult aged 19–30. May own Caravan Sites, Boat Shed, and Moorings.",
    annualCents: 249400,
  },
  junior: {
    label: 'Junior Member',
    description: "Your child aged 12–18.",
    annualCents: 100,
  },
};

/** Returns the number of months remaining in the club year from the given date (inclusive of current month). */
export function monthsRemainingInYear(date: Date = new Date()): number {
  const month = date.getMonth() + 1; // 1-based
  // May=12, Jun=11, Jul=10, Aug=9, Sep=8, Oct=7, Nov=6, Dec=5, Jan=4, Feb=3, Mar=2, Apr=1
  return ((4 - month + 12) % 12) + 1;
}

export interface AddOnMember {
  category: AddOnCategory;
  name: string;
  dob: string;
}

export interface CalculatedFees {
  joining_fee_cents: number;
  land_levy_cents: number;
  pro_rata_subs_cents: number;
  months_remaining: number;
  addon_fees_cents: number;
  addon_breakdown: { label: string; cents: number }[];
  total_cents: number;
}

export function calculateFees(
  category: MembershipCategory,
  addons: AddOnMember[] = [],
  date: Date = new Date(),
): CalculatedFees {
  const schedule = CATEGORY_FEES[category];
  const months = monthsRemainingInYear(date);
  const proRata = Math.round((schedule.annualCents * months) / 12);

  const addonBreakdown: { label: string; cents: number }[] = [];
  let addonTotal = 0;

  for (const addon of addons) {
    if (!addon.name.trim()) continue;
    const fee = ADDON_FEES[addon.category];
    const addonProRata = Math.round((fee.annualCents * months) / 12);
    addonBreakdown.push({ label: `${fee.label} — ${addon.name}`, cents: addonProRata });
    addonTotal += addonProRata;
  }

  return {
    joining_fee_cents: schedule.joiningFeeCents,
    land_levy_cents: schedule.landLevyCents,
    pro_rata_subs_cents: proRata,
    months_remaining: months,
    addon_fees_cents: addonTotal,
    addon_breakdown: addonBreakdown,
    total_cents: schedule.joiningFeeCents + schedule.landLevyCents + proRata + addonTotal,
  };
}

export function formatZAR(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
