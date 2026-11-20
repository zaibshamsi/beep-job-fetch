/** Formatting helpers for jobs: numbers, money, dates and descriptions. Locale en-IN, time zone IST. */

const NUM = new Intl.NumberFormat('en-IN');
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
});
const REL = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

export const formatNumber = (n: number) => NUM.format(n);

/** "520 jobs", "1 job". */
export const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export const STIPEND_NONE = 'Unpaid / not stated';

/**
 * Monthly stipend or salary in INR: "₹15,000–20,000/month", "₹15,000/month", "Up to ₹20,000/month",
 * "Unpaid". null when nothing is stated (show STIPEND_NONE, muted).
 */
export function formatStipend(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = min ?? null;
  const hi = max ?? null;
  if (lo == null && hi == null) return null;
  if ((lo ?? 0) <= 0 && (hi ?? 0) <= 0) return 'Unpaid';
  if (lo == null || lo <= 0) return `Up to ₹${NUM.format(hi!)}/month`;
  if (hi != null && hi > lo) return `₹${NUM.format(lo)}–${NUM.format(hi)}/month`;
  return `₹${NUM.format(lo)}/month`;
}

/** Years of experience: "0–1 years", "1 year", "2+ years", "Up to 1 year". */
export function formatExperience(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = min ?? null;
  const hi = max ?? null;
  const yrs = (n: number) => (n === 1 ? 'year' : 'years');
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return lo === hi ? `${lo} ${yrs(lo)}` : `${lo}–${hi} years`;
  if (lo != null) return `${lo}+ years`;
  return `Up to ${hi} ${yrs(hi!)}`;
}

/** "18 Nov 2026" in IST. */
export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : DATE.format(t);
}

/** "18 Nov 2026, 14:43 IST" for title attributes. */
export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : `${DATE_TIME.format(t)} IST`;
}

/** "just now", "35 minutes ago", "2 hours ago", "yesterday", "12 days ago", then the date. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.min(0, t - now) / 1000; // seconds, never in the future
  const abs = -diff;
  if (abs < 60) return 'just now';
  if (abs < 3600) return REL.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return REL.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return REL.format(Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', rupee: '₹',
};

/** Some sources send descriptions with HTML entities left in (&mdash;, &amp;, &#39;). Decode them for display. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Plain-text description to paragraphs: blank lines split paragraphs, single line breaks and runs of
 * spaces collapse, a lone bullet ("-") joins the paragraph after it.
 */
export function toParagraphs(text: string): string[] {
  const out: string[] = [];
  let bullet = false;
  for (const raw of decodeEntities(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const p = raw.replace(/\s+/g, ' ').trim();
    if (!p) continue;
    if (/^[-•*·]$/.test(p)) {
      bullet = true;
      continue;
    }
    out.push(bullet && !/^[-•*·]\s/.test(p) ? `- ${p}` : p);
    bullet = false;
  }
  return out;
}

/** First ~limit characters of the paragraphs, cut at a word, with "…". */
export function clipParagraphs(paras: string[], limit = 1200): { paras: string[]; clipped: boolean } {
  const out: string[] = [];
  let used = 0;
  for (const p of paras) {
    if (used + p.length <= limit) {
      out.push(p);
      used += p.length;
      continue;
    }
    const room = limit - used;
    if (room > 80) {
      const cut = p.slice(0, room);
      const at = cut.lastIndexOf(' ');
      out.push(`${(at > 40 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, '')}…`);
    }
    return { paras: out, clipped: true };
  }
  return { paras: out, clipped: false };
}
