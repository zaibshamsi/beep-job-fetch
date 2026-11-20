import { XMLParser } from 'fast-xml-parser';
import { fetchText, stripHtml, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, remoteIndiaLocation, toDate, toJobPost } from './common.ts';

const FEED = 'https://weworkremotely.com/remote-jobs.rss';

export interface WwrItem {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  region?: string;
  type?: string;
  category?: string;
  description?: string;
}

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, parseTagValue: false });

export function parseWwrFeed(xml: string): WwrItem[] {
  const items = parser.parse(xml)?.rss?.channel?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}

export const weworkremotely: SourceAdapter = {
  name: 'weworkremotely',
  description: 'We Work Remotely public RSS feed, only posts open to India / Asia / worldwide.',
  meta: {
    homepage: 'https://weworkremotely.com',
    accessMethod: 'feed',
    termsUrl: 'https://weworkremotely.com/remote-job-rss-feed',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Verified 2026-11-18: the RSS page says "Anyone can use the feed, all we ask is that you attribute the links back to We Work Remotely"; ' +
      'robots.txt allows / (only admin/account paths disallowed). No rate limit published, so one request per run through the polite throttle. ' +
      'Kept only when <region> is "Anywhere in the World" or "Asia Only"; apply link = the WWR job URL (link back required).',
  },
  unavailableReason: () => null,
  async fetch(ctx) {
    const xml = await fetchText(FEED, { signal: ctx.signal });
    const items = parseWwrFeed(xml);
    const out: RawPost[] = [];
    for (const item of items) {
      const id = item.guid || item.link;
      if (!id || !remoteIndiaLocation(item.region)) continue;
      out.push({ source: 'weworkremotely', sourceJobId: id, payload: item });
      if (out.length >= ctx.maxPostsPerSource) break;
    }
    ctx.log.info(`weworkremotely: ${out.length} of ${items.length} posts are open to India`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as WwrItem;
    const location = remoteIndiaLocation(j.region);
    if (!location || !j.link || !j.title) return null;
    // Feed titles look like "Company: Job title"
    const split = j.title.indexOf(': ');
    const company = split > 0 ? j.title.slice(0, split) : 'Confidential';
    const title = split > 0 ? j.title.slice(split + 2) : j.title;
    if (isSeniorTitle(title)) return null;
    return toJobPost({
      source: 'weworkremotely',
      sourceJobId: raw.sourceJobId,
      title: stripHtml(title),
      company: stripHtml(company),
      locationRaw: location,
      description: stripHtml(j.description ?? ''),
      applyUrl: j.link,
      postedAt: toDate(j.pubDate),
      employmentTypeRaw: j.type?.trim() || null,
    });
  },
};
