import { describe, expect, it } from 'vitest';
import { decodeEntities, stripHtml } from './util.ts';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('real products &mdash; not toys &amp; demos')).toBe('real products — not toys & demos');
    expect(decodeEntities('&#8377;5,000 &#x2013; &#8377;10,000')).toBe('₹5,000 – ₹10,000');
    expect(decodeEntities("it&rsquo;s &ldquo;fine&rdquo;")).toBe('it’s “fine”');
  });
  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notathing; text')).toBe('&notathing; text');
  });
});

describe('stripHtml', () => {
  it('strips tags and decodes entities once', () => {
    expect(stripHtml('<p>Build &amp; ship &mdash; fast</p><ul><li>A</li><li>B</li></ul>')).toContain('Build & ship — fast');
  });
});
