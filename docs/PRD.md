# BeepJobFetch — Product Requirements Document

| | |
|---|---|
| **Status** | Draft v0.3 — for review (v0.2: Jev + LLM design; v0.3: Azure Foundry LLM, local SQL Server, queued manual runs) |
| **Owner** | Zaib Shamsi |
| **Last updated** | 2026-11-17 |
| **Deadline** | Code complete Friday 2026-11-20 morning; submission Friday night |
| **Repo** | github.com/zaibshamsi/beep-job-fetch |

---

## 1. Summary

BeepJobFetch collects real fresher job and internship posts in India from public sources and cleans them into one standard format. It removes duplicates, tags each post by role and city with two AI models (Jev for fast typed decisions, LLM as the LLM for extraction and hard cases), and shows the posts on a 3D map of India with search. The data refreshes every day by itself.

The product starts from a take-home brief and goes further in four places:

1. A real data pipeline: source adapters, a standard schema, dedupe, enrichment, and a job lifecycle.
2. A 3D map of India as the main interface.
3. Natural-language search ("python internships in pune with stipend").
4. Built-in measurement: tagging accuracy, cost per 1,000 posts, and pipeline health, all visible in the app.

## 2. The brief (verbatim requirements)

| # | Requirement | Where this PRD covers it |
|---|---|---|
| R1 | Collect 200+ real fresher job or internship posts in India from public sources, respecting each site's terms | §6 Sources, §7 Pipeline |
| R2 | Remove duplicates | §7.4 Dedupe |
| R3 | Use an LLM to tag each post by role and city | §8 Enrichment |
| R4 | Show posts on a searchable page | §9 Frontend, §10 NL search |
| R5 | Page refreshes every day on its own | §7.7 Scheduling |
| R6 | Loom video (max 5 min, face + screen): architecture, what broke and how it was fixed | §14 Deliverables |
| R7 | Share the repo | §12 Setup |
| R8 | Hand-check 50 posts; report tagging accuracy | §13 Measurement |
| R9 | Report cost per 1,000 posts | §13 Measurement |
| R10 | Working doc or sheet with the data, AI tools and prompts used | `docs/WORKING_DOC.md`, exported to Google Sheet |

## 3. Users

| User | Goal |
|---|---|
| **Fresher / student** (end user) | Find relevant entry-level roles near them quickly and apply on the source site. |
| **Reviewer** (grader) | Clone the repo, run it with one command, add their own AI key, watch the pipeline work, and check the numbers. |

## 4. Definitions

- **Fresher post:** a post aimed at a college graduate or student. This means an internship, a graduate or trainee program, a mass-hiring or off-campus drive, or a role requiring 0–1 years of experience.
- **Post:** one job opening after dedupe. One post can have several source links.
- **Run:** one full execution of the pipeline (fetch → publish).

## 5. Goals and non-goals

### Goals
- G1. At least 200 active, deduplicated fresher posts in India after the first run.
- G2. Every active post has a role category and at least one city (or `Remote`).
- G3. Tagging accuracy of at least 90% on role and at least 95% on city, measured on 50 hand-checked posts.
- G4. Cost per 1,000 posts measured from real token usage, not estimated.
- G5. Setup is short and scripted (`npm install`, fill `.env`, `npm run db:setup`, `npm run dev`) and works with no AI key.
- G6. A reviewer can add an AI key in the UI, test it, and trigger a run.

### Non-goals (v1)
- User accounts, login, saved profiles.
- Applying in-app. Apply always links out to the source site.
- Resume matching or recommendations.
- Email or Telegram alerts.
- Scraping sites whose terms forbid it (LinkedIn, Naukri, Indeed, Glassdoor).
- Public hosting. The repo is the deliverable; hosting is optional (see §16).

## 6. Data sources

Rule: use official APIs and public machine-readable feeds first. Use HTML parsing only where robots.txt and the terms of service allow it. The ToS status of each source is recorded in `docs/WORKING_DOC.md`.

| Source | Type | Access | Notes | Status |
|---|---|---|---|---|
| Adzuna | Job search API | Free API key | Has an India (`in`) endpoint; supports keyword and location search | Primary |
| Greenhouse | Public ATS board JSON | No key | `boards-api.greenhouse.io/v1/boards/{company}/jobs`; per-company list | Primary |
| Lever | Public ATS board JSON | No key | `api.lever.co/v0/postings/{company}?mode=json` | Primary |
| Ashby | Public ATS board JSON | No key | `api.ashbyhq.com/posting-api/job-board/{company}` | Primary |
| Jooble | Job search API | Free API key (by request) | Has India results | Secondary |
| Careerjet | Partner API | Affiliate ID | Has India results | Secondary |
| Internshala, Unstop | HTML | Check ToS and robots.txt | High fresher density | Only if terms allow |
| NCS portal (ncs.gov.in), apprenticeship portals | HTML / feeds | Check ToS | Government and PSU roles | Only if terms allow |

The ATS boards need a seed list of companies that hire freshers in India. It lives in `pipeline/config/companies.json` and is easy to extend.

Keys for Adzuna and Jooble are optional. A source with no key is skipped and the run log notes it. The ATS sources need no key, so a reviewer still gets live data.

## 7. Pipeline

The pipeline worker is a separate Node.js service. It runs these stages in order and logs counts for each one.

```
fetch → store raw → normalize → fresher filter → dedupe → enrich (LangGraph) → publish → lifecycle
```

### 7.1 Fetch
- Each source is an adapter module with the same interface:
  ```ts
  interface SourceAdapter {
    name: string;
    fetch(ctx: RunContext): Promise<RawPost[]>;
    normalize(raw: RawPost): JobPost | null;
  }
  ```
- Adding a source means adding one file in `pipeline/sources/`.
- Every adapter uses a polite fetch helper: rate limit per host, retry with backoff on 429 and 5xx, a timeout, and an honest User-Agent.
- One failing source never stops the run. Its error is recorded and the other sources continue.

### 7.2 Store raw
- Every raw payload is saved to `raw_posts` as JSON with its source, fetch time, run ID and content hash.
- This lets us re-normalize or re-tag without fetching again, and it gives evidence when debugging.

### 7.3 Normalize
Map every raw post to the standard `JobPost` schema, validated with zod:

| Field | Type | Notes |
|---|---|---|
| `source` | string | Adapter name |
| `sourceJobId` | string | ID from the source |
| `title` | string | Trimmed, whitespace collapsed |
| `company` | string | Normalized: suffixes like "Pvt Ltd" removed for matching, original kept for display |
| `locationRaw` | string | As given by the source |
| `description` | string | HTML stripped to text; capped for LLM input |
| `applyUrl` | string | Canonical URL with tracking parameters removed |
| `postedAt` | datetime \| null | |
| `employmentTypeRaw` | string \| null | |
| `compensationRaw` | string \| null | Salary or stipend text as given |

A post that fails validation is counted as `rejected` with a reason. It is not dropped silently.

### 7.4 Fresher filter
1. **Rules first.** Keyword patterns mark a post as fresher: intern, internship, trainee, graduate, fresher, entry level, 0–1 years, off campus, mass hiring, walk-in drive, batch 2025/2026.
2. Patterns such as "3+ years" or "senior" mark a post as not fresher.
3. Posts the rules can't decide go to the LLM, which returns an `isFresher` flag (§8).

### 7.5 Dedupe
1. **Exact:** a SHA-256 hash of the canonical apply URL, enforced by a `UNIQUE` index on `jobs.url_hash`.
2. **Same post across sources:** build a key from normalized company + title + city. If an existing active post has the same company and city, and title trigram similarity is ≥ 0.85, it is a duplicate.
3. **Merge, don't drop:** the duplicate's link is added to `job_sources`, so one post can show "also listed on Adzuna".
4. The run log records how many posts each rule merged.

### 7.6 Publish and lifecycle
- New posts are inserted; known posts get `last_seen_at` updated.
- A post not seen in 3 runs in a row becomes `expired`. Expired posts are hidden from the map and search but kept for stats.
- `search_text` is rebuilt for changed posts (title, company, role, cities, skills).

### 7.7 Scheduling
- `node-cron` inside the worker runs the pipeline daily at 06:00 IST.
- The worker also runs once on startup if the database has no posts, so a first-time reviewer sees data within minutes.
- `POST /pipeline/run` starts a manual run. Only one run can be active at a time; a second request returns `409` with the active run's ID.

## 8. Enrichment (LangGraph)

Enrichment runs per post as a LangGraph.js graph. It uses two AI models with different jobs, in a "fast first, escalate when unsure" design:

- **Jev** (TypeSafe AI, a "System One" model) makes fast, cheap, typed decisions with calibrated confidence: role, job type, work mode, is-fresher, and the primary city when the rules are unsure. It cannot extract free values.
- **The LLM** (a model deployed on Azure AI Foundry, configured in Settings) reads free text. It extracts free values (stipend amount, skills, all cities of a multi-city post), and it re-tags any post where Jev's confidence is low.

The flow has real branches and a retry loop, which is why it is a graph and not a straight line.

```
            ┌──────────────┐
  post ───► │  ruleTagger  │  cities, stipend, skills from gazetteer + regex
            └──────┬───────┘
                   ▼
            ┌──────────────┐
            │ jevClassifier│  role, jobType, workMode, isFresher (+ city if unsure)
            └──────┬───────┘
                   ▼
            ┌──────────────┐  confident AND nothing left to extract
            │confidenceGate│─────────────────────────────────────────────┐
            └──────┬───────┘                                           │
                   │ low confidence OR free values missing             │
                   ▼                                                   │
            ┌──────────────┐     ┌────────────┐  invalid (max 2)       │
            │  gptTagger   │───► │  validate  │──────► repair ──┐      │
            └──────────────┘     └─────┬──────┘                 │      │
                   ▲                   │ valid                  │      │
                   └───────────────────┼────────────────────────┘      │
                                       ▼                               ▼
                                 ┌──────────┐                    ┌──────────┐
                                 │  merge   │──────────────────► │   save   │
                                 └──────────┘                    └──────────┘
                     still low confidence after LLM → save with needs_review = 1
```

### 8.1 Nodes
| Node | Does |
|---|---|
| `ruleTagger` | Matches the city gazetteer (aliases like Bangalore/Bengaluru/BLR, Gurgaon/Gurugram, Delhi NCR), stipend patterns (₹, "per month", "k/month") and a skills list. Fills every field it is sure of. |
| `jevClassifier` | One Jev request per post with several typed questions, evaluated in parallel: `Choice` for role (18 options), job type and work mode; `Noul` for is-fresher; `Choice` over gazetteer cities only when the rules found zero or conflicting cities. Each answer comes with a confidence score. |
| `confidenceGate` | Goes to `save` when every Jev answer has confidence ≥ 0.7 and the rules filled the free-value fields. Otherwise goes to `gptTagger`. |
| `gptTagger` | Sends the post, the rule results and Jev's answers (with confidences) to LLM using structured output. Asks only for the fields that are missing or low-confidence. |
| `validate` | Checks LLM's output against the zod schema and the closed lists (role categories, known cities). |
| `repair` | Sends the validation error back to LLM with one retry instruction. At most 2 attempts, then the post keeps the Jev and rule tags with `needs_review = 1`. |
| `merge` | Combines rule, Jev and LLM results. For each field it records which model decided it. |
| `save` | Writes the tags, `tagged_by` per field (`rules`, `jev`, `gpt`), model versions and prompt versions. |

### 8.1a What runs with which keys
| Keys set | Behavior |
|---|---|
| Jev + LLM | Full graph as above |
| Jev only | Rules + Jev. Free values come from rules only; low-confidence posts get `needs_review = 1` |
| LLM only | Rules + LLM for every field the rules could not fill |
| None | Rules only; undecided posts get `needs_review = 1`. Seed data is already fully tagged |

### 8.2 Output schema
```ts
{
  roleCategory: RoleCategory,        // closed list, see 8.3
  cities: string[],                  // canonical names from the gazetteer, or ["Remote"]
  workMode: "onsite" | "hybrid" | "remote",
  jobType: "internship" | "full_time" | "apprenticeship" | "contract",
  isFresher: boolean,
  experienceMinYears: number | null,
  experienceMaxYears: number | null,
  stipendMinMonthlyInr: number | null,
  stipendMaxMonthlyInr: number | null,
  skills: string[],                  // max 8
  confidence: number                 // 0..1
}
```

### 8.3 Role categories (closed list)
Software Engineering · Data / AI / ML · QA / Testing · DevOps / Cloud · Cybersecurity · UI / UX Design · Product Management · Business / Data Analyst · Sales / Business Development · Marketing · Content / Writing · Finance / Accounting · HR / Recruiting · Operations / Supply Chain · Customer Support · Core Engineering (Mechanical / Civil / Electrical) · Consulting · Other

### 8.4 AI providers and settings
- **Jev:** called through the official Node SDK `@typesafe-ai/sdk` (`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`). Jev is not a LangChain model, so `jevClassifier` is a plain graph node that calls the SDK.
- **LLM:** an Azure AI Foundry deployment (OpenAI-compatible), called through the official `openai` package (`AzureOpenAI`) with structured JSON output validated by zod. LangGraph orchestrates the graph; the single-shot model calls do not need LangChain. Settings: endpoint, API key, deployment name, API version. "Test connection" confirms the deployment responds.
- Both keys are set in the UI (§9.5). The UI value wins over `.env`.
- Every AI call writes a row to `llm_calls` with provider, model, input/output/cached tokens, cost, latency, prompt version and success.
- Jev question definitions and LLM prompts live in `packages/ai/src/providers/` as versioned files (`jev-questions.v1.ts`, `llm-prompts.v1.ts`). Every version is copied to the working doc.

### 8.5 Cost controls
- Rule-first: fields the rules fill are never sent to a model.
- Jev-first: Jev's cost is small (input only; output is free), so it handles every post. LLM runs only on escalated posts.
- Content-hash cache: a post with the same content is never tagged twice.
- Description capped (about 1,500 characters) before sending.
- The LLM prompt keeps its long, stable instructions first, so provider-side prompt caching can reuse them.
- A provider batch API (about 50% off, async) is a stretch goal. The daily run does not need low latency.

## 9. Frontend

React with Vite. Four screens.

### 9.1 Map (home)
- deck.gl renders India from a committed GeoJSON file that follows the official Survey of India boundary. No tile provider or map API key is needed.
- The camera starts as a tilted bird's-eye view of India.
- **City columns:** each city is a 3D column (deck.gl `ColumnLayer`). Height and color show the number of active posts.
- **Click a city:** the camera flies in (`flyTo` with pitch and bearing). The column splits into one pin per post, spread out so they don't overlap.
- **Click a pin:** the view animates into the job card (§9.3).
- **Remote posts** sit on a separate "Remote" island off the coast.
- **Multi-city posts** get a pin in each city.
- Hover on a column shows the city name, count and top roles.

### 9.2 Search and list panel
- Search bar at the top. Plain words do a keyword search; pressing Enter runs natural-language parsing (§10).
- Filters: role, city, job type, work mode, stipend minimum, posted within (1, 7, 30 days), source.
- The list panel shows matching posts sorted by newest. Search and filters drive both the list and the map.
- "New today" badge on posts first seen in the last 24 hours.
- The list is the fallback on mobile and on devices without WebGL.

### 9.3 Job card
- Title, company, cities, role, job type, work mode, stipend or salary, skills, posted date, source(s).
- A short description excerpt.
- **Apply** button that opens the source URL in a new tab.
- **Source attribution (required by source terms):** every card shows "via <source>" linking to the source. Adzuna posts must also show the Adzuna label/logo linked to adzuna.in; RemoteOK, We Work Remotely and Jobicy posts must credit and link the source. The footer lists all active sources.
- Shareable URL (`/jobs/:id`) that opens the map at the job.

### 9.4 Stats page ("Data health")
- Last run: time, trigger, duration, status.
- Counts per stage and per source: fetched, rejected, not fresher, duplicates merged, tagged by rules, tagged by LLM, needs review, published, expired.
- Total active posts; posts by role and by city.
- LLM usage: calls, tokens, cost per 1,000 posts, cost per 1,000 searches, model used.
- Tagging accuracy from the 50-post hand check (entered from the Sheet results).
- A live progress bar while a run is active.

### 9.5 Settings page (AI configuration)
Two provider cards, each with its own key field, status and test button:

| Card | Fields |
|---|---|
| **Jev (TypeSafe AI)** | API key; model (default `jev-latest`) |
| **LLM (Azure AI Foundry)** | Endpoint, API key, deployment name, API version |

- **Test connection:** `POST /settings/ai/:provider/test` makes one tiny real call. Shows success with latency and the model version returned, or the exact provider error. Saves nothing.
- **Save:** `PUT /settings/ai/:provider`. The key is stored server-side in `app_settings`, encrypted with AES-256-GCM. The encryption secret is generated on first start and kept in a gitignored `.secrets/` folder, so reviewers never set it.
- **Remove key** per provider.
- The API returns keys only in masked form (`sk-...a3f9`). The full key never goes back to the browser.
- A summary line shows the active mode from §8.1a (for example "Jev + LLM: full tagging").
- **Run pipeline now** button.
- A banner on every page says "AI tagging off — add a key in Settings" when no key is set.

## 10. Natural-language search

1. The user types a query and presses Enter.
2. `POST /search/parse` parses it in layers:
   - The rule parser extracts what it can: cities (gazetteer), stipend words and numbers, "remote"/"wfh", job-type words, and leftover keywords.
   - **LLM** (if its key is set) returns the full filter object below. It handles odd phrasing best.
   - **Jev** (if only Jev's key is set) fills role category and job type with `Choice` questions; rules fill the rest.

   The final filters are validated by zod:
   ```json
   { "keywords": ["python"], "jobType": "internship", "cities": ["Pune"],
     "workMode": null, "stipendMin": 1, "roleCategory": null, "postedWithinDays": null }
   ```
3. The filters go to the same `GET /jobs` endpoint as the filter panel. There is one query path.
4. The UI shows the parsed filters as removable chips, so a wrong parse is visible and fixable in one click.
5. If a city is found, the map flies to that city.
6. With no key, a rule parser does the same job with the gazetteer and keyword lists ("paid"/"stipend", "remote"/"wfh", "intern").
7. Parsed queries are cached by a hash of the normalized query.
8. Each parse is logged in `llm_calls` with `purpose = 'search_parse'`.

Stretch: 20 test queries with expected filters, scored like the tagging check.

## 11. System design

### 11.1 Services
| Service | Tech | Role |
|---|---|---|
| Database | MS SQL Server (local instance or any SQL Server the reviewer points `.env` at) | Storage |
| `api` | Node.js + Express | REST API, settings, search parsing |
| `worker` | Node.js + LangGraph.js + node-cron | Pipeline, scheduling, picks up queued manual runs |
| `web` | React + Vite + deck.gl | Frontend |

The `api` and `worker` are separate processes. The API never calls the worker directly: a manual run is a `pipeline_runs` row with `status = 'queued'`, which the worker polls for every 5 seconds. Both share code from `packages/shared` (schemas, DB access, gazetteer) and `packages/ai` (rules, providers, enrichment graph, search parsing).

### 11.2 Repo layout
```
/api              Express app
/worker           pipeline runner and source adapters (worker/src/sources)
/web              React app
/packages/shared  env, db, zod types, adapter contract, polite HTTP, gazetteer
/packages/ai      rules, Jev + LLM providers, settings, enrichment graph, NL search
/db/migrations    SQL migrations
/docs             PRD, ENGINEERING, WORKING_DOC, source reviews
.env.example
```

### 11.3 Database (MS SQL Server)
| Table | Purpose |
|---|---|
| `pipeline_runs` | One row per run: trigger, status, timings, per-stage counts (JSON), error |
| `raw_posts` | Raw payload per fetch: source, source_job_id, payload (JSON), content_hash, run_id |
| `jobs` | One row per deduplicated post: standard fields, tags, status, first/last seen, missed_runs, `url_hash` (UNIQUE), `search_text`, `needs_review`, `tagged_by`, `prompt_version` |
| `job_sources` | All source links for a post (merged duplicates) |
| `cities` | Gazetteer: name, state, lat, lng, aliases (JSON) |
| `job_cities` | Post ↔ city (many to many) |
| `llm_calls` | Every LLM call: purpose, provider, model, tokens, cost, latency, prompt version, success |
| `app_settings` | Encrypted AI settings |
| `search_cache` | Parsed NL queries by hash |

Search uses `LIKE` on a normalized `search_text` column. This is fast enough at a few thousand rows and avoids SQL Server full-text search, which is not installed by default.

### 11.4 API
| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs` | List with filters: `q, role, city, jobType, workMode, stipendMin, postedWithinDays, source, page` |
| GET | `/jobs/:id` | One post with all source links |
| GET | `/cities/summary` | Per-city counts and top roles for map columns (same filters as `/jobs`) |
| POST | `/search/parse` | Natural-language query → filters |
| GET | `/stats` | Data health numbers |
| GET | `/pipeline/runs` | Recent runs |
| POST | `/pipeline/run` | Start a manual run |
| GET | `/settings/ai` | Both providers: model, masked key, status; active mode |
| PUT | `/settings/ai/:provider` | Save key and model for `jev` or `llm` |
| DELETE | `/settings/ai/:provider` | Remove a key |
| POST | `/settings/ai/:provider/test` | Test a key without saving |
| GET | `/health` | Liveness and database check |

`/settings` and `/pipeline/run` have no auth because the app runs locally. If the app is ever deployed, these routes must require an `ADMIN_TOKEN` header.

## 12. Setup (reviewer experience)

```bash
git clone https://github.com/zaibshamsi/beep-job-fetch.git
cd beep-job-fetch
npm install
cp .env.example .env      # set DB_* for your SQL Server; AI keys optional
npm run db:setup          # creates tables and seeds the city list
npm run worker            # pipeline + daily cron (separate terminal)
npm run api               # REST API (separate terminal)
npm run dev -w web        # frontend, http://localhost:5173
```

- Requires Node 22+ and a SQL Server the reviewer can reach (a free Developer or Express edition is fine). A `docker-compose.yml` with a SQL Server container is provided as an optional shortcut.
- AI keys are optional: with none, tagging runs in rules-only mode. Keys can be added later in the Settings page.
- Source API keys (Adzuna, Jooble, Careerjet) are optional; sources without a key are skipped and the run log says so.
- On first start the worker runs a live pipeline if the database is empty.

## 13. Measurement

### 13.1 Tagging accuracy (R8)
1. A script draws a random sample of 50 active posts, stratified by source, and exports them to the Sheet's `Accuracy-50` tab.
2. Each row shows the post's title, location text, description excerpt and the predicted role, cities, job type and fresher flag.
3. Each field is hand-marked correct or wrong, with the right value when wrong.
4. Sheet formulas compute accuracy per field and overall, and a role confusion table.
5. The 50 labels become a golden set. Each prompt version is re-scored on it, and the scores go in the working doc (for example "tag.v1: 84% role → tag.v2: 94% role").

### 13.2 Cost per 1,000 posts (R9)
- Cost per 1,000 posts = (sum of `cost_usd` for `purpose = 'tag'` in a run) ÷ (posts processed in that run) × 1,000.
- `cost_usd` is computed per call from logged tokens and a per-model price table in `packages/shared/pricing.ts`. LLM prices are copied from the Azure pricing page for the deployed model on the day of measurement and the date is noted.
- Report, per run: Jev cost, LLM cost, escalation rate (share of posts sent to LLM), and total cost per 1,000 posts.

**Model comparison on the golden set.** The 50 hand-checked posts are tagged three ways, and accuracy and cost are compared in the Sheet's `Cost` tab:

| Setup | What it shows |
|---|---|
| Jev only | Accuracy and cost of the fast model alone |
| LLM only | Accuracy and cost of the LLM alone |
| Jev + LLM escalation (the shipped graph) | Whether escalation buys accuracy for its cost |

**Rough Jev estimate before measuring:** about 1,400 input tokens per post at $0.042 per million input tokens, with free output, is about $0.06 per 1,000 posts. LLM cost depends on the escalation rate and is measured, not estimated.

## 14. Deliverables

| Deliverable | Plan |
|---|---|
| Repo | Public GitHub repo with README, PRD, working doc, architecture diagram |
| Link to what was made | Repo link; optional deployed URL (§16) |
| Loom (≤ 5 min) | 0:00 demo of the map and NL search · 1:30 architecture diagram and LangGraph flow · 3:00 what broke and how it was fixed (from the working doc) · 4:00 accuracy and cost numbers |
| Working doc / sheet | Google Sheet with tabs: Data, Accuracy-50, Cost, AI Tools, Prompts, What Broke. Source of truth while building: `docs/WORKING_DOC.md` |

## 15. Plan

| Day | Date | Work |
|---|---|---|
| Tue | 2026-11-17 | PRD; repo skeleton; migrations; gazetteer; contracts |
| Wed | 2026-11-18 | Backend in parallel: pipeline core, rule tagger, AI layer, API, four source families |
| Thu | 2026-11-19 | React map, list, job card, stats and settings pages; NL search; 50-post hand check; cost numbers; Google Sheet |
| Fri | 2026-11-20 (morning) | README; clean-machine setup test; seed snapshot; Loom recording |

**Cut order if behind:** Ollama provider → Batch API → NL search test set → time filters → Remote island (fall back to a "Remote" list tab) → Jooble/Careerjet sources.

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Not enough fresher posts from allowed sources | Miss R1 (200+) | Several sources; wide Adzuna keyword set (intern, fresher, graduate, trainee); larger ATS company list. Check count on Day 1. |
| A source's terms forbid automated access | Ethics / grading | Check robots.txt and ToS before writing each adapter; record the result in the working doc; skip the source if unclear. |
| SQL Server container heavy on reviewer machines | Setup friction | Document the RAM need; health checks so `api` waits for `db`; clear error messages. |
| Jev is described by its maker as a different class of model from LLMs | Grader says R3 ("uses an LLM") is not met | LLM is an LLM in the same graph; it extracts values and re-tags low-confidence posts. The Loom explains why both are used. |
| Jev is in early access | Key or API limits block tagging | Confirm the key works on Day 1; the graph falls back to LLM-only mode (§8.1a). |
| Jev key shown in the Loom | Anyone with the video can use the key and spend credit | Use a separate key made only for reviewers, with a spending limit if the console allows it; revoke it after grading. |
| Azure deployment unavailable or misconfigured on a reviewer's setup | LLM calls fail | Endpoint and deployment are settings; "Test connection" shows the exact error; the graph degrades to Jev + rules. |
| LangChain structured output fails on some responses | Missing tags | zod validation and the repair loop; post saved with `needs_review = 1` if repair fails. |
| 3D map performance or WebGL missing | Broken main view | City columns instead of thousands of pins; list fallback. |
| Wrong India boundary on the map | Legal and reputational | Use an official-boundary GeoJSON; no third-party tiles. |
| "Link to what you made" may expect a live URL | Grading | A deployment needs a hosted SQL Server (you plan to provision one); decide on Thursday. |
| Deadline (2.5 days) | Incomplete features | Cut order in §15; core requirements R1–R10 first. |

## 17. Open questions

1. **Which Azure deployment is the default LLM?** Needed to price the LLM and report cost per 1,000 posts.
2. **Deployment.** Is a repo link enough, or should we also deploy a live URL?
3. **Working doc format.** Google Sheet (recommended, since data and accuracy tables fit a sheet) or Word doc?
4. **Sources.** Are Internshala and Unstop allowed after checking their terms?
