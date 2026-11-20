import { describe, expect, it } from 'vitest';
import { familyRoles, groupCounts } from './families.ts';

describe('groupCounts', () => {
  it('sums roles into families and sorts by count', () => {
    const out = groupCounts([
      { role: 'Software Engineering', count: 23 },
      { role: 'QA / Testing', count: 2 },
      { role: 'Other', count: 35 },
      { role: 'Sales / Business Development', count: 16 },
      { role: 'Customer Support', count: 4 },
    ]);
    expect(out).toEqual([
      { group: 'Other', count: 35 },
      { group: 'Tech', count: 25 },
      { group: 'Sales', count: 20 },
    ]);
  });

  it('drops zero counts and breaks ties by family order', () => {
    const out = groupCounts([
      { role: 'Marketing', count: 3 },
      { role: 'UI / UX Design', count: 0 },
      { role: 'Data / AI / ML', count: 3 },
    ]);
    expect(out.map((o) => o.group)).toEqual(['Data', 'Marketing']);
  });

  it('is empty without jobs', () => {
    expect(groupCounts([])).toEqual([]);
  });
});

describe('familyRoles', () => {
  it('lists the roles of a family that have jobs', () => {
    expect(
      familyRoles('Tech', [
        { role: 'QA / Testing', count: 2 },
        { role: 'Marketing', count: 9 },
      ]),
    ).toEqual(['QA / Testing']);
  });
  it('falls back to every role of the family', () => {
    expect(familyRoles('Design').sort()).toEqual(['Product Management', 'UI / UX Design']);
    expect(familyRoles('Design', [])).toHaveLength(2);
  });
});
