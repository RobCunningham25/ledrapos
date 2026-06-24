// VCA membership fee calculator.
// Club year runs May 1 → April 30. Pro-rata is based on the month of application;
// the application month is charged in full.

export type MembershipCategory = 'ordinary' | 'social' | 'intermediate' | 'junior' | 'crew_visitor';

interface FeeSchedule {
  label: string;
  description: string;
  annualCents: number;
  joiningFeeCents: number;
  landLevyCents: number; // 0 if not applicable
}

export const CATEGORY_FEES: Record<MembershipCategory, FeeSchedule> = {
  ordinary: {
    label: 'Ordinary Member',
    description: 'Full membership including partner and children under 12. May own Caravan Sites, a Boat Shed, and Moorings.',
    annualCents: 997900,
    joiningFeeCents: 249400,
    landLevyCents: 100000, // first 5 years — admin may waive
  },
  social: {
    label: 'Social Member',
    description: 'Limited to 48 days per year (max 14 consecutive). Includes partner and children under 19.',
    annualCents: 628800,
    joiningFeeCents: 0,
    landLevyCents: 0,
  },
  intermediate: {
    label: 'Intermediate Member',
    description: "For members' children or single persons aged 19–30. May own Caravan Sites, Boat Shed, and Moorings. May not vote or serve on committee.",
    annualCents: 249400,
    joiningFeeCents: 249400,
    landLevyCents: 0,
  },
  junior: {
    label: 'Junior Member',
    description: "Members' children aged 12–18.",
    annualCents: 100, // R1.00
    joiningFeeCents: 0,
    landLevyCents: 0,
  },
  crew_visitor: {
    label: 'Crew Visitor',
    description: '25% of Ordinary Member fee.',
    annualCents: 249400,
    joiningFeeCents: 0,
    landLevyCents: 0,
  },
};

/** Returns the number of months remaining in the club year from the given date (inclusive of current month). */
export function monthsRemainingInYear(date: Date = new Date()): number {
  const month = date.getMonth() + 1; // 1-based
  // May=12, Jun=11, Jul=10, Aug=9, Sep=8, Oct=7, Nov=6, Dec=5, Jan=4, Feb=3, Mar=2, Apr=1
  return ((4 - month + 12) % 12) + 1;
}

export interface CalculatedFees {
  joining_fee_cents: number;
  land_levy_cents: number;
  pro_rata_subs_cents: number;
  months_remaining: number;
  total_cents: number;
}

export function calculateFees(category: MembershipCategory, date: Date = new Date()): CalculatedFees {
  const schedule = CATEGORY_FEES[category];
  const months = monthsRemainingInYear(date);
  const proRata = Math.round((schedule.annualCents * months) / 12);

  return {
    joining_fee_cents: schedule.joiningFeeCents,
    land_levy_cents: schedule.landLevyCents,
    pro_rata_subs_cents: proRata,
    months_remaining: months,
    total_cents: schedule.joiningFeeCents + schedule.landLevyCents + proRata,
  };
}

export function formatZAR(cents: number): string {
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
