import { describe, expect, it } from 'vitest';
import { costUsd } from './pricing.ts';

describe('costUsd', () => {
  it('prices gpt-5.4-mini with a cheaper cached-input rate', () => {
    // 1M input (400k cached), 100k output: 600k*0.9 + 400k*0.09 + 100k*5.4 = 0.54 + 0.036 + 0.54 per... in USD
    expect(costUsd('gpt-5.4-mini', 1_000_000, 100_000, 400_000)).toBeCloseTo(0.6 * 0.9 + 0.4 * 0.09 + 0.1 * 5.4, 6);
  });
  it('prices Jev on input only', () => {
    expect(costUsd('jev-latest', 1_000_000, 500_000)).toBeCloseTo(0.042, 6);
  });
  it('shows an unknown model as zero, not a guess', () => {
    expect(costUsd('mystery', 1_000_000, 1_000_000)).toBe(0);
  });
});
