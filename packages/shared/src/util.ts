import { createHash } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TRACKING_PARAMS =
  /^(utm_.+|gclid|fbclid|ref|refid|referrer|source|src|trk|trackingid|campaign|cmpid|mc_.+|_ga|lipi|midtoken)$/i;

/** Canonical URL: lowercase host, no fragment, no tracking params, sorted query, no trailing slash. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    const keep = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of keep) u.searchParams.append(k, v);
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export const urlHash = (url: string) => sha256(canonicalizeUrl(url));

const COMPANY_SUFFIX =
  /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|incorporated|corp\.?|corporation|co\.?|technologies|technology|solutions|services|india|software|systems)\b/gi;

/** Normalised company string for matching (not for display). */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9+# ]+/g, ' ')
    .replace(/\b(the|a|an|for|and|of|at|in)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', copy: '©',
  reg: '®', trade: '™', euro: '€', rupee: '₹', times: '×', laquo: '«', raquo: '»',
  eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', ccedil: 'ç', ouml: 'ö', uuml: 'ü',
};
const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

function decodeEntity(match: string, body: string): string {
  if (body[0] === '#') {
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
  }
  return NAMED[body.toLowerCase()] ?? match;
}

/** Decode HTML entities (named, decimal and hex) to plain characters. Unknown names are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, decodeEntity);
}

/** HTML to readable plain text. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(ENTITY_RE, decodeEntity)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Character-trigram Jaccard similarity in [0,1]. Used for fuzzy title matching. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = `  ${s} `;
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}
