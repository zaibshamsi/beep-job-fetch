/**
 * Re-verifies ats/companies.json against the live platform APIs and prints India openings per board.
 *
 *   npx tsx worker/src/sources/ats/verify-companies.ts                 report only
 *   npx tsx worker/src/sources/ats/verify-companies.ts --write         also drop dead boards from companies.json
 *   npx tsx worker/src/sources/ats/verify-companies.ts --pool f.txt    discover: try every slug in f.txt
 *                                                                      (whitespace separated; `slug`, `slug=Name` or
 *                                                                      `platform/slug=Name`; bare slugs are tried
 *                                                                      on every platform, or those in --only a,b);
 *                                                                      with --write, add live
 *                                                                      boards that have at least one job
 *
 * Boards on different hosts are checked concurrently; each host is still limited to one request per second.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ashby } from './ashby.ts';
import { greenhouse } from './greenhouse.ts';
import { lever } from './lever.ts';
import { fetchBoard, loadCompanies, toPosting } from './make-adapter.ts';
import type { Company, Platform, PlatformDef } from './types.ts';
import { workable } from './workable.ts';

const DEFS: Record<Platform, PlatformDef> = { greenhouse, lever, ashby, workable };
const FILE = fileURLToPath(new URL('./companies.json', import.meta.url));

const args = process.argv.slice(2);
const write = args.includes('--write');
const poolFile = args.includes('--pool') ? args[args.indexOf('--pool') + 1] : undefined;
const only = args.includes('--only') ? (args[args.indexOf('--only') + 1] ?? '').split(',') : null;

const pretty = (slug: string) =>
  slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();

interface Result {
  company: Company;
  total: number;
  india: number;
}

async function check(company: Company): Promise<Result | null> {
  const def = DEFS[company.platform];
  const board = await fetchBoard(def, company.slug, false);
  if (!board) return null;
  const india = board.jobs.filter((j) => toPosting(def, j, company)).length;
  const first = board.jobs[0] as { company_name?: string } | undefined;
  const name = def.boardName?.(board.json) || first?.company_name || company.name;
  return { company: { ...company, name }, total: board.jobs.length, india };
}

function candidates(): Company[] {
  if (!poolFile) return loadCompanies().filter((c) => !only || only.includes(c.platform));
  const entries = readFileSync(poolFile, 'utf8')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const [head, ...name] = t.split('=');
      const [only, slug] = head!.includes('/') ? head!.split('/') : [null, head!];
      return {
        only: only as Platform | null,
        slug: slug!,
        name: name.join('=').replace(/_/g, ' ') || pretty(slug!),
      };
    });
  const seen = new Set<string>();
  const out: Company[] = [];
  for (const e of entries) {
    for (const platform of e.only ? [e.only] : (Object.keys(DEFS) as Platform[])) {
      if (only && !only.includes(platform)) continue;
      const key = `${platform}/${e.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ platform, slug: e.slug, name: e.name });
      }
    }
  }
  return out;
}

const keyOf = (c: Company) => `${c.platform}/${c.slug}`;

function save(boards: Iterable<Company>) {
  const sorted = [...boards].sort((a, b) => a.platform.localeCompare(b.platform) || a.slug.localeCompare(b.slug));
  writeFileSync(FILE, `[\n${sorted.map((c) => ` ${JSON.stringify(c)}`).join(',\n')}\n]\n`);
  return sorted.length;
}

async function main() {
  const list = candidates();
  const byPlatform = new Map<Platform, Company[]>();
  for (const c of list) byPlatform.set(c.platform, [...(byPlatform.get(c.platform) ?? []), c]);

  // Discovery adds to the existing list; a plain re-verify rebuilds it from the boards that still answer.
  const untouched = loadCompanies().filter((c) => poolFile || (only && !only.includes(c.platform)));
  const kept = new Map<string, Company>(untouched.map((c) => [keyOf(c), c]));
  const results: Result[] = [];
  await Promise.all(
    [...byPlatform.values()].map(async (group) => {
      for (const c of group) {
        const r = await check(c);
        if (!r || (poolFile && !r.total)) continue;
        results.push(r);
        console.log(`${c.platform.padEnd(10)} ${c.slug.padEnd(28)} jobs=${String(r.total).padStart(4)} india=${r.india}`);
        if (write) {
          kept.set(keyOf(r.company), r.company);
          save(kept.values()); // flush as we go so an interrupted run loses nothing
        }
      }
    }),
  );

  const summary = (Object.keys(DEFS) as Platform[]).map((p) => {
    const rs = results.filter((r) => r.company.platform === p);
    return `${p}: ${rs.length} boards, ${rs.reduce((n, r) => n + r.india, 0)} India openings, ${rs.filter((r) => r.india > 0).length} boards with India`;
  });
  console.log(`\nchecked ${list.length}, live ${results.length}, dead ${list.length - results.length}`);
  for (const s of summary) console.log(s);
  if (write) console.log(`companies.json now has ${save(kept.values())} boards`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
