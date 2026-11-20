/** Small helpers shared by the India fresher-site adapters. */

const SENIOR = /\b(senior|sr\.?|lead(?! gen)|principal|director|manager|architect|staff|head|vp|vice president)\b/i;

/** The engineering guide lets adapters drop clearly senior titles to avoid huge volumes. */
export const isSeniorTitle = (title: string): boolean => SENIOR.test(title);

/** Parses ISO strings and Unstop's "2026-11-18 00:50:01 GMT+0530" form. Returns null when unparseable. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) GMT([+-]\d{2})(\d{2})$/);
  const iso = m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : value.trim();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
