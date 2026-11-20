/** Role families for the arcs and the city panel (the 18 API roles grouped by design/roleGroups.ts). */
import { ROLE_CATEGORIES } from '../../api/types.ts';
import type { RoleCategory, RoleCount } from '../../api/types.ts';
import { GROUP_ORDER, groupOf, rolesIn } from '../../design/roleGroups.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';

export interface FamilyCount {
  group: RoleGroup;
  count: number;
}

/** Sum role counts per family, drop empty families, biggest first (ties keep the design's family order). */
export function groupCounts(roles: RoleCount[]): FamilyCount[] {
  const sums = new Map<RoleGroup, number>();
  for (const r of roles) {
    if (r.count > 0) sums.set(groupOf(r.role), (sums.get(groupOf(r.role)) ?? 0) + r.count);
  }
  return [...sums.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

/** The API roles to query for a family: those with jobs when counts are known, otherwise all of its roles. */
export function familyRoles(group: RoleGroup, counts?: RoleCount[] | null): RoleCategory[] {
  const all = rolesIn(group);
  if (!counts) return all;
  const have = new Set(counts.filter((c) => c.count > 0).map((c) => c.role));
  const present = all.filter((r) => have.has(r));
  return present.length > 0 ? present : all;
}

/** Every role the API knows, for one count query each. */
export const ALL_ROLES: readonly RoleCategory[] = ROLE_CATEGORIES;
