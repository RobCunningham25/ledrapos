// Membership category for a member's child, derived from date of birth so
// children move between categories automatically as they age. Bands match the
// VCA application form: Under 12 (included free), Junior 12-18, Intermediate
// 19-30. Over 30 no longer qualifies as a child member.

export type ChildCategory = 'under_12' | 'junior' | 'intermediate' | 'over_age';

export function ageInYears(dob: string, at: Date = new Date()): number {
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00`);
  let age = at.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    at.getMonth() < birth.getMonth() ||
    (at.getMonth() === birth.getMonth() && at.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age;
}

export function childCategory(dob: string): ChildCategory {
  const age = ageInYears(dob);
  if (age < 12) return 'under_12';
  if (age <= 18) return 'junior';
  if (age <= 30) return 'intermediate';
  return 'over_age';
}

export const CHILD_CATEGORY_LABELS: Record<ChildCategory, string> = {
  under_12: 'Under 12',
  junior: 'Junior',
  intermediate: 'Intermediate',
  over_age: 'Over 30',
};

export function childCategoryLabel(dob: string): string {
  return CHILD_CATEGORY_LABELS[childCategory(dob)];
}
