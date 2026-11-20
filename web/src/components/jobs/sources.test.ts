import { describe, expect, it } from 'vitest';
import { needsAdzunaCredit, sourceName } from './sources.ts';

describe('sourceName', () => {
  it('maps every known source key to its display name', () => {
    const expected: Record<string, string> = {
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
    for (const [key, name] of Object.entries(expected)) expect(sourceName(key)).toBe(name);
  });
  it("names the company's careers site for jsonld-careers", () => {
    expect(sourceName('jsonld-careers', 'Hevo Data')).toBe('Hevo Data careers site');
    expect(sourceName('jsonld-careers')).toBe('company careers site');
    expect(sourceName('jsonld-careers', '  ')).toBe('company careers site');
  });
  it('makes unknown keys readable', () => {
    expect(sourceName('new-board')).toBe('New board');
  });
  it('flags Adzuna for its attribution', () => {
    expect(needsAdzunaCredit('adzuna')).toBe(true);
    expect(needsAdzunaCredit('lever')).toBe(false);
  });
});
