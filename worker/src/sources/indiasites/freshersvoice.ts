import * as cheerio from 'cheerio';
import { buildAliasIndex, politeFetch, stripHtml, truncate, type JobPost, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, parseDate } from './common.ts';

const API = 'https://www.freshersvoice.com/wp-json/wp/v2';
const POSTS_FIELDS = 'id,date_gmt,link,title,excerpt,categories';
const PER_PAGE = 40;
const MAX_PAGES = 2;
const MIN_DELAY_MS = 3000;

export interface FvPost {
  id: number;
  date_gmt?: string;
  link: string;
  title: { rendered: string };
  excerpt?: { rendered: string };
  categories: number[];
}
/** The raw item keeps category names so normalize() stays pure. */
export interface FvItem extends Omit<FvPost, 'categories'> {
  categoryNames: string[];
}

const aliases = buildAliasIndex();
const KEYWORD = /\s+(?:Off[- ]Campus Drive|Walk-?in Drive|(?:Apprentice |Management Trainee )?Recruitment|Internship|AFCAT)\b/i;

const decode = (s: string) => stripHtml(s).replace(/\s+/g, ' ').trim();

/** Titles look like "<Company> Recruitment 2026 – <Role> | <dates>"; cities come from the post's "<City> Jobs" categories. */
export function parseTitle(rawTitle: string): { company: string | null; role: string } {
  const title = decode(rawTitle);
  const m = title.match(KEYWORD);
  const company = m?.index ? title.slice(0, m.index).trim() : null;
  const after = m ? title.slice((m.index ?? 0) + m[0].length) : title;
  const role = after
    .replace(/^\s*(?:20\d\d)?\s*(?:for|[:–—,-])?\s*/i, '')
    .split(/\s+\|\s+/)[0]!
    .replace(/,?\s*Apply (?:Now|Online)!?$/i, '')
    .trim();
  return { company, role: role || title };
}

export function citiesFrom(categoryNames: string[]): string[] {
  const out = new Set<string>();
  for (const name of categoryNames) {
    const key = name.replace(/\s+Jobs$/i, '').replace(/^Jobs in\s+/i, '').toLowerCase();
    const city = aliases.get(key);
    if (city) out.add(city);
  }
  return [...out];
}

export function parsePosts(posts: FvPost[], categories: Map<number, string>): FvItem[] {
  return posts.map(({ categories: ids, ...rest }) => ({ ...rest, categoryNames: ids.map((id) => categories.get(id)).filter((n): n is string => !!n) }));
}

export function normalizeFreshersVoice(raw: RawPost): JobPost | null {
  const item = raw.payload as FvItem;
  const { company, role } = parseTitle(item.title?.rendered ?? '');
  if (!company || !item.link || isSeniorTitle(role)) return null;
  const cats = item.categoryNames;
  const isIntern = cats.includes('Internship') || /internship/i.test(role);
  const isWalkIn = cats.includes('Walk-in Drive');
  const excerpt = cheerio.load(item.excerpt?.rendered ?? '');
  excerpt('a').remove();
  const cities = citiesFrom(cats);
  return {
    source: raw.source,
    sourceJobId: String(item.id),
    title: truncate(role, 300),
    company: truncate(company, 300),
    locationRaw: cities.length ? cities.join(' | ') : 'India',
    description: truncate(decode(excerpt.root().text()), 1500),
    applyUrl: item.link,
    postedAt: item.date_gmt ? parseDate(`${item.date_gmt}Z`) : null,
    employmentTypeRaw: isIntern ? 'Internship' : isWalkIn ? 'Walk-in drive' : cats.includes('Apprentice') ? 'Apprentice' : null,
    compensationRaw: null,
    sourceHint: isIntern ? 'internship' : 'fresher', // the whole site is a fresher board
  };
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ body: T; totalPages: number }> {
  const res = await politeFetch(url, { minDelayMs: MIN_DELAY_MS, signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { body: (await res.json()) as T, totalPages: Number(res.headers.get('x-wp-totalpages')) || 1 };
}

export const freshersvoice: SourceAdapter = {
  name: 'freshersvoice',
  description: 'FreshersVoice.com: Indian fresher, off-campus, walk-in and internship announcements, via the WordPress REST API.',
  meta: {
    homepage: 'https://www.freshersvoice.com',
    accessMethod: 'feed',
    termsUrl: 'https://www.freshersvoice.com/terms-and-conditions',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18. robots.txt is "User-agent: *" with an empty Disallow (everything allowed). The Terms & Conditions (a generic IT Act intermediary notice) ' +
      'contain no clause on scraping, crawling, copying or automated access. We call only the standard public WordPress REST API (/wp-json/wp/v2/posts and /categories), ' +
      `which is meant for programmatic reads. Limits: robots.txt enforced, >= ${MIN_DELAY_MS} ms between requests, ${MAX_PAGES} pages x ${PER_PAGE} posts per run, ` +
      'we keep title, excerpt and link and always link back to the post. The site has switched its RSS feed off and its terms are silent on reuse, so the owner should confirm this source.',
  },
  unavailableReason: () => null,
  async fetch(ctx) {
    const out: RawPost[] = [];
    try {
      const { body: cats } = await getJson<{ id: number; name: string }[]>(`${API}/categories?per_page=100&_fields=id,name`, ctx.signal);
      const names = new Map(cats.map((c) => [c.id, c.name] as const));
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (ctx.signal?.aborted || out.length >= ctx.maxPostsPerSource) break;
        const { body, totalPages } = await getJson<FvPost[]>(`${API}/posts?per_page=${PER_PAGE}&page=${page}&_fields=${POSTS_FIELDS}`, ctx.signal);
        for (const item of parsePosts(body, names)) {
          if (out.length >= ctx.maxPostsPerSource) break;
          out.push({ source: 'freshersvoice', sourceJobId: String(item.id), payload: item });
        }
        ctx.log.info(`freshersvoice posts page ${page}: ${body.length} items`);
        if (page >= totalPages) break;
      }
    } catch (err) {
      ctx.log.warn(`freshersvoice fetch failed: ${(err as Error).message}`);
    }
    return out;
  },
  normalize: normalizeFreshersVoice,
};
