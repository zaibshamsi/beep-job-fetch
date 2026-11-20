import type { JobListItem } from '../../api/types.ts';

const when = (j: JobListItem) => Date.parse(j.postedAt ?? j.firstSeenAt) || 0;

/**
 * Merge the pages of several per-role queries (a role family highlighted on the map) into one list.
 * Newest first merges by date; relevance keeps each query's own order and interleaves by rank.
 * One query is returned as it is. Duplicate ids are dropped.
 */
export function mergeLists(lists: JobListItem[][], sort: 'newest' | 'relevance'): JobListItem[] {
  const nonEmpty = lists.filter((l) => l.length > 0);
  const seen = new Set<number>();
  const out: JobListItem[] = [];
  const push = (j: JobListItem) => {
    if (seen.has(j.id)) return;
    seen.add(j.id);
    out.push(j);
  };
  if (nonEmpty.length <= 1) {
    for (const j of nonEmpty[0] ?? []) push(j);
    return out;
  }
  if (sort === 'relevance') {
    const longest = Math.max(...nonEmpty.map((l) => l.length));
    for (let i = 0; i < longest; i++) for (const l of nonEmpty) if (l[i]) push(l[i]!);
    return out;
  }
  [...nonEmpty.flat()].sort((a, b) => when(b) - when(a) || b.id - a.id).forEach(push);
  return out;
}
