/** Years-of-experience extraction from title and description text. */

export interface ExperienceRange {
  min: number | null;
  max: number | null;
  /** The text that decided it, for fresher-check reasons. */
  evidence: string | null;
}

const NUM = String.raw`(\d{1,2}(?:\.\d)?)`;
const YRS = String.raw`(?:years?|yrs?)`;
const RANGE = new RegExp(String.raw`${NUM}\s*(?:-|–|—|to)\s*${NUM}\s*\+?\s*${YRS}`, 'gi');
const PLUS = new RegExp(String.raw`${NUM}\s*\+\s*${YRS}`, 'gi');
const MINIMUM = new RegExp(String.raw`(?:minimum|min\.?|at least|atleast|over|more than)\s*(?:of\s*)?${NUM}\s*\+?\s*${YRS}`, 'gi');
const PLAIN = new RegExp(String.raw`${NUM}\s*${YRS}\s*(?:of\s+)?(?:relevant\s+|work\s+|professional\s+|total\s+|industry\s+|hands[- ]on\s+|prior\s+)?(?:experience|exp\b)`, 'gi');
const EXP_WORD = /experience|exp\b|required|requirement|relevant|qualification/i;
const SOFT_AFTER = /^[^.\n]{0,25}(?:preferred|desirable|good to have|is a plus|a plus|nice to have)/i;
const NOT_EXPERIENCE_BEFORE = /(?:for|last|past|since|than|in business|founded|over the)\s+$/i;
const FRESHER_WORDS = /\bfreshers?\b|no (?:prior |previous |work )?experience (?:is )?(?:required|needed|necessary)|zero experience|0 (?:years?|yrs?) (?:of )?experience/i;
const EXPERIENCED_AFTER = /^[^.\n]{0,30}experienced/i;

interface Hit {
  min: number;
  max: number | null;
  index: number;
  text: string;
}

function collect(re: RegExp, text: string, kind: 'range' | 'plus' | 'min' | 'plain'): Hit[] {
  const hits: Hit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = parseFloat(m[1]!);
    const b = kind === 'range' ? parseFloat(m[2]!) : null;
    const end = m.index + m[0].length;
    const near = text.slice(Math.max(0, m.index - 40), end + 40);
    if (!EXP_WORD.test(near) && !(kind === 'range' && b !== null && b <= 3)) continue;
    if (NOT_EXPERIENCE_BEFORE.test(text.slice(Math.max(0, m.index - 15), m.index))) continue;
    if (SOFT_AFTER.test(text.slice(end, end + 40))) continue;
    if (b !== null && b < a) continue;
    hits.push({ min: a, max: kind === 'range' ? b : kind === 'plain' ? a : null, index: m.index, text: m[0] });
  }
  return hits;
}

/**
 * First experience statement in the text (title first, then description, in document order).
 * "freshers" / "no experience required" map to 0..0 when no number is given.
 */
export function extractExperience(title: string, description: string): ExperienceRange {
  const text = `${title}\n${description}`;
  const hits = [
    ...collect(RANGE, text, 'range'),
    ...collect(PLUS, text, 'plus'),
    ...collect(MINIMUM, text, 'min'),
    ...collect(PLAIN, text, 'plain'),
  ].sort((x, y) => x.index - y.index);
  const first = hits[0];
  if (first) return { min: first.min, max: first.max, evidence: first.text };

  const head = `${title}\n${description.slice(0, 600)}`;
  const f = FRESHER_WORDS.exec(head);
  if (f && !EXPERIENCED_AFTER.test(head.slice(f.index + f[0].length))) return { min: 0, max: 0, evidence: f[0] };
  return { min: null, max: null, evidence: null };
}
