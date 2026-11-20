/** Formatters for the ops pages (Insights, Settings, Review). Indian digit grouping, IST times, plain units. */

const NBSP = ' ';
const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 1234567 -> "12,34,567". null/undefined -> "–". */
export function formatInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return intFmt.format(Math.round(n));
}

/** USD with a fixed number of decimals: 0.05333 -> "$0.0533". */
export function formatUsd(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (n < 0 ? '-$' : '$') + f.format(Math.abs(n));
}

/** A percentage already on 0..100: 96.5 -> "96.5%", 92 -> "92%". */
export function formatPercent(p: number | null | undefined, digits = 1): string {
  if (p == null || !Number.isFinite(p)) return '–';
  const f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits });
  return `${f.format(p)}%`;
}

/** A ratio on 0..1: 0.028 -> "2.8%". */
export function formatRate(r: number | null | undefined, digits = 1): string {
  if (r == null || !Number.isFinite(r)) return '–';
  return formatPercent(r * 100, digits);
}

/** Durations: "850 ms", "4.2 s", "41 s", "12 min 54 s", "1 h 05 min". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '–';
  if (ms < 1000) return `${Math.round(ms)}${NBSP}ms`;
  const s = ms / 1000;
  if (s < 10) return `${(Math.round(s * 10) / 10).toFixed(1)}${NBSP}s`;
  if (s < 60) return `${Math.round(s)}${NBSP}s`;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}${NBSP}h ${String(m).padStart(2, '0')}${NBSP}min`;
  return sec === 0 ? `${m}${NBSP}min` : `${m}${NBSP}min ${sec}${NBSP}s`;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "in 5 min". */
export function formatRelative(iso: string | Date | null | undefined, now: Date = new Date()): string {
  if (!iso) return '–';
  const t = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(t.getTime())) return '–';
  const diff = now.getTime() - t.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff) / 1000;
  const wrap = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (abs < 45) return 'just now';
  if (abs < 3600) return wrap(`${Math.max(1, Math.round(abs / 60))}${NBSP}min`);
  if (abs < 86400) return wrap(`${Math.round(abs / 3600)}${NBSP}h`);
  const days = Math.round(abs / 86400);
  if (days === 1) return future ? 'tomorrow' : 'yesterday';
  if (days < 30) return wrap(`${days}${NBSP}days`);
  return formatDate(t);
}

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** "18 Nov, 14:30 IST" (always Indian time, the product's market). */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '–';
  const t = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(t.getTime())) return '–';
  const parts = Object.fromEntries(dateTimeFmt.formatToParts(t).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.day} ${parts.month}, ${hour}:${parts.minute}${NBSP}IST`;
}

/** "18 Nov 2026". */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '–';
  const t = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(t.getTime())) return '–';
  return dateFmt.format(t);
}

/** "1 job" / "520 jobs". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatInt(n)}${NBSP}${n === 1 ? one : many}`;
}

/** One CSV cell, quoted when needed (RFC 4180). */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export type AiMode = 'full' | 'jev_only' | 'llm_only' | 'rules_only';

/** The tagging mode in the app's own words (the API's `modeLabel` text is not used on screen). */
export function aiModeLine(mode: AiMode): string {
  switch (mode) {
    case 'full':
      return 'Jev + LLM: full tagging';
    case 'jev_only':
      return 'Jev only: rules + Jev';
    case 'llm_only':
      return 'LLM only: rules + LLM';
    default:
      return 'Rules only: AI tagging is off';
  }
}
