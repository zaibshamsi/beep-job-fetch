/** Stipend / salary parsing into INR per month. Non-INR currencies are ignored. */

export interface Money {
  min: number | null;
  max: number | null;
}
const NONE: Money = { min: null, max: null };

const INR = String.raw`₹|rs\.?|inr|rupees?`;
const FOREIGN = String.raw`\$|us\$|usd|eur|€|£|gbp|aed|sgd|cad|aud`;
const UNIT = String.raw`lpa|lakhs?|lacs?|lac|l|k`;
const AMOUNT = new RegExp(
  String.raw`(?:(?<![a-z])(?<cur>${INR}|${FOREIGN}))?\s*(?<a>\d+(?:\.\d+)?)\s*(?<au>${UNIT})?(?![a-z0-9])` +
    String.raw`(?:\s*(?:-|–|—|to)\s*(?:(?<cur2>${INR}|${FOREIGN})\s*)?(?<b>\d+(?:\.\d+)?)\s*(?<bu>${UNIT})?(?![a-z0-9]))?`,
  'giu',
);

const INR_RE = new RegExp(`^(?:${INR})$`, 'i');
const UNPAID = /\bunpaid\b|\bno stipend\b|\bnot paid\b|\bstipend\s*[:\-]?\s*(?:nil|none)\b/i;
/** In a long description "unpaid leave" is common, so only an explicit unpaid role counts there. */
const UNPAID_ROLE = /\bunpaid\s+(?:internship|position|role|opportunity|basis)\b|\bthis is an unpaid\b/i;
const NOT_MONEY_TAIL = /^\s*(?:months?|mos?\b|years?|yrs?|weeks?|days?|hours?|hrs?|%|\+?\s*(?:employees|openings|vacancies|positions|candidates))/i;
const FOREIGN_TAIL = /^\s*(?:usd|eur|dollars?|gbp|aed|sgd)\b/i;
const ANNUAL_TAIL = /^\s*(?:\(?ctc\)?\s*)?(?:per\s*(?:annum|year|yr)\b|\/\s*(?:annum|year|yr)\b|p\.?\s?a\b\.?|annually|annual\b|a year\b|yearly|ctc\b)/i;
const MONTH_TAIL = /^\s*(?:\(?[a-z]+\)?\s*)?(?:per\s*month|\/\s*(?:month|mo)\b|p\.?\s?m\b\.?|monthly|a month|\/m\b)/i;
const OTHER_PERIOD_TAIL = /^\s*(?:per\s*(?:hour|hr|day|week)|\/\s*(?:hour|hr|day|week)|hourly|daily|weekly)/i;
const MONTH_BEFORE = /(?:monthly|per month)[^\d]{0,25}$/i;
const ANNUAL_BEFORE = /(?:annual|yearly|ctc|per annum)[^\d]{0,25}$/i;
const KEYWORD_BEFORE = /(?:stipend|salary|ctc|pay|compensation|remuneration|package|earn(?:ing)?s?)[^\d]{0,20}$/i;
const UP_TO_BEFORE = /(?:up\s*to|upto|max(?:imum)?)\s*$/i;
const FROM_BEFORE = /(?:from|starting(?:\s+(?:at|from))?|min(?:imum)?\.?|at\s*least|atleast)\s*$/i;

function multiplier(unit: string | undefined): number {
  switch (unit?.toLowerCase()) {
    case 'k':
      return 1_000;
    case 'l':
    case 'lac':
    case 'lacs':
    case 'lakh':
    case 'lakhs':
    case 'lpa':
      return 100_000;
    default:
      return 1;
  }
}

/** Parse the first INR amount in the text. `strict` (descriptions) demands a currency, unit or period marker. */
function parse(text: string, strict: boolean): Money {
  const s = text.replace(/(?<=\d),(?=\d)/g, '');
  if ((strict ? UNPAID_ROLE : UNPAID).test(s)) return NONE;
  AMOUNT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT.exec(s))) {
    const g = m.groups!;
    const end = m.index + m[0].length;
    const tail = s.slice(end, end + 30);
    const before = s.slice(Math.max(0, m.index - 30), m.index);
    const cur = g.cur?.toLowerCase();
    if ((cur && !INR_RE.test(cur)) || (g.cur2 && !INR_RE.test(g.cur2))) continue;
    if (FOREIGN_TAIL.test(tail) || NOT_MONEY_TAIL.test(tail) || OTHER_PERIOD_TAIL.test(tail)) continue;

    const unitA = g.au ?? g.bu; // "3-5 LPA": the unit written once applies to both ends
    const unitB = g.bu ?? g.au;
    const isLakh = (u?: string) => multiplier(u) === 100_000;
    const annualByTail = ANNUAL_TAIL.test(tail);
    const monthByTail = MONTH_TAIL.test(tail);
    const hasMarker = !!cur || !!g.cur2 || !!g.au || !!g.bu || annualByTail || monthByTail || KEYWORD_BEFORE.test(before);
    if (!hasMarker && (strict || parseFloat(g.a!) < 1000)) continue;

    let a = parseFloat(g.a!) * multiplier(unitA);
    let b = g.b ? parseFloat(g.b) * multiplier(unitB) : null;
    const annual =
      annualByTail ||
      isLakh(unitA) ||
      (!monthByTail && !MONTH_BEFORE.test(before) && (ANNUAL_BEFORE.test(before) || a >= 150_000));
    if (annual) {
      a = a / 12;
      b = b === null ? null : b / 12;
    }
    a = Math.round(a);
    b = b === null ? null : Math.round(b);
    if (a < 500 || a > 1_000_000 || (b !== null && (b < a || b > 1_000_000))) continue;

    if (b !== null) return { min: a, max: b };
    if (UP_TO_BEFORE.test(before)) return { min: null, max: a };
    if (FROM_BEFORE.test(before) || tail.startsWith('+')) return { min: a, max: null };
    return { min: a, max: a };
  }
  return NONE;
}

/** compensationRaw is the primary source; the description is only searched when it has nothing usable. */
export function parseCompensation(compensationRaw: string | null, description: string): Money {
  if (compensationRaw?.trim()) {
    const r = parse(compensationRaw, false);
    if (r.min !== null || r.max !== null) return r;
    if (UNPAID.test(compensationRaw)) return NONE;
  }
  return parse(description.slice(0, 4000), true);
}
