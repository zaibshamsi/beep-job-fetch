import { describe, expect, it } from 'vitest';
import type { UrlFilters } from '../../state/filters.ts';
import { buildActiveChips, buildChips, countPanelFilters, postedLabel, stipendLabel, TOGGLE_CHIPS } from './chips.ts';

const all: UrlFilters = {
  q: 'python',
  role: 'Data / AI / ML',
  cities: ['Pune', 'Mumbai'],
  jobType: 'internship',
  workMode: 'remote',
  stipendMin: 10000,
  postedWithinDays: 7,
  source: 'weworkremotely',
  isNew: true,
};

describe('buildChips', () => {
  it('returns nothing for empty filters', () => {
    expect(buildChips({ cities: [] })).toEqual([]);
  });

  it('makes one chip per active filter, one per city, with readable labels', () => {
    const labels = buildChips(all).map((c) => c.label);
    expect(labels).toEqual([
      '“python”',
      'Data / AI / ML',
      'Pune',
      'Mumbai',
      'Internship',
      'Remote',
      '₹10,000+/month',
      'Last 7 days',
      'We Work Remotely',
      'New today',
    ]);
  });

  it('removes exactly its own filter', () => {
    const chips = buildChips(all);
    const pune = chips.find((c) => c.key === 'city:Pune')!;
    expect(pune.remove(all)).toEqual({ ...all, cities: ['Mumbai'] });
    const type = chips.find((c) => c.key === 'jobType')!;
    expect(type.remove(all).jobType).toBeUndefined();
    expect(type.remove(all).cities).toEqual(['Pune', 'Mumbai']);
  });

  it('labels the paid-only stipend and short posted ranges', () => {
    expect(buildChips({ cities: [], stipendMin: 1 })[0].label).toBe('Paid only');
    expect(stipendLabel(5000)).toBe('₹5,000+/month');
    expect(postedLabel(1)).toBe('Last 24 hours');
    expect(postedLabel(30)).toBe('Last 30 days');
  });

  it('ignores zero stipend and zero days', () => {
    expect(buildChips({ cities: [], stipendMin: 0, postedWithinDays: 0 })).toEqual([]);
  });
});

describe('countPanelFilters', () => {
  it('counts panel filters, not the search words or cities', () => {
    expect(countPanelFilters(all)).toBe(7);
    expect(countPanelFilters({ cities: ['Pune'], q: 'x' })).toBe(0);
  });
});

describe('toggle chips', () => {
  const by = (key: string) => TOGGLE_CHIPS.find((t) => t.key === key)!;

  it('read the filters they control', () => {
    const f: UrlFilters = { cities: [], jobType: 'internship', stipendMin: 1, workMode: 'remote', isNew: true };
    expect(TOGGLE_CHIPS.filter((t) => t.isOn(f)).map((t) => t.key)).toEqual(['internship', 'stipend', 'remote', 'new']);
    expect(by('full_time').isOn(f)).toBe(false);
  });

  it('switch their filter on and off without touching the others', () => {
    const f: UrlFilters = { cities: ['Pune'], q: 'python' };
    expect(by('internship').set(f, true)).toEqual({ ...f, jobType: 'internship' });
    expect(by('internship').set({ ...f, jobType: 'internship' }, false).jobType).toBeUndefined();
    expect(by('full_time').set({ ...f, jobType: 'internship' }, true).jobType).toBe('full_time');
    expect(by('stipend').set(f, true).stipendMin).toBe(1);
    expect(by('stipend').set({ ...f, stipendMin: 10000 }, true).stipendMin).toBe(10000);
    expect(by('stipend').set({ ...f, stipendMin: 10000 }, false).stipendMin).toBeUndefined();
    expect(by('new').set(f, false).isNew).toBeUndefined();
  });
});

describe('buildActiveChips', () => {
  it('leaves out what the toggles show', () => {
    expect(buildActiveChips({ cities: [], jobType: 'internship', workMode: 'remote', stipendMin: 1, isNew: true })).toEqual([]);
  });

  it('keeps search words, cities, role and values the toggles cannot show', () => {
    const labels = buildActiveChips({ ...all, jobType: 'contract', workMode: 'hybrid' }).map((c) => c.label);
    expect(labels).toEqual(['“python”', 'Data / AI / ML', 'Pune', 'Mumbai', 'Contract', 'Hybrid', '₹10,000+/month', 'Last 7 days', 'We Work Remotely']);
  });
});
