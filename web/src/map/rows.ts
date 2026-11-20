/**
 * Column rows with a stable order. deck.gl transitions interpolate attributes by index, so a city keeps its index for
 * the life of the map: cities that drop out of the filtered summary stay in the array with count 0 (height 0,
 * invisible) and new cities are appended. That way heights animate per city when filters change.
 */
import type { CitySummary, RoleCount } from '../api/types.ts';
import { REMOTE_CENTER, REMOTE_KEY } from './island.ts';

export interface ColumnRow {
  key: string;
  city: string;
  state: string;
  position: [number, number];
  count: number;
  topRoles: RoleCount[];
  isRemote: boolean;
}

/** Mutable registry: key -> index. Kept in a ref by the component. */
export type Registry = Map<string, number>;

export function buildRows(registry: Registry, prev: readonly ColumnRow[], cities: readonly CitySummary[], remoteCount: number): ColumnRow[] {
  const rows: ColumnRow[] = prev.map((r) => ({ ...r, count: 0, topRoles: [] }));
  const put = (row: ColumnRow) => {
    const at = registry.get(row.key);
    if (at === undefined) {
      registry.set(row.key, rows.length);
      rows.push(row);
    } else {
      rows[at] = row;
    }
  };
  put({
    key: REMOTE_KEY,
    city: REMOTE_KEY,
    state: '',
    position: REMOTE_CENTER,
    count: Math.max(0, remoteCount),
    topRoles: [],
    isRemote: true,
  });
  for (const c of cities) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    put({
      key: c.city,
      city: c.city,
      state: c.state,
      position: [c.lng, c.lat],
      count: c.count,
      topRoles: c.topRoles,
      isRemote: false,
    });
  }
  return rows;
}
