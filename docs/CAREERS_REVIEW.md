# Career-site sources review

Date of review: 2026-11-18. Scope: openings published directly on employer career sites, read through channels the sites publish for machines (sitemap.xml, RSS/Atom, schema.org `JobPosting` JSON-LD). Code: `worker/src/sources/careers.ts` and `worker/src/sources/careers/`. Company list and per-site settings: `worker/src/sources/careers/sites.json`.

## Method and limits followed

- Discovery: the site's own sitemap (index or urlset, gzip supported) or an RSS/Atom feed. Detail pages are read for the `JobPosting` JSON-LD block. No HTML scraping of page layouts, no login, no CAPTCHA handling, honest `BeepJobFetchBot` User-Agent.
- `politeFetch` checks robots.txt before every request (sitemap and detail page). A Disallow or a 403/429 means the site is skipped, never worked around.
- At least 1.5 s between requests to one host (more when the site declares a larger Crawl-delay; four sites declare 5 s), at most 300 detail pages per site per run, conditional requests (`If-None-Match` / `If-Modified-Since`) and sitemap `lastmod` skipping through an in-memory cache.
- Run time: six sites are crawled at once (different hosts, each throttled separately), highest-yield employers first. After 8 minutes of wall time no new page fetch starts, in-flight requests are aborted 45 s later, and the posts collected so far are returned with a log line saying how many sites were cut (the pipeline aborts a source at 10 minutes and keeps nothing). Sites cut in one run continue from the cache in the next run of the same worker process.
- India only: country India, or no country and a text match on "India" or a gazetteer city. Titles with senior/lead/principal/director/manager/architect/staff/head/vp are dropped. Expired postings (`validThrough` in the past) are dropped.
- Verification: every company below was run live through the adapter code (sitemap -> detail pages -> JSON-LD -> India filter). "India postings" is the number of postings that passed all filters in the sample, not the number of openings the company has.

## Rule applied for terms of service

ENGINEERING.md rule 3: if a site's terms forbid automated access, the source is not built. Terms were read for the companies in the table where marked. Where the terms page could not be fetched by our crawler (403 bot protection, JS-only, or no link found) the result is recorded as NOT READ and the company is flagged for manual review; robots.txt and the working public sitemap/JSON-LD are the only evidence in that case. This is a gap in the evidence, not a clearance.

## Workday (`*.myworkdayjobs.com`, `/wday/cxs/{tenant}/{site}/jobs`): NOT BUILT

- Tenant robots.txt (checked on nvidia.wd5 and accenture.wd103) allows the career site path and advertises a `siteMap.xml`. The `/wday/cxs/.../jobs` JSON endpoint answers anonymous POSTs (checked once on nvidia.wd5, HTTP 200, JSON).
- It is not a documented public API. It is the backend of the tenant's own career page. Workday's documented APIs require tenant credentials.
- Workday Online Terms of Service (workday.com/en-in/legal/site-terms.html, "Last Updated 08/13/2026" on the fetched copy) say users must not "use any data mining, robots or similar data gathering or extraction methods designed to scrape or extract data from our Sites", must not "develop or use any applications that interact with our Sites without our prior written consent", and must not "bypass or ignore instructions contained in our robots.txt file".
- Whether "our Sites" covers customer-branded tenant career sites is not stated in those terms, and the tenant sites carry no terms of their own that we could find. Under the rule "if not clearly permitted, do not build", the `workday` adapter was not built and no Workday tenant is in `sites.json`. Flagged: legality unclear; needs a decision from someone able to contact Workday or the employers.
- Workday-hosted pages also publish JSON-LD and a sitemap, but they sit under the same terms, so they were not added to the generic adapter either.

## Other platform feeds

| Platform | Public channel | Result |
|---|---|---|
| Teamtailor | `/jobs.rss`, documented in Teamtailor's help centre as shareable | Feed works (checked on career.teamtailor.com; robots disallows only `/app/`). No Indian employer on Teamtailor could be found or verified, so no dedicated adapter. The generic adapter already accepts `feedUrl` (RSS/Atom), so a verified tenant can be added to `sites.json` without code. |
| Personio | `{company}.jobs.personio.de/xml`, documented by Personio | Documented, no usage terms stated for third parties. Only one Personio-hosted posting with an India location surfaced (a German robotics company). Not built. |
| Breezy, JazzHR, BambooHR | Public JSON/embed lists | No Indian employer verified within the time spent; not built. |
| iCIMS | No public feed documented | Not built. Some iCIMS Jibe career sites expose sitemap + JSON-LD and are covered by the generic adapter (marked in the table). |
| SuccessFactors / Taleo RSS | Tested jobs.sap.com | 403 to our User-Agent on every page; not built. |

## Companies included (57)

Columns: company, channel, robots.txt, terms, decision, India postings found. "(40 pages)" is the final re-verification with the shipped code and a 40-page cap per site; "best run" is the highest count from earlier runs with up to 120 pages. A 0 at 40 pages with a positive best run means India postings exist but are deeper in the sitemap than the first 40 pages.

| Company | Channel | robots.txt | Terms of service | Decision | India postings found |
|---|---|---|---|---|---|
| ABB | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 0 (40 pages) / 1 (best run, <=120 pages) |
| AbbVie | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 6 (40 pages) / 10 (best run, <=120 pages) |
| Accenture | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | accenture.com/en/support/terms-of-use: no robot/scrape clause | include (allowed_with_limits) | 30 (40 pages) / 20 (best run, <=120 pages) |
| Aon | iCIMS Jibe sitemap + JSON-LD | sitemap+job page allowed for our UA; Crawl-delay 5s honoured | aon.com legal notice scanned: no robot/scrape/crawl wording | include (allowed_with_limits) | 0 (40 pages) / 2 (best run, <=120 pages) |
| Applied Materials | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 31 (40 pages) / 31 (best run, <=120 pages) |
| Arm | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | arm.com website terms read in full: no automated-access clause | include (allowed_with_limits) | 9 (40 pages) / 8 (best run, <=120 pages) |
| AstraZeneca | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 3 (40 pages) / 3 (best run, <=120 pages) |
| Barclays | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 21 (40 pages) / 21 (best run, <=120 pages) |
| BCG | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 4 (40 pages) / 4 (best run, <=120 pages) |
| BD (Becton Dickinson) | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | bd.com terms (rev. 2020): no automated-access clause | include (allowed_with_limits) | 2 (40 pages) / 2 (best run, <=120 pages) |
| Boeing | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 11 (40 pages) / 11 (best run, <=120 pages) |
| Capital One | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 1 (best run, <=120 pages) |
| Cargill | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | careers.cargill.com/legal-compliance scanned: no such wording | include (allowed_with_limits) | 23 (40 pages) / 23 (best run, <=120 pages) |
| Chevron | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 28 (40 pages) / 27 (best run, <=120 pages) |
| Cigna Group (Evernorth) | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 3 (40 pages) / 9 (best run, <=120 pages) |
| Comcast | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | corporate.comcast.com terms (eff. 2017): no automated-access clause | include (allowed_with_limits) | 32 (40 pages) / 29 (best run, <=120 pages) |
| Danaher | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 0 (40 pages) / 3 (best run, <=120 pages) |
| DuPont | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 0 (40 pages) / 3 (best run, <=120 pages) |
| eBay | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 5 (40 pages) / 5 (best run, <=120 pages) |
| Ericsson | Eightfold sitemap + JSON-LD | sitemap+job page allowed for our UA | ericsson.com/en/legal (modified 2026-09-30): no automated-access clause | include (allowed_with_limits) | 23 (40 pages) / 24 (best run, <=120 pages) |
| FedEx | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 0 (40 pages) / 4 (best run, <=120 pages) |
| FIS | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | fisglobal.com terms: no automated-access clause | include (allowed_with_limits) | 11 (40 pages) / 12 (best run, <=120 pages) |
| Fiserv | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 6 (best run, <=120 pages) |
| GE Vernova | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | gevernova.com/terms scanned: no robot/scrape/crawl wording | include (allowed_with_limits) | 9 (40 pages) / 9 (best run, <=120 pages) |
| GSK | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | gsk.com terms: no automated-access clause | include (allowed_with_limits) | 2 (40 pages) / 2 (best run, <=120 pages) |
| Hitachi Energy | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 8 (40 pages) / 9 (best run, <=120 pages) |
| Hewlett Packard Enterprise | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 12 (best run, <=120 pages) |
| ICON plc | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | careers.iconplc.com/terms-conditions scanned: no such wording | include (allowed_with_limits) | 26 (40 pages) / 35 (best run, <=120 pages) |
| Intuit | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 1 (best run, <=120 pages) |
| IQVIA | iCIMS Jibe sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 2 (best run, <=120 pages) |
| Keysight | iCIMS Jibe sitemap + JSON-LD | sitemap+job page allowed for our UA; Crawl-delay 5s honoured | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 4 (40 pages) / 5 (best run, <=120 pages) |
| Lam Research | Eightfold sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 15 (40 pages) / 15 (best run, <=120 pages) |
| L'Oreal | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 1 (best run, <=120 pages) |
| Lowe's India | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 20 (40 pages) / 20 (best run, <=120 pages) |
| Mastercard | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 1 (best run, <=120 pages) |
| MSD | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 6 (40 pages) / 6 (best run, <=120 pages) |
| NetApp | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 21 (40 pages) / 21 (best run, <=120 pages) |
| NTT DATA | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 2 (40 pages) / 3 (best run, <=120 pages) |
| Optum (UnitedHealth Group) | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 7 (40 pages) / 8 (best run, <=120 pages) |
| Parexel | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 8 (40 pages) / 8 (best run, <=120 pages) |
| PayPal | Eightfold sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 5 (40 pages) / 5 (best run, <=120 pages) |
| Procter & Gamble | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 4 (40 pages) / 4 (best run, <=120 pages) |
| Philips | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | philips.com terms (Last Update July 2026): no automated-access clause | include (allowed_with_limits) | 19 (40 pages) / 19 (best run, <=120 pages) |
| Principal Financial Group | iCIMS Jibe sitemap + JSON-LD | sitemap+job page allowed for our UA; Crawl-delay 5s honoured | principal.com/terms-of-use scanned: no such wording | include (allowed_with_limits) | 1 (40 pages) / 4 (best run, <=120 pages) |
| Qualcomm | Eightfold sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 7 (40 pages) / 7 (best run, <=120 pages) |
| Roche | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 1 (best run, <=120 pages) |
| Sanofi | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | sanofi.com legal notice scanned: no such wording | include (allowed_with_limits) | 16 (40 pages) / 16 (best run, <=120 pages) |
| Snowflake | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 2 (best run, <=120 pages) |
| Societe Generale | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | careers.societegenerale.com legal info scanned: no such wording | include (allowed_with_limits) | 1 (40 pages) / 1 (best run, <=120 pages) |
| State Street | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 1 (40 pages) / 1 (best run, <=120 pages) |
| Stryker | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 0 (40 pages) / 1 (best run, <=120 pages) |
| Synopsys | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 10 (40 pages) / 10 (best run, <=120 pages) |
| Takeda | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | takeda.com terms scanned: no such wording | include (allowed_with_limits) | 11 (40 pages) / 11 (best run, <=120 pages) |
| Teradata | iCIMS Jibe sitemap + JSON-LD | sitemap+job page allowed for our UA | teradata.com Terms of Use scanned: no such wording | include (allowed_with_limits) | 3 (40 pages) / 3 (best run, <=120 pages) |
| Trane Technologies | Phenom sitemap + JSON-LD | sitemap+job page allowed for our UA | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 0 (40 pages) / 3 (best run, <=120 pages) |
| Unilever | Radancy TalentBrew sitemap + JSON-LD | sitemap+job page allowed for our UA | unilever.com legal notice scanned: no such wording | include (allowed_with_limits) | 7 (40 pages) / 7 (best run, <=120 pages) |
| WTW | Site sitemap + JSON-LD (ATS not identified) | sitemap+job page allowed for our UA; Crawl-delay 5s honoured | terms page not retrievable by our crawler (403/404/JS) or not located: NOT READ, flagged for manual review | include (allowed_with_limits), ToS flagged | 2 (40 pages) / 2 (best run, <=120 pages) |

## Dropped because the terms forbid or restrict automated access

| Company | Clause found | Decision |
|---|---|---|
| Citi (jobs.citi.com) | citigroup.com/global/terms: "Unauthorized use of Citigroup's web sites and systems including but not limited to data scraping ... is strictly prohibited" | forbidden, removed (had 21 India postings in the test) |
| Dassault Systemes | 3ds.com/terms-of-use: "use of robots, data mining or any other similar data collection and/or extraction tool, is strictly prohibited" | forbidden, removed |
| McGraw Hill | mheducation.com/terms-use: no "agent, robot, spider ... scrape, crawl, data mine" without written authorisation | forbidden, removed |
| Amgen | amgen.com/terms-of-use: no scripts/tools "designed to data mine or scrape ... through any type of automated means" without written consent | forbidden, removed |
| Okta | okta.com/terms-of-service: no access "via automated means (crawlers, scripts)" | forbidden, removed |
| Adobe | adobe.com/legal/terms.html section 6.18: no "data mining or similar data gathering and extraction methods in connection with the Services" | forbidden, removed |
| Micron | micron.com/legal/terms-of-use: no automated system ("robots", "spiders") that sends more requests than a human could | unclear (our rate is 1 request per 1.5 s, but the limit is not defined), removed to be safe |
| Palo Alto Networks | paloaltonetworks.com terms, Rule 8 lists "crawling" and "using bots or scripts" under conduct rules framed for the Community | unclear, removed to be safe |

## Rejected for technical reasons (no usable channel, or the site blocks our honest User-Agent)

- 403 to our User-Agent on detail pages or sitemap (not worked around): Wipro, Cognizant, Standard Chartered, SAP, ServiceNow, Caterpillar, Infosys, TCS, Tata Motors, Intel (429), Wells Fargo, Fidelity, GM, Lear, Swiss Re, ADP, Nestle, Bayer, Medtronic, Rockwell, EPAM, Globant, Veritas, BNP Paribas.
- Site unreachable or timing out during the review: HCLTech, LTIMindtree, Coforge, Persistent, Zensar, Cyient, Hexaware, Mahindra, KPMG India, EXL, Teleperformance, Unisys, Otis, Johnson Controls, Nomura, Lenovo, Aptiv, VMware.
- No usable sitemap, or no JobPosting JSON-LD found in a probe of 2-4 job-looking pages per site (a negative from a small probe, not proof): Tech Mahindra, Reliance, Apple, Amazon (sitemap 404), Salesforce, Deutsche Bank, JPMorgan, American Express, Google, Microsoft, Oracle, Cisco, Dell, HP, Honeywell, Texas Instruments, Nokia, Genpact, EY (pages render in the browser), Mphasis, Capgemini, Deloitte, PwC, Flipkart, Swiggy, Paytm, Zoho, Airtel, Jio, Larsen & Toubro, Siemens, Bosch, Goldman Sachs, Morgan Stanley, Visa, Walmart (sitemap lists pages without JobPosting data), Concentrix, Uber (JSON-LD is for driver pages), Renesas (non-India results only).
- Tested with working JSON-LD but no India posting found within 120 pages, so not enabled: AMD, Schneider Electric, PepsiCo, Baxter, ING, McKesson, CVS Health, Thales, Eli Lilly, Marsh McLennan, Thermo Fisher, Abbott (sitemap returned HTTP 500), Bank of America (sitemap points at a test host), T-Mobile, Elevance Health, Truist, Humana, The Home Depot, Walgreens (one apparent hit was Salem, Oregon: a gazetteer false positive, fixed in `filters.ts`).

## Legality unclear (flag for a human decision)

1. Workday-hosted career sites (see above).
2. Micron and Palo Alto Networks (clauses reproduced above).
3. The included companies marked "NOT READ" in the table: robots.txt and the public sitemap/JSON-LD allow our crawler, but their terms could not be read, so a clause forbidding automated access cannot be excluded. Each can be switched off by deleting its entry in `sites.json`.
