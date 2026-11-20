import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });
const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export interface UrlEntry {
  loc: string;
  lastmod: string | null;
}

export interface SitemapDoc {
  kind: 'index' | 'urlset';
  entries: UrlEntry[];
}

/** Decode a response body that may be a gzipped sitemap (`.xml.gz` is served without Content-Encoding). */
export function decodeBody(buf: Uint8Array): string {
  const b = Buffer.from(buf);
  return (b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b).toString('utf8');
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : v && typeof v === 'object' ? text((v as any)['#text']) : '');

export function parseSitemap(body: string): SitemapDoc | null {
  let doc: any;
  try {
    doc = xml.parse(body);
  } catch {
    return null;
  }
  if (doc?.sitemapindex) {
    const entries = arr<any>(doc.sitemapindex.sitemap).map((s) => ({ loc: text(s.loc), lastmod: text(s.lastmod) || null }));
    return { kind: 'index', entries: entries.filter((e) => e.loc) };
  }
  if (doc?.urlset) {
    const entries = arr<any>(doc.urlset.url).map((u) => ({ loc: text(u.loc), lastmod: text(u.lastmod) || null }));
    return { kind: 'urlset', entries: entries.filter((e) => e.loc) };
  }
  return null;
}

/** Item links from an RSS 2.0 or Atom feed. */
export function parseFeed(body: string): UrlEntry[] {
  let doc: any;
  try {
    doc = xml.parse(body);
  } catch {
    return [];
  }
  const out: UrlEntry[] = [];
  for (const item of arr<any>(doc?.rss?.channel?.item)) {
    const loc = text(item.link) || text(item.guid);
    if (/^https?:\/\//.test(loc)) out.push({ loc, lastmod: text(item.pubDate) || null });
  }
  for (const e of arr<any>(doc?.feed?.entry)) {
    const links = arr<any>(e.link);
    const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0];
    const loc = typeof alt === 'string' ? alt : text(alt?.['@href']);
    if (loc) out.push({ loc, lastmod: text(e.updated) || text(e.published) || null });
  }
  return out;
}

/** Anchor hrefs in an HTML listing page, made absolute. */
export function listingLinks(html: string, base: string): UrlEntry[] {
  const out: UrlEntry[] = [];
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      out.push({ loc: new URL(m[1].replace(/&amp;/g, '&'), base).toString(), lastmod: null });
    } catch {
      /* ignore malformed href */
    }
  }
  return out;
}

/** Newest first; entries without a date keep their original order after dated ones. */
export function newestFirst(entries: UrlEntry[]): UrlEntry[] {
  const t = (e: UrlEntry) => (e.lastmod ? Date.parse(e.lastmod) || 0 : 0);
  return entries.map((e, i) => ({ e, i })).sort((a, b) => t(b.e) - t(a.e) || a.i - b.i).map((x) => x.e);
}
