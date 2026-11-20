# REST API

Base URL: `http://localhost:4000` (`API_PORT`). JSON in, JSON out, camelCase fields, ISO-8601 UTC timestamps.
CORS allows only `WEB_ORIGIN` (default `http://localhost:5173`). Start with `npm run api` (watch) or `npm run start -w api`.

## Conventions

**Errors** always have this shape (some add extra top-level fields, noted below):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "pageSize: Number must be less than or equal to 100" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | bad query param, path param or body (message lists each problem) |
| 400 | `BAD_JSON` | body is not valid JSON |
| 400 | `UNKNOWN_JOB` | `PUT /accuracy/labels` references a job id that does not exist |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | admin token missing / wrong (see Auth) |
| 404 | `NOT_FOUND` | unknown route, job or run |
| 409 | `RUN_ACTIVE` | a pipeline run is already queued or running (adds `runId`) |
| 413 | `PAYLOAD_TOO_LARGE` | body over 512 kB |
| 500 | `INTERNAL` | unexpected error (details only in the server log) |
| 503 | `DB_UNAVAILABLE` | SQL Server is unreachable |

**Auth.** If `ADMIN_TOKEN` is set in `.env`, send `x-admin-token: <token>` on everything under `/settings/*`, `/accuracy/*` and on `POST /pipeline/run`. With no token configured these are open (local use). Everything else is always public.

**Visibility.** The public job endpoints (`/jobs`, `/cities/summary`, `/filters/options`, stats totals) only count posts with `status = 'active'` and `is_fresher = 1`. `GET /jobs/:id` returns any status so shared links to an expired post still open.

---

## GET /health

```json
{ "ok": true, "db": true }
```
Always 200 while the process is up. `db: false` means SQL Server did not answer.

---

## GET /jobs

Query parameters (all optional):

| Param | Type | Notes |
|---|---|---|
| `q` | string | Every whitespace-separated word must appear in the post's search text (title, company, role, cities, skills). `% _ [ ]` are literal characters. Max 10 words. |
| `role` | string | Role category, exactly as in `/filters/options` (for example `Data / AI / ML`) |
| `city` | string, repeatable | `city=Pune&city=Mumbai` matches either. `city=Remote` also matches remote-mode posts. |
| `jobType` | `internship` `full_time` `apprenticeship` `contract` | |
| `workMode` | `onsite` `hybrid` `remote` | |
| `stipendMin` | number | INR per month. A post matches when its top stipend is at least this. `1` means "any stipend / paid". |
| `postedWithinDays` | integer | Uses `postedAt`, falling back to `firstSeenAt` |
| `source` | string | Source name, for example `greenhouse` (matches any source link of the post) |
| `isNew` | `true` | Only posts first seen in the last 24 h |
| `page` | integer, default 1 | |
| `pageSize` | integer, default 25, max 100 | |
| `sort` | `newest` (default) `relevance` | `relevance` ranks title and company hits first, then newest; with no `q` it equals `newest` |

```
GET /jobs?q=python&city=Pune&jobType=internship&stipendMin=1&pageSize=2
```

```json
{
  "items": [
    {
      "id": 412,
      "title": "Python Developer Intern",
      "company": "Acme Labs",
      "cities": ["Pune"],
      "locationRaw": "Pune, Maharashtra, India",
      "roleCategory": "Software Engineering",
      "jobType": "internship",
      "workMode": "onsite",
      "stipendMinMonthlyInr": 20000,
      "stipendMaxMonthlyInr": 30000,
      "skills": ["python", "sql", "django"],
      "postedAt": "2026-11-16T08:30:00.000Z",
      "firstSeenAt": "2026-11-17T06:02:11.000Z",
      "isNew": true,
      "sources": [
        { "source": "greenhouse", "applyUrl": "https://boards.greenhouse.io/acme/jobs/123" },
        { "source": "adzuna", "applyUrl": "https://www.adzuna.in/land/ad/456" }
      ],
      "snippet": "Join our platform team to build internal tools in Python..."
    }
  ],
  "total": 37,
  "page": 1,
  "pageSize": 2
}
```

Field notes: `cities` are canonical gazetteer names; remote-only posts have `cities: []` and `workMode: "remote"` (there is no "Remote" entry in `cities`). `postedAt` may be `null`. `isNew` is true when `firstSeenAt` is under 24 h old. `sources[0]` is the primary source. `snippet` is the first 240 characters of the description, whitespace collapsed. Role, job type, work mode and stipend fields can be `null` for untagged posts.

## GET /jobs/:id

Everything in a list item, plus:

```json
{
  "id": 412,
  "title": "Python Developer Intern",
  "...": "all list-item fields",
  "description": "Full plain-text description ...",
  "status": "active",
  "experienceMinYears": 0,
  "experienceMaxYears": 1,
  "needsReview": false,
  "confidence": 0.92,
  "taggedBy": { "roleCategory": "jev", "cities": "rules", "stipendMinMonthlyInr": "llm" },
  "promptVersion": "tag.v1",
  "employmentTypeRaw": "Internship",
  "compensationRaw": "INR 20,000 - 30,000 per month"
}
```
404 `NOT_FOUND` for unknown ids, 400 for non-numeric ids.

---

## GET /cities/summary

Same filter parameters as `/jobs` (paging and sort are ignored). Drives the map columns.

```json
{
  "cities": [
    {
      "city": "Bengaluru", "state": "Karnataka", "lat": 12.9716, "lng": 77.5946, "count": 88,
      "topRoles": [ { "role": "Software Engineering", "count": 51 }, { "role": "Data / AI / ML", "count": 14 } ]
    }
  ],
  "remote":    { "count": 23, "topRoles": [ { "role": "Software Engineering", "count": 12 } ] },
  "unlocated": { "count": 4 }
}
```
`cities` is sorted by `count` descending and holds up to 5 `topRoles` each. A multi-city post is counted in each of its cities. `remote` counts posts whose work mode is remote. `unlocated` counts posts with no city that are not remote. With a `city` filter, only the selected cities appear.

## GET /filters/options

Counts are over active fresher posts. Use it to populate the filter panel.

```json
{
  "roles":   [ { "role": "Software Engineering", "count": 120 } ],
  "cities":  [ { "city": "Bengaluru", "state": "Karnataka", "count": 88 } ],
  "jobTypes":  [ { "value": "internship", "count": 140 }, { "value": "full_time", "count": 61 },
                 { "value": "apprenticeship", "count": 0 }, { "value": "contract", "count": 0 } ],
  "workModes": [ { "value": "onsite", "count": 150 }, { "value": "hybrid", "count": 20 }, { "value": "remote", "count": 31 } ],
  "sources": [ { "source": "greenhouse", "count": 96 } ],
  "postedRanges": [ { "label": "Last 24 hours", "days": 1, "count": 12 }, { "label": "Last 7 days", "days": 7, "count": 80 },
                    { "label": "Last 30 days", "days": 30, "count": 190 } ]
}
```
`roles`, `cities` and `sources` only list entries that have posts, sorted by count. `jobTypes` and `workModes` always list every value. Send `postedRanges[].days` as `postedWithinDays`.

## POST /search/parse

Natural-language query to filters (see PRD section 10). Delegates to `parseSearchQuery` in `@beep/ai`.

```json
// request
{ "query": "python internships in pune with stipend" }
// response
{
  "filters": { "keywords": ["python"], "jobType": "internship", "cities": ["Pune"], "stipendMin": 1 },
  "chips": [ { "field": "keyword", "label": "python", "value": "python" }, { "field": "cities", "label": "Pune", "value": ["Pune"] } ],
  "parsedBy": "rules",
  "focusCity": "Pune"
}
```
`parsedBy` is `rules`, `jev`, `llm` or `cache`. `filters` uses the `JobFilters` shape (`keywords`, `roleCategory`, `cities`, `jobType`, `workMode`, `stipendMin`, `postedWithinDays`, `source`, `isNew`). Map it to `/jobs` params: `roleCategory` to `role`, `cities` to repeated `city`, `keywords` to `q` (space-joined, together with any `q`). `query` is 1 to 300 characters.

---

## GET /stats

Data-health numbers for the stats page. Every section is present even on an empty database.

```json
{
  "lastRun": {
    "id": 7, "triggerType": "cron", "status": "partial", "stage": "done",
    "startedAt": "2026-11-18T00:30:00.000Z", "finishedAt": "2026-11-18T00:34:12.000Z", "durationMs": 252000,
    "stats": { "fetched": 640, "rejected": 12, "notFresher": 301, "duplicatesExact": 20, "duplicatesFuzzy": 15,
               "newJobs": 214, "updatedJobs": 0, "expiredJobs": 0, "taggedByRules": 150, "taggedByJev": 60, "taggedByLlm": 4,
               "needsReview": 9, "perSource": { "greenhouse": { "fetched": 400, "normalized": 395, "rejected": 5, "ms": 41000 } } },
    "error": null
  },
  "activeRun": null,
  "recentRuns": [ "... up to 10 run objects, newest first, same shape as lastRun ..." ],
  "totals": {
    "activeJobs": 214, "newToday": 214, "needsReview": 9,
    "byRole":   [ { "role": "Software Engineering", "count": 120 } ],
    "byCity":   [ { "city": "Bengaluru", "count": 88 } ],
    "bySource": [ { "source": "greenhouse", "count": 96 } ]
  },
  "sources": [
    {
      "name": "greenhouse", "description": "Public ATS boards", "homepage": null, "accessMethod": "public_ats_api",
      "termsUrl": "https://...", "termsStatus": "allowed", "termsNotes": "Checked 2026-11-17 ...", "robotsCheckedAt": null,
      "enabled": true, "lastRunAt": "2026-11-18T00:34:00.000Z", "lastStatus": "success", "activeJobs": 96,
      "lastRun": { "fetched": 400, "normalized": 395, "rejected": 5, "ms": 41000 }
    }
  ],
  "llmUsage": {
    "totals": { "calls": 64, "inputTokens": 90000, "outputTokens": 3200, "cachedTokens": 0, "costUsd": 0.0114 },
    "byModel": [ { "provider": "jev", "model": "jev-latest", "purpose": "tag_jev", "calls": 60, "failures": 0,
                   "inputTokens": 84000, "outputTokens": 0, "cachedTokens": 0, "costUsd": 0.0035, "avgLatencyMs": 410 } ]
  },
  "costPer1000": {
    "tagging": { "costUsd": 0.0114, "jevCostUsd": 0.0035, "llmCostUsd": 0.0079, "postsTagged": 214,
                 "per1000Posts": 0.0533, "escalationRate": 0.028, "runs": 1 },
    "search":  { "costUsd": 0.0004, "searches": 40, "per1000Searches": 0.01 }
  },
  "accuracy": { "labelledJobs": 50, "fields": { "role_category": { "correct": 46, "total": 50, "percent": 92 } }, "overall": { "correct": 190, "total": 200, "percent": 95 } }
}
```

- `lastRun` is the most recent run that is no longer queued or running; `activeRun` is the queued or running one (or `null`). Use `GET /pipeline/runs/:id` to poll its progress.
- `sources` joins the `sources` table (terms, notes, last status) with active-post counts and the last run's per-source counters (`lastRun`, or `null`). A source with no row in the table appears with `termsStatus: "unchecked"`.
- `costPer1000.tagging` = cost of `tag_jev` + `tag_llm` calls, divided by posts those runs added (`stats.newJobs`, falling back to distinct posts that reached a model), times 1000. `escalationRate` is the share of those posts that reached the LLM. It is `null` when nothing has been tagged yet. `costPer1000.search` is `null` until a search has been parsed; cached parses count as searches that cost nothing.
- `accuracy.fields` keys are `role_category`, `cities`, `job_type`, `is_fresher`. `percent` is `null` when `total` is 0.

## GET /pipeline/runs

`?limit=20` (1 to 100). Newest first.

```json
{ "items": [ { "id": 8, "triggerType": "manual", "status": "running", "stage": "enrich",
               "startedAt": "2026-11-18T06:00:00.000Z", "finishedAt": null, "durationMs": 31000,
               "stats": { "fetched": 640, "newJobs": 120 }, "error": null } ] }
```

## GET /pipeline/runs/:id

One run object (shape above). While running, `stage` is the current stage and `stats` holds partial counters; `durationMs` keeps growing until `finishedAt` is set. Statuses: `queued`, `running`, `success`, `partial`, `failed`. 404 if the id does not exist.

## POST /pipeline/run

Auth required when `ADMIN_TOKEN` is set. No body. The worker picks the queued row up within about 5 seconds.

```json
// 202 Accepted
{ "runId": 9 }
// 409 Conflict, a run is queued or running
{ "error": { "code": "RUN_ACTIVE", "message": "A pipeline run is already queued or running (run 8)" }, "runId": 8 }
```

---

## Settings (admin)

Keys are never returned in full, only masked.

### GET /settings/ai

```json
{
  "jev": { "provider": "jev", "configured": true, "source": "db", "maskedKey": "ts-...a3f9", "model": "jev-latest" },
  "llm": { "provider": "llm", "configured": false, "source": "none", "maskedKey": null, "model": null,
           "endpoint": null, "deployment": null, "apiVersion": "2025-04-01-preview" },
  "mode": "jev_only",
  "modeLabel": "Jev only: rules + Jev"
}
```
`source` is `db` (saved in the UI), `env` (from `.env`) or `none`. `mode` is `full`, `jev_only`, `llm_only` or `rules_only`; show `modeLabel`, and a "AI tagging off" banner when `mode === "rules_only"`.

### PUT /settings/ai/:provider

`:provider` is `jev` or `llm`. Body (all fields optional, unknown fields rejected):

```json
{ "apiKey": "…", "model": "jev-latest", "endpoint": "https://….services.ai.azure.com", "deployment": "gpt-5-mini", "apiVersion": "2025-04-01-preview" }
```
Returns the same body as `GET /settings/ai` (fresh status, masked).

### DELETE /settings/ai/:provider

Removes the saved key. Returns the same body as `GET /settings/ai`.

### POST /settings/ai/:provider/test

Optional body with the same fields as PUT, used as overrides (so a key can be tested before saving). Nothing is saved. Always 200; the provider's own result is in the body:

```json
{ "ok": true, "latencyMs": 412, "model": "jev-latest" }
{ "ok": false, "latencyMs": 230, "error": "401 Unauthorized: invalid API key" }
```

---

## Accuracy tooling (admin)

For the 50-post hand check. Fields are `role_category`, `cities`, `job_type`, `is_fresher`.

### GET /accuracy/sample?size=50

Random sample of active fresher posts, stratified by `primary_source` (proportional, at least one per source). `size` 1 to 200.

```json
{
  "size": 50,
  "fields": ["role_category", "cities", "job_type", "is_fresher"],
  "items": [
    {
      "id": 412, "title": "Python Developer Intern", "company": "Acme Labs", "locationRaw": "Pune, Maharashtra",
      "descriptionExcerpt": "Join our platform team ...", "applyUrl": "https://...", "primarySource": "greenhouse",
      "predicted": { "role_category": "Software Engineering", "cities": ["Pune"], "job_type": "internship", "is_fresher": true },
      "workMode": "onsite",
      "labels": { "role_category": { "correct": true, "correctValue": null } }
    }
  ]
}
```
`labels` holds any labels already saved for the post, so a session can resume.

### PUT /accuracy/labels

Bulk upsert, keyed by `(jobId, field)`; 1 to 1000 labels. If `correct` is true, `correctValue` is cleared.

```json
{ "labels": [
  { "jobId": 412, "field": "role_category", "predicted": "Software Engineering", "correct": true },
  { "jobId": 412, "field": "cities", "predicted": "Pune", "correct": false, "correctValue": "Mumbai" }
] }
```
Response `{ "upserted": 2 }`. 400 `UNKNOWN_JOB` if a job id does not exist (nothing is written).

### GET /accuracy/summary

```json
{
  "labelledJobs": 50,
  "fields": {
    "role_category": { "correct": 46, "total": 50, "percent": 92 },
    "cities":        { "correct": 49, "total": 50, "percent": 98 },
    "job_type":      { "correct": 50, "total": 50, "percent": 100 },
    "is_fresher":    { "correct": 48, "total": 50, "percent": 96 }
  },
  "overall": { "correct": 193, "total": 200, "percent": 96.5 }
}
```
