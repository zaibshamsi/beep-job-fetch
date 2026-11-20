# DESIGN.md: BeepJobFetch ("Saffron dusk")

Plain-text design system for every agent and person building the web app. Format follows the DESIGN.md convention
(VoltAgent/awesome-design-md). Source of truth for the look: **`docs/design/claude-design-reference.html`**, a complete
working mock made by the owner with Claude Design (landing page + map app, demo data). Read it end to end before building.
Interaction quality follows the Vercel Web Interface Guidelines (https://vercel.com/design/guidelines). Where this file and a
guideline disagree: this file wins for look, the guideline wins for accessibility.

History: a first pass dealt by tasteskill (light, teal) was replaced by this direction on 2026-11-19 at the owner's request.

## 1. Visual theme & atmosphere

Night-time India: a near-black ground, a dotted map lit by saffron beacons, glass panels floating over it, one warm gradient
(saffron to rose to violet) used for emphasis only. Editorial contrast: heavy Manrope headlines with one Instrument Serif
italic gradient phrase per heading ("on one *living map*"). Quiet motion: beacons pulse, panels glide in, numbers count up.
Never busy, never neon-everywhere: the gradient appears on one word per heading, the primary button, active chips and bars.

## 2. Colour palette & roles (tokens in `src/styles/design.css`)

| Token | Value | Role |
|---|---|---|
| `--ink` | #09080D | Page ground |
| `--ink2` | #110F18 | Cards, map ground, node fills |
| `--panel` | rgb(20 17 28 / .72) | Side panel |
| `--line` / `--line2` | white 8% / 15% | Hairlines / stronger borders |
| `--tx` / `--tx2` / `--tx3` | #F4EFE6 / #A9A2B6 / #6E6880 | Text / secondary / tertiary (labels, captions) |
| `--saf` | #FFB23F | Saffron: eyebrows, beacons, focus ring, active step, icons |
| `--rose` | #FF4F7B | Gradient middle, "skipped" status, glows |
| `--vio` | #8B5CF6 | Gradient end, Tech family, remote |
| `--jade` | #3BE3B4 | Success, "New", live pulse, rules badge |
| `--grad` | saffron, rose, violet at 110deg | Primary buttons, active chips, gradient text, bars |

Role families on the map (arcs, city panel, avatars): Tech #8B5CF6, Data #5AA9FF, Sales #FFB23F, Marketing #FF4F7B,
Design #3BE3B4, Ops #F7A8D8, Other #A9A2B6. The grouping of the 18 API roles lives in `src/design/roleGroups.ts`; always
import from there. Status colours always come with a text label. Contrast: body text is `--tx` or `--tx2` only; `--tx3` is
for captions at 12px or larger and never for essential information.

## 3. Typography

- Headlines and UI: **Manrope** 700 (headlines, tracking -0.04em to -0.05em), 500/600 for UI.
- Accent: **Instrument Serif** italic (`.serif`) inside headings, with `.g` gradient text; one phrase per heading.
- Numbers, labels, eyebrows, timings, IDs: **JetBrains Mono** (`.mono`, tabular figures). Eyebrows are 11.5px, uppercase, 0.16em.
- Base 15px / 1.6. Headline scale: `clamp()` values as in the reference (hero up to 116px, h2 34 to 60px). Inputs are 16px on phones.
- Sentence case. Curly quotes, `…`, a non-breaking space between a number and its unit.

## 4. Components (shared classes in `design.css`; port page-specific CSS next to the component)

Glass `.glass`, card `.card` (24px radius, faint top-down gradient), `.btn` with `.btn--primary` (gradient) and `.btn--secondary`
(outlined), `.btn--sm`, `.pill`, `.chip` and `.chip.on` (gradient), `.tag.ok|no|warn`, `.eb`, `.new`, `kbd`, `.field`, `.spot`
(cursor-following spotlight: set `--mx/--my` from pointermove), `.rv` reveal on scroll (add `.in` with an IntersectionObserver).
Buttons: label = verb + object. Hover lifts primary 2px, active scales .98. Every control keeps a 44px hit area on touch.
Icons: `lucide-react` (stroke 1.75, size 16 to 24), icon-only buttons always have an `aria-label`.

## 5. Layout

- Floating glass nav pill (fixed, top 16px, max 1120px) on every page; content starts below `--bar-h` (72px).
- Landing: hero (grid + aurora), floating stage with perspective, marquee of cities, numbered sections 01 to 04, CTA, footer wordmark.
- Map app: 400px glass side panel + map card, 16px gaps, full viewport height under the nav, no page scroll. Under 960px:
  the map on top (about 62vh), the panel below it.
- Content pages (Insights, Review, Settings): `.wrap` (max 1160px), 24px gutters (16px on phones), cards on the dark ground.
- All state in the URL (`?q`, `?city`, `?role`, `?job`, `?focus` ...) so views are shareable and Back works.

## 6. Depth & motion

Depth is light, not shadow: hairline borders, glass blur, coloured glows (`box-shadow: 0 14px 40px -12px var(--rose)`).
Motion uses `var(--ease)`; only `transform`, `opacity` and `filter` animate. Honour `prefers-reduced-motion` (no pulses, no
drift, no count-up, camera jumps). No auto-playing loop longer than 5 seconds without a pause control (the marquee and the
pipeline comet are decorative; pause them under reduced motion).

## 7. Do's and don'ts

Do: real data from the API everywhere; empty, loading and error states for every list and chart; visible labels on inputs;
`aria-label` on icon buttons; tabular numbers; URL as state; one gradient phrase per heading; Esc closes overlays and focus
returns to the trigger.
Don't: invent numbers, companies or testimonials; use `transition: all`; use `<div onClick>` for navigation; add colours,
fonts or radii outside sections 2 to 3; draw India's outline by hand (use the project's boundary file, section 8).

## 8. Map

The reference draws India as a hand-made SVG path with beacons. In the real app the outline MUST come from the project's
boundary file, `public/geo/india-states.json` (Government of India boundary, DataMeet, CC BY 4.0; attribution line stays visible
on the map: `src/map/attribution.ts`), projected into the same 650x620 viewBox. Beacons sit at each city's real lat/lng.
Beacon radius = `4 + sqrt(count) * 1.6`. Click a beacon: the camera tweens in (900ms ease-out quartic), category arcs appear
around it (one arc per role family, dash-offset draw-in), the city panel opens, the list filters to that city. "Remote" is a
button, not a beacon. A **2D / 3D** switch keeps the deck.gl column scene (`src/map/JobMap.tsx`) available, recoloured to this palette.

## 9. Agent prompt guide

Before building: read this file, the reference HTML, `src/api/types.ts`, `docs/API.md`, `src/state/filters.ts`,
`src/design/roleGroups.ts`. Reuse the shared classes; do not restyle them. Check at 1440, 1024, 768 and 390 wide. Copy voice:
direct, specific, second person; product terms stay fixed: **job**, **source**, **city**, **fresher**. Run
`npx tsc -p web/tsconfig.json --noEmit` before reporting.

## Ownership

| Area | Owner | Files |
|---|---|---|
| Tokens, shared classes, shell and nav, routes, API client, URL state, this file | lead | `src/styles/**`, `src/components/shell/**`, `src/App.tsx`, `src/main.tsx`, `src/api/**`, `src/state/**`, `src/design/**`, `index.html`, `DESIGN.md` |
| Landing page (home) | landing agent | `src/pages/LandingPage.tsx`, `src/components/landing/**` |
| Map app: 2D beacon map, side panel, list, search, filters, city panel, job drawer, 2D/3D switch, recolour of the 3D scene | map agent | `src/pages/MapPage.tsx`, `src/components/{search,filters,jobs,map2}/**`, `src/map/**` |
| Insights, Settings, Review | ops agent | `src/pages/{Insights,Settings,Review,NotFound}Page.tsx`, `src/components/ops/**` |

Shared files are changed only by the lead; ask in your report if you need a change.
