# BeepJobFetch: Working Document

Evidence of how this project was built with AI: the tools, the prompts, the decisions, the data and the measured results. It is kept current during the build and exported to a Google Sheet at the end (each section below is one tab).

| | |
|---|---|
| **Project** | Fresher jobs and internships in India on a 3D map, with a daily-refreshing data pipeline |
| **Repo** | github.com/zaibshamsi/beep-job-fetch |
| **Product spec** | [PRD.md](PRD.md) |
| **Engineering contract** | [ENGINEERING.md](ENGINEERING.md) |
| **Source legal review** | [SOURCE_REVIEW.md](SOURCE_REVIEW.md), [CAREERS_REVIEW.md](CAREERS_REVIEW.md) |
| **Last updated** | 2026-11-18 |

---

## 1. How I work with AI

I treat AI as a team I direct, not a chat box. Four habits run through the whole project:

1. **Spec before code.** Requirements, scope cuts, risks and a day plan were written down and agreed ([PRD](PRD.md)) before any implementation started. Every later prompt points back at that spec.
2. **Contracts before parallelism.** Before delegating, I fixed the interfaces everything depends on: the database schema, the standard job format, the source-adapter interface, and the AI module's public API ([ENGINEERING.md](ENGINEERING.md)). With those stable, independent pieces can be built at the same time without stepping on each other.
3. **Parallel agents, disjoint ownership.** Work that does not depend on other work runs concurrently, each agent owning its own folder, writing its own tests, and reporting back with evidence.
4. **Verify, never trust.** Each deliverable must pass type checks and unit tests, and sources must pass a live smoke run with real counts. Claims I cannot verify (for example anything needing a paid API key) are marked as unverified until they are.

I also set one rule that overrides speed: **every data source must be legal and polite.** Agents read each site's terms and robots.txt before writing code, and a site that forbids automated access is documented and skipped.

## 2. AI tools

### Used to build the project

| Tool | Model | Role |
|---|---|---|
| Claude Code (VS Code extension) | Claude Sonnet 5.5, Claude Opus 5.5 | Orchestrator: planning, design, contracts, review |
| Claude Code subagents | same | Parallel builders: pipeline core, rule tagger, AI layer, API, and four source-research agents |
| Claude Design | n/a | The owner explored the UI visually and produced a complete working mock (landing page and map app); it is the final visual reference (`docs/design/claude-design-reference.html`) |
| tasteskill 2.5 (`Leonxlnx/taste-skill`, installed with `npx skills add`) | n/a | First design pass: dealt a palette and type pairing, and its copy linter, layout checker and finish gate verified the first About page. Superseded by the Claude Design direction; its copy and layout checks still guide the rewrite |
| Vercel Web Interface Guidelines | n/a | Interaction and accessibility rules (URL as state, focus, hit targets, reduced motion, tabular numbers) written into the app's design doc |
| DESIGN.md format (VoltAgent/awesome-design-md) | n/a | One plain-text design system every frontend agent reads before building |

### Used inside the product

| Tool | Model | Role |
|---|---|---|
| Jev (TypeSafe AI) | `jev-latest` | Fast typed decisions with calibrated confidence: role, job type, work mode, is-fresher |
| LLM on Azure AI Foundry | Azure-deployed model (configured in app) | Extracts free values (stipend, skills, extra cities), re-tags low-confidence posts, parses natural-language search |
| LangGraph.js | n/a | Enrichment graph: rules → Jev → confidence gate → LLM → validate → repair → merge |

Why two models: Jev is cheap and fast but only chooses among options I define. The LLM is slower and costlier but can read free text. Running Jev first and escalating only the uncertain posts to the LLM keeps cost low without losing accuracy. The comparison is measured in section 6.

## 3. Prompt library

Reusable prompt patterns that did the heavy lifting. Each states its purpose and the technique behind it.

### 3.1 Prompts used to build

| # | Pattern | What it achieved | Technique |
|---|---|---|---|
| B1 | **Brief to PRD** | Turned a three-line assignment into a spec with 10 traceable requirements, goals with numeric targets, risks and a day plan | Gave the original brief verbatim plus my own vision and constraints; asked for brainstorming first, a spec second, so scope was agreed before writing |
| B2 | **Constraint injection** | Changed the stack from Python to Node, Express, MS SQL and LangGraph; added MSSQL-specific design changes (no `pg_trgm`, `LIKE` search, Node-side fuzzy dedupe) | Stated the real constraint ("I must defend this in an interview") instead of a preference, so the redesign was principled |
| B3 | **Research-then-decide** | Evaluated Jev (a non-LLM "System One" model) against the brief's "uses an LLM" wording and found a design that satisfies both | Asked for the model's docs to be read and mapped field by field onto our schema, with risks listed, before committing |
| B4 | **Contract-first agent brief** | Eight agents worked in parallel on one codebase with no merge conflicts | Each brief names: files owned, files forbidden, the contract to code against, a verification checklist, and a fixed report format (see 3.3) |
| B5 | **Ethics-gated source research** | Four research agents evaluated dozens of job sites and built adapters only for those whose terms allow it | Required reading robots.txt and the terms page first; "forbidden" is a valid, documented outcome; every decision recorded with the clause quoted |

### 3.2 Prompts used in the product

| Prompt | Version | Purpose | Role acc. | City acc. | Notes |
|---|---|---|---|---|---|
| Jev question set | `jev.v1` | Choice (role, job type, work mode) and Noul (is-fresher) | n/a | n/a | To be scored on the 50-post set |
| LLM tagging | `llm.v1` | Fill only the fields rules and Jev could not decide | n/a | n/a | To be scored on the 50-post set |
| Natural-language search parse | `llm.v1` | Query → structured filters | n/a | n/a | To be scored on a query test set |

Full text of each version is kept in the repo under `packages/ai/src/providers/` and copied to the appendix when scored.

### 3.3 Agent brief template (used for every parallel agent)

```
Context   one sentence on the product, and which docs to read first
Ownership folders this agent may edit; folders it must not touch
Contract  the interface to implement or consume, with exact signatures
Build     numbered, concrete deliverables with behaviour spelled out
Rules     ethics, performance, fail-soft requirements
Verify    type check clean, tests green, one live smoke run
Report    fixed length: what was built, files, test results, open issues
```

## 4. Decisions

| Date | Decision | Alternatives considered | Why |
|---|---|---|---|
| 11-17 | Node, Express, React, MS SQL, LangGraph.js | Python pipeline; Postgres | I can explain and defend every line in an interview; SQL Server is the database I know |
| 11-17 | LangGraph only for enrichment | LangGraph for the whole pipeline | Fetch, normalize and dedupe are straight-line code; the enrichment step has real branches (rules first, escalate when unsure, repair loop), which is what a graph is for |
| 11-17 | Jev first, LLM on escalation | LLM for everything; Jev only | Jev costs about $0.04 per million input tokens; the LLM is kept for what Jev cannot do (free-text extraction) and to satisfy "uses an LLM" |
| 11-17 | API keys settable in the UI, stored encrypted on the server | Keys in the browser only; `.env` only | The daily cron runs without a browser and needs the key; reviewers still never edit config files |
| 11-17 | City columns on the 3D map, not one pin per job | One pin per job | Hundreds of pins in one city are unreadable; columns encode volume, and clicking splits a column into job pins |
| 11-18 | Manual runs go through a `queued` row in the database | API calls the worker directly | Keeps API and worker decoupled and restart-safe; one run at a time is enforced in one place |
| 11-18 | Every source passes a legal and politeness review | Scrape the biggest job boards | LinkedIn, Naukri, Indeed and Glassdoor forbid scraping; using them would fail the brief's "respect each site's terms" and would be indefensible on camera |
| 11-18 | Azure LLM called with the `openai` package; LangGraph kept for orchestration only | LangChain `AzureChatOpenAI` | The calls are single-shot structured requests, so LangChain added a layer without a benefit; the raw client exposes cached-token counts and exact provider errors, which the cost numbers and "Test connection" need |
| 11-18 | Rules first, then Jev, then the LLM only for gaps | One model for everything | A 179-case rule tagger handles cities, stipend, experience and skills for free; each model only sees what is left |
| 11-19 | Redesigned the whole UI from the owner's own Claude Design mock ("Saffron dusk": dark ground, saffron-rose-violet gradient, glass panels, Instrument Serif accents); the first tasteskill pass (light, teal) was replaced | Keep the first design | The mock was stronger on atmosphere and storytelling; I kept the engineering rules (real boundary file instead of the mock's hand-drawn India path, real data instead of demo numbers, 3D scene kept behind a 2D / 3D switch) and rewrote `web/DESIGN.md` so every agent builds to the new system |
| 11-18 | Palette, type and hero dealt by the design skill (cool-white-slate, Host Grotesk + JetBrains Mono) | Picking colours by taste; a dark "map app" look | Dealing removes personal bias and keeps the system consistent; a cool light ground keeps a dense map readable, and teal carries no alarm or sale meaning |
| 11-18 | One design document (`web/DESIGN.md`) written before any UI code, then four frontend agents in parallel | Let each agent style its own pages | Four builders, one look: tokens, components, copy voice and ownership are fixed up front |
| 11-18 | Map drawn with deck.gl from an India GeoJSON, no map tiles | Mapbox or MapLibre with third-party tiles | No API key for reviewers, and full control over showing India's official boundary |
| 11-18 | Pre-install all dependencies, then fan out agents | Let each agent install its own | Avoids concurrent installs corrupting `node_modules` |

## 5. Data

Latest full run (run 52, 2026-11-19, 10 minutes, status success):

| Item | Value |
|---|---|
| Sources that contributed posts | 10 (14 adapters registered; 4 skipped: 2 need API keys, 1 has unclear terms, 1 returned nothing) |
| Posts fetched | 4,348 |
| Rejected (not a valid job post or not in India) | 110 |
| Dropped by the fresher filter | 1,890 |
| Duplicates merged | 134 (49 exact, 85 near-identical) |
| New jobs added in this run | 390 |
| **Fresher jobs published** | **589** (target 200+) |
| Flagged for review | 213 (AI tagging not yet connected, so the rules cannot settle every post) |

Fresher jobs by source: Unstop 285, Workable 95, FreshersVoice 74, Lever 61, Greenhouse 43, company career pages 15, Ashby 10, Jobicy 4, We Work Remotely 2, Remotive 1.

The full post data is exported to the Sheet's `Data` tab from the database.

### 5.1 Source review summary

Every candidate source was checked against its terms and robots.txt. Detailed evidence, with clauses quoted, is in [SOURCE_REVIEW.md](SOURCE_REVIEW.md) and [CAREERS_REVIEW.md](CAREERS_REVIEW.md).

| Source family | Access method | Status |
|---|---|---|
| Public ATS boards: Greenhouse, Lever, Ashby, Workable (621 boards verified live) | Official public JSON APIs | built; SmartRecruiters (robots.txt blocks everyone but LinkedIn), Recruitee and Zoho (token required) refused |
| Aggregator APIs (Adzuna, Jooble, Careerjet) and open feeds (Remotive, RemoteOK, We Work Remotely, Jobicy) | Official APIs and feeds | open feeds live; Adzuna and Jooble built, waiting for keys; Careerjet skipped (terms unclear) |
| India fresher job sites (about 30 reviewed) | Public APIs where robots.txt allows | Unstop and FreshersVoice built; 13 refused on terms (Internshala, Naukri, LinkedIn, Indeed, Glassdoor and others) |
| Company career sites (57 verified) | schema.org JobPosting data via sitemaps | built; Workday refused (its terms ban robots) |

## 6. Accuracy and cost

Method: PRD section 13. Measured from the `llm_calls` table and the 50-post hand check.

### 6.1 Tagging accuracy (50-post hand check)

| Field | Correct / 50 | Accuracy |
|---|---|---|
| Role category | pending | pending |
| City | pending | pending |
| Job type | pending | pending |
| Is fresher | pending | pending |

### 6.2 Cost per 1,000 posts

| Run | Setup | Posts sent to Jev | Posts escalated to LLM | Total cost (USD) | Cost per 1,000 posts |
|---|---|---|---|---|---|
| pending | Jev + LLM | pending | pending | pending | pending |

Pre-build estimate for Jev alone: about $0.06 per 1,000 posts (about 1,400 input tokens per post at $0.042 per million; output is free). LLM cost depends on the escalation rate and is measured, not estimated.

### 6.3 Model comparison on the 50-post set

| Setup | Role acc. | City acc. | Cost per 1,000 posts |
|---|---|---|---|
| Jev only | pending | pending | pending |
| LLM only | pending | pending | pending |
| Jev + LLM escalation (shipped) | pending | pending | pending |

## 7. What broke

| # | Date | What broke | Root cause | Fix |
|---|---|---|---|---|
| 1 | 11-18 | Writing several files in one shell command failed silently; none of them were created | A quoting problem in one heredoc made the whole command abort before any file was written | Switched to writing files individually and verifying the directory listing before continuing |
| 2 | 11-18 | First dependency install left LangChain packages missing | One package in a multi-package install failed to resolve and the install rolled back as a whole | Installed the failing package alone, then the rest, then verified each package on disk |
| 3 | 11-18 | First full run published 1,802 "fresher" jobs, but samples included "Team Leader" and "Enterprise Account Executive" | With no key configured, posts with no fresher signal defaulted to fresher | Default is now "not fresher" unless there is evidence, favouring precision; flagged for review so Jev or the LLM can promote them |
| 4 | 11-18 | The first fix did not change already-saved jobs | The pipeline only tagged new posts, never existing ones, so neither a logic change nor newly added keys could improve old rows | Added re-tagging of existing jobs (needs-review rows once AI is configured, or when the prompt version changes) and a retag command |
| 5 | 11-18 | Career-page source never saved a post and the run ended "partial" | It crawled 57 sites one after another and exceeded the 10-minute per-source limit | Crawl sites concurrently (still one request at a time per host) with an internal 8-minute deadline that returns what was collected |
| 6 | 11-18 | Pipeline integration tests failed when a real run was active | Tests share the one-run-at-a-time lock with real runs | Documented in the README; tests must not run during a real run |
| 7 | 11-20 | The redesigned landing page and map scrolled with visible lag | Every frame repainted far more than it needed to: a 90 px blur filter over animated blobs, backdrop blur on cards that float over moving content, a full-screen film-grain layer, SVG drop-shadow filters, a hand-animated pulse using box-shadow, and one SVG that held both the static map and 20+ pulsing beacons | Moved softness into baked gradients, split the static map from the animated beacons so the map is rasterised once, limited pulsing to the 6 biggest cities, made overlays flat instead of blurred, animated only transform and opacity, skipped rendering of off-screen sections, and added inertial smooth scrolling for the landing page |

## 8. Appendix: prompt text

Added as each product prompt version is scored.
