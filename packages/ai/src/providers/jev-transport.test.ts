import { describe, expect, it } from 'vitest';
import { jevTransportFor } from './jev.ts';

describe('jevTransportFor', () => {
  it('routes OpenRouter keys through OpenRouter', () => {
    expect(jevTransportFor('sk-or-v1-abc')).toBe('openrouter');
  });
  it('sends every other key to TypeSafe directly', () => {
    expect(jevTransportFor('ts_live_abc')).toBe('typesafe');
    expect(jevTransportFor('')).toBe('typesafe');
  });
});
