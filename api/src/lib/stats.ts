import { query } from '@beep/shared';
import { accuracySummary } from './accuracy.ts';
import { parseJson } from './jobs.ts';
import { listRuns, type RunInfo } from './pipeline.ts';

const ACTIVE = `j.status = 'active' AND j.is_fresher = 1`;
const TAG_PURPOSES = `('tag_jev', 'tag_llm')`;
const ACTIVE_RUN_STATUSES = ['queued', 'running'];
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

async function totals() {
  const [[counts], byRole, byCity, bySource] = await Promise.all([
    query<{ active: number; newToday: number; needsReview: number }>(
      `SELECT COUNT(*) AS active,
              SUM(CASE WHEN j.first_seen_at >= DATEADD(hour, -24, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS newToday,
              SUM(CASE WHEN j.needs_review = 1 THEN 1 ELSE 0 END) AS needsReview
       FROM jobs j WHERE ${ACTIVE}`,
    ),
    query<{ role: string | null; count: number }>(
      `SELECT COALESCE(j.role_category, 'Untagged') AS role, COUNT(*) AS count FROM jobs j WHERE ${ACTIVE} GROUP BY j.role_category ORDER BY count DESC`,
    ),
    query<{ city: string; count: number }>(
      `SELECT TOP 15 c.name AS city, COUNT(DISTINCT j.id) AS count
       FROM jobs j JOIN job_cities jc ON jc.job_id = j.id JOIN cities c ON c.id = jc.city_id
       WHERE ${ACTIVE} GROUP BY c.name ORDER BY count DESC, c.name`,
    ),
    query<{ source: string; count: number }>(
      `SELECT js.source, COUNT(DISTINCT j.id) AS count FROM jobs j JOIN job_sources js ON js.job_id = j.id
       WHERE ${ACTIVE} GROUP BY js.source ORDER BY count DESC`,
    ),
  ]);
  const num = <T extends { count: number }>(rows: T[]) => rows.map((r) => ({ ...r, count: Number(r.count) }));
  return {
    activeJobs: Number(counts?.active ?? 0),
    newToday: Number(counts?.newToday ?? 0),
    needsReview: Number(counts?.needsReview ?? 0),
    byRole: num(byRole),
    byCity: num(byCity),
    bySource: num(bySource),
  };
}

/** Per-source health: the sources table (terms, notes) joined with active-post counts and the last run's counters. */
async function sourceStatus(lastRun: RunInfo | null, counts: { source: string; count: number }[]) {
  const rows = await query<Record<string, any>>(
    `SELECT name, description, homepage, access_method, terms_url, terms_status, terms_notes, robots_checked_at, enabled, last_run_at, last_status FROM sources`,
  );
  const perSource = lastRun?.stats?.perSource ?? {};
  const names = new Set<string>([...rows.map((r) => r.name), ...Object.keys(perSource), ...counts.map((c) => c.source)]);
  return [...names].sort().map((name) => {
    const r = rows.find((x) => x.name === name);
    return {
      name,
      description: r?.description ?? null,
      homepage: r?.homepage ?? null,
      accessMethod: r?.access_method ?? null,
      termsUrl: r?.terms_url ?? null,
      termsStatus: r?.terms_status ?? 'unchecked',
      termsNotes: r?.terms_notes ?? null,
      robotsCheckedAt: r?.robots_checked_at ? new Date(r.robots_checked_at).toISOString() : null,
      enabled: r ? !!r.enabled : true,
      lastRunAt: r?.last_run_at ? new Date(r.last_run_at).toISOString() : null,
      lastStatus: r?.last_status ?? null,
      activeJobs: counts.find((c) => c.source === name)?.count ?? 0,
      lastRun: perSource[name] ?? null,
    };
  });
}

async function llmUsage() {
  const rows = await query<Record<string, any>>(
    `SELECT provider, model, purpose, COUNT(*) AS calls, SUM(CASE WHEN success = 1 THEN 0 ELSE 1 END) AS failures,
            SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens, SUM(cached_tokens) AS cachedTokens,
            SUM(cost_usd) AS costUsd, AVG(CAST(latency_ms AS FLOAT)) AS avgLatencyMs
     FROM llm_calls GROUP BY provider, model, purpose ORDER BY costUsd DESC, calls DESC`,
  );
  const byModel = rows.map((r) => ({
    provider: r.provider as string,
    model: r.model as string,
    purpose: r.purpose as string,
    calls: Number(r.calls),
    failures: Number(r.failures),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    cachedTokens: Number(r.cachedTokens),
    costUsd: round(Number(r.costUsd), 6),
    avgLatencyMs: r.avgLatencyMs == null ? null : Math.round(Number(r.avgLatencyMs)),
  }));
  const sum = (f: (r: (typeof byModel)[number]) => number) => byModel.reduce((n, r) => n + f(r), 0);
  return {
    totals: {
      calls: sum((r) => r.calls),
      inputTokens: sum((r) => r.inputTokens),
      outputTokens: sum((r) => r.outputTokens),
      cachedTokens: sum((r) => r.cachedTokens),
      costUsd: round(sum((r) => r.costUsd), 6),
    },
    byModel,
  };
}

/**
 * Tagging cost per 1,000 posts = model cost of the runs that used the full chain (Jev answered) / posts those runs tagged
 * (stats.newJobs; falls back to distinct posts that reached a model). Null when nothing was tagged yet.
 */
async function costPer1000() {
  const perRun = await query<{ run_id: number; cost: number; jevCost: number; llmCost: number; jobs: number; llmJobs: number }>(
    `SELECT run_id, SUM(cost_usd) AS cost,
            SUM(CASE WHEN purpose = 'tag_jev' THEN cost_usd ELSE 0 END) AS jevCost,
            SUM(CASE WHEN purpose = 'tag_llm' THEN cost_usd ELSE 0 END) AS llmCost,
            COUNT(DISTINCT job_id) AS jobs,
            COUNT(DISTINCT CASE WHEN purpose = 'tag_llm' THEN job_id END) AS llmJobs
     FROM llm_calls WHERE purpose IN ${TAG_PURPOSES} AND run_id IN (SELECT id FROM pipeline_runs WHERE status = 'success') GROUP BY run_id
     -- only runs where the shipped chain worked (Jev answered); a run where Jev was down tagged everything with the LLM and would overstate the cost
     HAVING SUM(CASE WHEN provider = 'jev' AND success = 1 THEN 1 ELSE 0 END) > 0`,
  );
  let tagging: Record<string, number> | null = null;
  if (perRun.length) {
    const runIds = perRun.map((r) => Number(r.run_id));
    const params: Record<string, unknown> = {};
    const ph = runIds.map((id, i) => ((params[`r${i}`] = id), `@r${i}`)).join(',');
    const statRows = await query<{ id: number; stats: string | null }>(`SELECT id, stats FROM pipeline_runs WHERE id IN (${ph})`, params);
    let cost = 0;
    let jev = 0;
    let llm = 0;
    let posts = 0;
    let llmPosts = 0;
    for (const r of perRun) {
      const stats = parseJson<{ newJobs?: number } | null>(statRows.find((s) => Number(s.id) === Number(r.run_id))?.stats, null);
      cost += Number(r.cost);
      jev += Number(r.jevCost);
      llm += Number(r.llmCost);
      posts += stats?.newJobs ? Number(stats.newJobs) : Number(r.jobs);
      llmPosts += Number(r.llmJobs);
    }
    if (posts > 0) {
      tagging = {
        costUsd: round(cost, 6),
        jevCostUsd: round(jev, 6),
        llmCostUsd: round(llm, 6),
        postsTagged: posts,
        per1000Posts: round((cost / posts) * 1000, 4),
        escalationRate: round(Math.min(1, llmPosts / posts), 4),
        runs: perRun.length,
      };
    }
  }

  const [s] = await query<{ calls: number; cost: number }>(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost FROM llm_calls WHERE purpose = 'search_parse'`,
  );
  const [h] = await query<{ hits: number }>(`SELECT COALESCE(SUM(hits), 0) AS hits FROM search_cache`);
  // Cached parses cost nothing but are still searches; they belong in the denominator.
  const searches = Number(s?.calls ?? 0) + Number(h?.hits ?? 0);
  const searchCost = Number(s?.cost ?? 0);
  return {
    tagging,
    search: searches > 0 ? { costUsd: round(searchCost, 6), searches, per1000Searches: round((searchCost / searches) * 1000, 4) } : null,
  };
}

export async function buildStats() {
  const [recentRuns, tot, usage, cost, accuracy] = await Promise.all([listRuns(10), totals(), llmUsage(), costPer1000(), accuracySummary()]);
  const lastRun = recentRuns.find((r) => !ACTIVE_RUN_STATUSES.includes(r.status)) ?? null;
  const activeRun = recentRuns.find((r) => ACTIVE_RUN_STATUSES.includes(r.status)) ?? null;
  const sources = await sourceStatus(lastRun, tot.bySource);
  return { lastRun, activeRun, recentRuns, totals: tot, sources, llmUsage: usage, costPer1000: cost, accuracy };
}
