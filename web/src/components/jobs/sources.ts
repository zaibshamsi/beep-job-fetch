/** Display names for source keys (the `source` field of a job's source links). */
export const SOURCE_NAMES: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  unstop: 'Unstop',
  freshersvoice: 'FreshersVoice',
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  weworkremotely: 'We Work Remotely',
  jobicy: 'Jobicy',
  adzuna: 'Adzuna',
  jooble: 'Jooble',
};

/** Homepages for sources whose terms ask for a credit link. */
export const SOURCE_HOMEPAGES: Record<string, string> = {
  adzuna: 'https://www.adzuna.in',
  remoteok: 'https://remoteok.com',
  weworkremotely: 'https://weworkremotely.com',
  jobicy: 'https://jobicy.com',
  remotive: 'https://remotive.com',
};

/**
 * Human name of a source. `jsonld-careers` posts come from the employer's own site, so the name is
 * "<company> careers site" when the company is known.
 */
export function sourceName(source: string, company?: string | null): string {
  if (source === 'jsonld-careers') {
    const c = company?.trim();
    return c ? `${c} careers site` : 'company careers site';
  }
  const known = SOURCE_NAMES[source];
  if (known) return known;
  // Unknown key: "some-board" -> "Some board"
  const words = source.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : source;
}

/** Adzuna's terms require the "Jobs by Adzuna" credit next to their posts. */
export const needsAdzunaCredit = (source: string) => source === 'adzuna';
