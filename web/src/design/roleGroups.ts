/**
 * The 18 role categories from the API are shown as 7 colour families on the map (arcs around a city,
 * the city panel, job-card avatars). One place defines the grouping so every screen agrees.
 */
import type { RoleCategory } from '../api/types.ts';

export type RoleGroup = 'Tech' | 'Data' | 'Sales' | 'Marketing' | 'Design' | 'Ops' | 'Other';

export const GROUP_COLOR: Record<RoleGroup, string> = {
  Tech: '#8B5CF6',
  Data: '#5AA9FF',
  Sales: '#FFB23F',
  Marketing: '#FF4F7B',
  Design: '#3BE3B4',
  Ops: '#F7A8D8',
  Other: '#A9A2B6',
};

export const GROUP_ORDER: RoleGroup[] = ['Tech', 'Data', 'Sales', 'Marketing', 'Design', 'Ops', 'Other'];

const GROUP_OF: Record<RoleCategory, RoleGroup> = {
  'Software Engineering': 'Tech',
  'QA / Testing': 'Tech',
  'DevOps / Cloud': 'Tech',
  Cybersecurity: 'Tech',
  'Core Engineering': 'Tech',
  'Data / AI / ML': 'Data',
  'Business / Data Analyst': 'Data',
  'Sales / Business Development': 'Sales',
  'Customer Support': 'Sales',
  Marketing: 'Marketing',
  'Content / Writing': 'Marketing',
  'UI / UX Design': 'Design',
  'Product Management': 'Design',
  'Operations / Supply Chain': 'Ops',
  'HR / Recruiting': 'Ops',
  'Finance / Accounting': 'Ops',
  Consulting: 'Ops',
  Other: 'Other',
};

export const groupOf = (role: RoleCategory | null | undefined): RoleGroup => (role ? GROUP_OF[role] : 'Other');
export const colorOf = (role: RoleCategory | null | undefined): string => GROUP_COLOR[groupOf(role)];

/** Roles that belong to a group, for turning a group chip back into an API role filter list. */
export const rolesIn = (g: RoleGroup): RoleCategory[] =>
  (Object.keys(GROUP_OF) as RoleCategory[]).filter((r) => GROUP_OF[r] === g);

/** Company avatar hue (0-359) from a name, stable between renders. */
export const hueOf = (name: string): number => {
  const hues = [30, 345, 270, 320, 15, 195];
  return hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
};
