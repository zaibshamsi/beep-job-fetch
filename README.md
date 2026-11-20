# BeepJobFetch

Fresher jobs and internships in India, collected every morning from public sources, de-duplicated, tagged by role and city with AI, and shown on a map you can search in plain words.

- **What you get:** a daily pipeline, a REST API, and a web app with a landing page, an interactive map of India (2D beacons or a 3D column view), search, and a data-health page.
- **Current data:** about 800 fresher jobs from 10 sources across 48 cities plus remote roles (last full run).
- **Cost is measured:** the app records every AI call with its tokens and cost, so cost per 1,000 posts is a number you can read on the Insights page (about 0.71 USD with the shipped chain).

Documents: [Working document](docs/WORKING_DOC.md) (how it was built, AI tools, prompts, results) · [Product spec](docs/PRD.md) · [API reference](docs/API.md) · [Engineering notes](docs/ENGINEERING.md) · [Source reviews](docs/SOURCE_REVIEW.md), [career sites](docs/CAREERS_REVIEW.md)

## How it works

```
 public sources ──► WORKER (Node, daily 06:00 IST, or on demand)
                    fetch → store raw → normalize → fresher filter → de-duplicate → enrich → publish → expire
                                                                                       │
                                            rules (free) ─► Jev (fast, typed) ─► LLM (only when unsure)
                                                    LangGraph: validate → repair → confidence gate
                                  │
                                  ▼
                          SQL Server  ◄──  Express API  ◄──  React app (map, search, insights, settings)
```

1. **Sources.** Public job-board APIs (Greenhouse, Lever, Ashby, Workable: 621 company boards), Unstop, FreshersVoice, remote-job feeds, and company career pages that publish standard `JobPosting` data. Sites whose terms or robots.txt forbid automated access (LinkedIn, Naukri, Indeed, Internshala, Glassdoor and others) are not used; each decision is documented with the clause it rests on.
2. **Pipeline.** Every source is a small adapter that maps to one standard job format. The worker removes non-fresher posts, merges duplicates (exact URL, then fuzzy company + title + city), and expires jobs that disappear from their source.
3. **Tagging.** Rules settle what is certain (cities, stipend, experience, skills). **Jev** (TypeSafe AI) picks role, job type, work mode and a fresher probability, each with a confidence score. An **LLM** (Azure AI Foundry) reads only what is still missing or uncertain. A LangGraph graph validates every answer against closed lists and retries once with the error if it is invalid. With no AI keys the app still works on rules alone.
4. **App.** Search accepts sentences such as "internships in Bengaluru with stipend": they become filters you can see and remove. Filters, the selected city and the open job all live in the URL, so every view is shareable.

## Setup

### Requirements

- Node.js 22 or newer
- A SQL Server you can reach (Developer or Express edition is fine) and a **SQL login** (user and password). Windows authentication is not supported.

### 1. Install

```bash
git clone https://github.com/zaibshamsi/beep-job-fetch.git
cd beep-job-fetch
npm install
```

### 2. Create the database

Create an empty database and a login that owns it (change the name and password):

```sql
CREATE DATABASE beepjobfetch;
CREATE LOGIN beepjob_app WITH PASSWORD = 'choose-a-strong-password';
USE beepjobfetch;
CREATE USER beepjob_app FOR LOGIN beepjob_app;
ALTER ROLE db_owner ADD MEMBER beepjob_app;
```

### 3. Configure

```bash
cp .env.example .env        # on Windows: copy .env.example .env
```

Set at least the `DB_*` values in `.env`. Everything else is optional (see Configuration below). Then create the tables and the city list:

```bash
npm run db:setup            # safe to re-run
```

### 4. Run

Open three terminals in the repo folder:

```bash
npm run worker              # pipeline: runs once if the database is empty, then daily at 06:00 IST
npm run api                 # REST API on http://localhost:4000
npm run web                 # the app on http://localhost:5173
```

Open http://localhost:5173. The first pipeline run takes about 10 minutes, because every site is fetched politely, one request at a time. Jobs appear in the app as soon as they are saved. To refresh later, press **Run pipeline** on the Insights page, or run `npm run worker -- --once`.

## Configuration

| Variable | Needed for | Notes |
|---|---|---|
| `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | everything | SQL Server login from step 2 |
| `JEV_API_KEY`, `JEV_MODEL` | Jev tagging | Either a TypeSafe key (console.typesafe.ai/keys, model `jev-latest`) or an OpenRouter key (`sk-or-…`, model `typesafe/jev-1.14`). The route is chosen from the key. |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | LLM tagging | Your Azure AI Foundry deployment. `AZURE_OPENAI_API_VERSION` has a default. |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY` | extra sources | Optional. A source without its key is skipped and the run log says so. |
| `ADMIN_TOKEN` | deployments | When set, the settings and run endpoints require an `x-admin-token` header. Leave empty locally. |

**AI keys can also be entered in the app** (Settings page, with a Test connection button). Keys saved there are encrypted in the database and override `.env`.

After adding keys, re-tag the jobs the rules could not settle:

```bash
npm run retag               # needs-review jobs only
npm run retag -- --all      # every active job
```

The daily run also re-tags stale jobs by itself.

## Using the app

| Page | What it does |
|---|---|
| **Home** (`/`) | What the product is, how the pipeline works, which sources are read and which are refused, live numbers |
| **Map** (`/map`) | Beacons sized by job count. Click a city for its role breakdown and jobs; click a job to read it and apply at the source. Switch between 2D and 3D. |
| **Insights** | Last run funnel, per-source status and terms, AI usage and cost per 1,000 posts, a Run pipeline button |
| **Settings** | Add or test the Jev and LLM keys |

## Commands

| Command | Does |
|---|---|
| `npm run db:setup` | Create or update tables and load cities |
| `npm run worker` / `npm run worker -- --once` | Pipeline with schedule / one pass |
| `npm run api` | REST API |
| `npm run web` | Web app (development server) |
| `npm run build` | Production build of the web app (`web/dist`) |
| `npm run retag` | Re-tag existing jobs with the AI keys now available |
| `npm test` | All tests (about 590) |
| `npm run typecheck` | Type check the backend |

## Project layout

```
packages/shared   settings, database access, job format, polite HTTP client, city list
packages/ai       rules, Jev and LLM clients, key storage, tagging graph, search parsing
worker            pipeline and one adapter per source (worker/src/sources)
api               REST API (Express)
web               React app
db/migrations     SQL schema
docs              spec, API, engineering notes, working document, source reviews
```

## Troubleshooting

- **"Login failed" or the API reports the database is unreachable:** check `DB_*` in `.env`, that SQL Server accepts TCP connections on that port, and that SQL authentication is enabled.
- **The map is empty:** the worker has not saved jobs yet. Start `npm run worker` and wait for the first run, or press Run pipeline on Insights.
- **"Test connection" returns 401 for Jev:** the key does not match the route. A key starting with `sk-or-` must come from OpenRouter; any other key must come from TypeSafe. A key saved in Settings overrides `.env`: remove it there first.
- **Tests fail with "another run active":** the integration tests share the pipeline's one-run-at-a-time lock. Stop the worker and any running pipeline first.

## Known limits

- Cost figures depend on the AI keys you provide; with no keys, tagging is rules-only and uncertain posts are hidden and flagged for review.
- Posts are placed in a city, not at a street address; the map spreads jobs around the city centre.
- Source terms can change. The adapters follow each site's terms as reviewed on 2026-11-18; re-check before relying on a source long term.
