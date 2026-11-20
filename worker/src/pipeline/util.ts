export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Builds "@p0, @p1, ..." and the matching params object for an IN (...) list. */
export function inList(prefix: string, values: readonly unknown[]): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const names = values.map((v, i) => {
    params[`${prefix}${i}`] = v;
    return `@${prefix}${i}`;
  });
  return { sql: names.join(', '), params };
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const sourceKey = (source: string, sourceJobId: string) => `${source}|${sourceJobId}`;
