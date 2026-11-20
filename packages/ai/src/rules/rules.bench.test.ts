import { describe, expect, it } from 'vitest';
import { ruleTag } from './index.ts';
import { post } from './fixtures.ts';

/** Sanity guard, not benchmark infrastructure: the tagger must stay cheap enough to run on every post. */
describe('ruleTag speed', () => {
  it('tags 5,000 posts with a 3 KB description in under 3 seconds', () => {
    const paragraph =
      'We are hiring a Software Engineer intern in Bengaluru, Karnataka. You will work with Python, SQL, Docker and AWS, ' +
      'collaborate with senior stakeholders and remote teams, and ship features. Stipend: Rs. 15k - 20k per month. ' +
      'Experience: 0-1 years. Freshers welcome. Hybrid work, 2025 batch. Our company has 10 years of history and 500 employees. ';
    const description = paragraph.repeat(Math.ceil(3072 / paragraph.length)).slice(0, 3072);
    const p = post({ title: 'Software Engineer Intern', locationRaw: 'Bengaluru, India', description, compensationRaw: null });

    const start = performance.now();
    let last = ruleTag(p);
    for (let i = 0; i < 5000; i++) last = ruleTag(p);
    const ms = performance.now() - start;

    expect(last.cities).toEqual(['Bengaluru']);
    expect(last.fresher).toBe('yes');
    expect(ms).toBeLessThan(3000);
  });

  it('tags a description with no matches (worst case for the scanners) quickly', () => {
    const description = 'lorem ipsum dolor sit amet consectetur '.repeat(80).slice(0, 3072);
    const p = post({ title: 'Associate', description });
    const start = performance.now();
    for (let i = 0; i < 5000; i++) ruleTag(p);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
