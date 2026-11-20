# BeepJobFetch

Fresher jobs and internships in India, collected every day from public sources, de-duplicated, tagged by role and city with AI, and shown on a 3D map of India.

- **Product spec:** [docs/PRD.md](docs/PRD.md)
- **How it is built and how AI was used:** [docs/WORKING_DOC.md](docs/WORKING_DOC.md)
- **Which sources are used and why others are not:** [docs/SOURCE_REVIEW.md](docs/SOURCE_REVIEW.md), [docs/CAREERS_REVIEW.md](docs/CAREERS_REVIEW.md)
- **API reference:** [docs/API.md](docs/API.md)
- **Engineering contract:** [docs/ENGINEERING.md](docs/ENGINEERING.md)

## How it works

```
sources (public APIs, feeds, sitemaps)
   -> fetch -> store raw -> normalize -> fresher filter -> dedupe -> enrich -> publish -> expire old
                                                                      |
                                              rules (free) -> Jev (fast, typed) -> LLM (only when unsure)
```

- **Sources** follow each site's terms and robots.txt. Sites that forbid automated access are not used; the reasoning for every site is in the source review docs.
- **Enrichment** runs rules first (cities, stipend, experience, skills), then Jev for role, job type, work mode and fresher decisions with a confidence score, then an LLM only for what is still missing or uncertain.
- **Worker** runs the pipeline daily at 06:00 India time and picks up manual runs from a queue.
- **API** serves jobs, city summaries, search, stats and settings.

## Setup

Requirements: Node 22+, and a SQL Server you can reach (Developer or Express edition is fine).

```bash
git clone https://github.com/zaibshamsi/beep-job-fetch.git
cd beep-job-fetch
npm install
cp .env.example .env     # set DB_* for your SQL Server
npm run db:setup         # creates the tables and seeds the city list
```

Then, in separate terminals:

```bash
npm run worker           # pipeline + daily schedule (add "-- --once" to run once and exit)
npm run api              # REST API on http://localhost:4000
npm run web              # the app on http://localhost:5173 (talks to the API through /api)
```

The first run takes about 10 minutes because sources are fetched politely, one request at a time per site. The app shows jobs as soon as the first run saves them. Add `-- --once` to `npm run worker` to run a single pass and exit.

The database user needs permission to create tables in the target database. `npm run db:migrate` is safe to re-run.

### AI keys (optional)

The app works without any key: tagging then uses rules only, and posts the rules cannot decide are hidden and flagged for review. To enable AI tagging, either fill these in `.env` or add them on the Settings page of the app:

| Setting | Purpose |
|---|---|
| `JEV_API_KEY` | Jev (TypeSafe AI) for fast typed decisions. A TypeSafe key or an OpenRouter key (`sk-or-...`) both work; the route is picked from the key |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | LLM on Azure AI Foundry |

Keys saved in the app are encrypted in the database. Keys in `.env` are used when nothing is saved.

### More sources (optional)

Without keys these sources are skipped and the run log says so: `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` (developer.adzuna.com), `JOOBLE_API_KEY` (jooble.org/api/about). Public job boards, open remote-job feeds and a few India fresher sites need no key.

### Re-tagging after you add AI keys

```bash
npm run retag            # re-tags jobs the rules could not settle, using the keys now available
npm run retag -- --all   # re-tags every active job
```

The daily run also re-tags stale jobs by itself.

## Tests

```bash
npm run typecheck
npm test                 # unit tests, plus integration tests against the configured database
```

Do not run the integration tests while a pipeline run is active: they refuse to start a second run.

## Repo layout

```
packages/shared   env, database, types, polite HTTP, city list
packages/ai       rules, Jev and LLM providers, settings, enrichment graph, search parsing
worker            pipeline and source adapters
api               Express REST API
db/migrations     SQL schema
docs              spec, engineering notes, working doc, source reviews
```
