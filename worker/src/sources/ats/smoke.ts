/**
 * Live smoke run: npx tsx worker/src/sources/ats/smoke.ts [cap] [platform...]
 * Fetches every configured board per platform (stopping at `cap` India postings) and prints counts.
 */
import { createLogger } from '@beep/shared';
import adapters from '../ats.ts';

const FRESHER = /intern|trainee|graduate|fresher|entry|associate|junior|0-1|campus/i;
const [capArg, ...only] = process.argv.slice(2);
const cap = Number(capArg) || 100_000;
const log = createLogger('smoke');

await Promise.all(
  adapters
    .filter((a) => !only.length || only.includes(a.name))
    .map(async (a) => {
      const t0 = Date.now();
      const raws = await a.fetch({ runId: 0, log, maxPostsPerSource: cap });
      const posts = raws.map((r) => a.normalize(r)).filter((p) => p !== null);
      const fresher = posts.filter((p) => FRESHER.test(`${p.title} ${p.employmentTypeRaw ?? ''}`));
      const companies = new Set(posts.map((p) => p.company));
      console.log(
        `${a.name.padEnd(11)} raw=${raws.length} normalized=${posts.length} companies=${companies.size} fresher-looking=${fresher.length} (${Math.round((Date.now() - t0) / 1000)}s)`,
      );
      for (const p of fresher.slice(0, 5)) console.log(`    ${p.company} | ${p.title} | ${p.locationRaw} | ${p.applyUrl}`);
      // Eyeball check for false positives: locations accepted without the word India.
      const odd = [...new Set(posts.map((p) => p.locationRaw).filter((l) => !/india/i.test(l)))];
      console.log(`    locations without "India" (${odd.length}): ${odd.slice(0, 25).join(' / ')}`);
    }),
);
