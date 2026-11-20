# Engineering Guide

Read [PRD.md](PRD.md) for the product. This file is the contract every module codes against.

## Layout

```
packages/shared   env, db (mssql), logger, zod types, SourceAdapter contract, polite HTTP, util, cities, pricing
packages/ai       rules (no-cost tagging), Jev + LLM providers, settings store, LangGraph enrich graph, NL search parse
worker            pipeline runner + cron + source adapters (worker/src/sources/*)
api               Express REST API
web               React app (later)
db/migrations     SQL Server migrations (npm run db:migrate)
```

- TypeScript ES modules, run with `tsx`. Import with explicit `.ts` extensions inside a package.
- Cross-package imports use `@beep/shared` and `@beep/ai` only. No deep imports.
- Tests: `vitest`, files named `*.test.ts` next to the code. Run `npx vitest run <path>`. Tests must not need network or DB unless the file is named `*.int.test.ts`.
- Type check everything with `npx tsc -p tsconfig.json --noEmit` from the repo root. Keep it clean.
- Never run `npm install` at the repo root. Dependencies are pre-installed. If you need one more package: `npm install <pkg> -w <workspace>`; retry once if npm reports a lock error (other agents may be installing).
- Never commit. Never write secrets into tracked files. Config comes from `.env` through `env` in `@beep/shared`.

## Database

SQL Server `beepjobfetch` on the local server; connection from `.env`. Schema is in `db/migrations/001_init.sql`
(tables: sources, pipeline_runs, raw_posts, cities, jobs, job_sources, job_cities, llm_calls, app_settings, search_cache).
Use `query()` / `exec()` / `withTransaction()` from `@beep/shared` with named `@param` placeholders. Never build SQL by concatenating values.
If you need a schema change, add a NEW migration file `db/migrations/00N_name.sql` (next free number, check the folder first) and run `npm run db:migrate`. Never edit an applied migration.

## Pipeline contract

```
fetch -> store raw -> normalize -> fresher filter -> dedupe -> enrich -> publish -> lifecycle
```

- Manual run: the API inserts a `pipeline_runs` row with `status = 'queued'`; the worker polls for queued rows every 5 s and runs them. Only one run may be `queued`/`running` at a time.
- Run statuses: `queued`, `running`, `success`, `partial` (some sources failed), `failed`.
- `pipeline_runs.stage` shows the current stage while running; `pipeline_runs.stats` holds `RunStats` JSON (see `packages/shared/src/types.ts`).

## Source rules (ethics are part of the grade)

1. Prefer official APIs and public machine-readable feeds meant for programmatic use.
2. For any HTML page, `politeFetch` checks robots.txt for us. Do not bypass it. Do not fake a browser User-Agent. Do not log in, solve CAPTCHAs, or evade rate limits or blocks.
3. Read the site's Terms of Service / API terms before writing the adapter. If scraping or automated access is forbidden, do NOT build the adapter; record it as `forbidden` in your report instead.
4. Respect rate limits: `politeFetch` throttles per host (1 s default). Be gentler for small sites.
5. Keep only what we need to show a listing and link out (title, company, location, short description, apply URL). Always link back to the source.
6. Fill `meta` on every adapter honestly: `termsStatus`, `termsUrl`, and `termsNotes` (what you checked, on what date, and the limits you follow).

## Adapter checklist

- File in `worker/src/sources/`, `export default` an adapter or array. The registry auto-discovers it. Name files by source (e.g. `greenhouse.ts`).
- `fetch()` respects `ctx.maxPostsPerSource` and `ctx.signal`, never throws for one bad item, logs via `ctx.log`.
- `normalize()` returns a `JobPost` that passes `JobPostSchema` (strip HTML with `stripHtml`, absolute apply URL, `postedAt` as a Date or null) or null.
- India only: keep a post only if its location is in India or clearly says India / remote-in-India. Do not pass non-India posts on.
- Do not filter for freshers inside the adapter (the pipeline's fresher filter does that), EXCEPT to avoid enormous volume from huge boards: you may drop posts whose title clearly says senior/lead/principal/director/manager/architect/staff/head/vp. Set `sourceHint` to `'internship'` or `'fresher'` when the source itself is a fresher/internship board.
- Unit-test `normalize()` with fixtures saved from the real response (trimmed). Live smoke test `fetch()` once with a small cap and report real counts.

## AI contract

See `packages/ai/src/contracts.ts`. `enrichPost(post)` is the single entry point the pipeline calls. Provider keys live in `app_settings` (encrypted) with `.env` fallback; the UI value wins.

- Jev (TypeSafe AI): `@typesafe-ai/sdk`, typed Choice/Score/Noul decisions with confidence; cannot extract free text. Docs: https://docs.typesafe.ai
- LLM: an Azure AI Foundry deployment (OpenAI-compatible). Config: endpoint, key, deployment name, api version. Use it for free-value extraction and low-confidence re-tagging, and for NL search parsing.
- Every provider call writes a row to `llm_calls` with tokens and `costUsd()` from `@beep/shared`.
- With no keys configured, everything must still work in rules-only mode (never throw because a key is missing).

## Quality bar

Small, readable files. Explain the "why" in comments only where it is not obvious. Fail soft: one bad item or one failing source never stops a run. Log counts at every stage. No dead code, no TODO left behind without saying so in your report.
