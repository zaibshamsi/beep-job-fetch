/** Sources reviewed on 2026-11-18 and deliberately not built, with the reason. Documentation only. */
export const skippedSources: { name: string; status: 'forbidden' | 'unclear' | 'no_india_data'; reason: string }[] = [
  { name: 'arbeitnow', status: 'no_india_data', reason: 'Public API (arbeitnow.com/api/job-board-api) is Germany/EU focused; 0 of 300 posts mentioned India. No terms published.' },
  { name: 'himalayas', status: 'unclear', reason: 'himalayas.app/jobs/api, its robots.txt and docs reset every connection (ECONNRESET) from our network, so terms could not be verified.' },
  { name: 'the-muse', status: 'unclear', reason: 'themuse.com/api/public/jobs returns 404 and the developer docs return 403; no verifiable open API.' },
  { name: 'ncs.gov.in', status: 'unclear', reason: 'Angular single-page app with no robots.txt, no published API or terms; vacancy data comes from partner APIs only. data.gov.in lists only aggregate NCS statistics ("API does not exist").' },
  { name: 'apprenticeshipindia.gov.in', status: 'unclear', reason: 'robots.txt allows public pages, but listings are served by a JS app with no documented API, feed or reuse terms.' },
  { name: 'indiapost.gov.in', status: 'unclear', reason: 'Recruitment notices are one-off HTML/PDF pages for specific posts; no feed or open-data API.' },
];
