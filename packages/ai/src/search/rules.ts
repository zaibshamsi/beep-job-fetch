/**
 * Layer (a) of natural-language search: a free, deterministic query parser.
 * Each matcher consumes the words it understands, so what is left over becomes the keywords.
 */
import { CITIES } from '@beep/shared';
import type { JobFilters, JobType, RoleCategory, WorkMode } from '@beep/shared';
import { findCityInQuery } from '../rules/gazetteer.ts';

export const normaliseQuery = (q: string) => q.toLowerCase().replace(/\s+/g, ' ').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every alias of every city, longest first, so "navi mumbai" is removed before "mumbai".
const CITY_WORDS = [...new Set(CITIES.flatMap((c) => [c.name.toLowerCase(), ...c.aliases.map((a) => a.toLowerCase())]))].sort(
  (a, b) => b.length - a.length,
);
const CITY_RE = new RegExp(`(?<![a-z0-9])(?:${CITY_WORDS.map(escapeRe).join('|')})(?![a-z0-9])`, 'g');

/** First matching entry wins, so order matters: specific roles before the broad "software". */
const ROLE_PATTERNS: [RoleCategory, RegExp][] = [
  ['QA / Testing', /\b(?:qa|sdet|testers?|testing|quality assurance|test engineers?)\b/],
  ['DevOps / Cloud', /\b(?:devops|sre|cloud(?: engineers?| computing)?|sysadmin|site reliability)\b/],
  ['Cybersecurity', /\b(?:cyber ?security|infosec|information security|pentest(?:er|ing)?|security (?:analyst|engineer)s?|soc analyst)\b/],
  ['Data / AI / ML', /\b(?:data scien(?:ce|tists?)|machine learning|deep learning|ml|ai|nlp|data engineer(?:ing|s)?|genai|llm)\b/],
  ['Business / Data Analyst', /\b(?:(?:data|business|bi|research|product|financial|marketing) analy(?:st|sts|tics)|analysts?|mis)\b/],
  ['UI / UX Design', /\b(?:ui\/ux|ui|ux|(?:graphic|product|visual|ui|ux) design(?:ers?)?|designers?|design)\b/],
  ['Product Management', /\b(?:product managers?|product management|apm|product owner)\b/],
  ['Sales / Business Development', /\b(?:sales|business development|bdr?|bde|inside sales|lead generation)\b/],
  ['Marketing', /\b(?:(?:digital|performance|social media|content) marketing|marketing|seo|social media|growth)\b/],
  ['Content / Writing', /\b(?:content writ(?:ing|ers?)|content creat(?:ion|ors?)|copy ?writ(?:ing|ers?)|technical writ(?:ing|ers?)|writ(?:ing|ers?)|editors?|bloggers?|content)\b/],
  ['Finance / Accounting', /\b(?:finance|financial|accounting|accountants?|audit(?:or|ing)?|taxation|banking|ca articleship)\b/],
  ['HR / Recruiting', /\b(?:hr|human resources?|recruit(?:ers?|ment|ing)|talent acquisition)\b/],
  ['Customer Support', /\b(?:customer (?:support|service|success|care)|call cent(?:er|re)|bpo|voice process|support executives?|technical support)\b/],
  ['Core Engineering', /\b(?:mechanical|civil|electrical|electronics|chemical|core engineering|production engineers?|site engineers?)\b/],
  ['Consulting', /\b(?:consult(?:ing|ants?)|strategy analysts?)\b/],
  ['Operations / Supply Chain', /\b(?:operations?|supply chain|logistics|procurement)\b/],
  // Tech words (java, frontend...) stay behind as keywords; only the role noun is consumed.
  ['Software Engineering', /\b(?:software|developers?|development|sde|programmers?|coding)\b/],
];

const JOB_TYPE_PATTERNS: [JobType, RegExp][] = [
  ['internship', /\binterns?(?:hips?)?\b/],
  ['apprenticeship', /\bapprentice(?:s|ships?)?\b/],
  ['full_time', /\b(?:full[- ]?time|permanent)\b/],
  ['contract', /\b(?:contract|freelance|part[- ]?time|temporary)\b/],
];

const WORK_MODE_PATTERNS: [WorkMode, RegExp][] = [
  ['remote', /\b(?:remote(?:ly)?|wfh|work[- ]from[- ]home)\b/],
  ['hybrid', /\bhybrid\b/],
  ['onsite', /\b(?:on[- ]?site|in[- ]office|work from office|wfo)\b/],
];

const FILLER =
  /\b(?:fresher|freshers|entry[- ]level|jobs?|openings?|vacanc(?:y|ies)|positions?|roles?|opportunit(?:y|ies)|hiring|posted|posts?|new|latest|in|at|near|around|for|with|and|or|the|a|an|of|from|to|me|my|show|find|get|looking|want|need|any|all|available|please|only)\b/g;

/** "10k", "above 15000", "₹20,000", "3 lpa" -> monthly INR; null when no amount. Consumes the matched text. */
function takeAmount(text: string): { amount: number | null; rest: string } {
  const re =
    /(?<![a-z0-9])(?:(?:above|over|min(?:imum)?|at least|atleast|more than|>=?|minimum of|starting)\s*)?(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|lpa|lakhs?|l\b)?(?:\s*(?:\/|per)\s*(?:month|mo|m)\b)?(?:\s*(?:stipend|salary|pm))?/;
  for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
    const hasCurrency = /₹|rs\.?|inr/.test(m[0]);
    const hasContext = /above|over|min|at least|atleast|more than|>|starting|stipend|salary|pm\b|month|\/mo/.test(m[0]);
    const unit = m[2];
    const n = Number(m[1]!.replace(/,/g, ''));
    let monthly: number | null = null;
    if (unit === 'k') monthly = n * 1_000;
    else if (unit && /^(lpa|l|lakhs?)$/.test(unit)) monthly = Math.round((n * 100_000) / 12);
    else if ((hasCurrency || hasContext) && n >= 1_000 && !(n >= 1990 && n <= 2100 && !hasCurrency)) monthly = n;
    if (monthly !== null && monthly >= 500) return { amount: monthly, rest: text.replace(m[0], ' ') };
  }
  return { amount: null, rest: text };
}

const POSTED: [RegExp, number][] = [
  [/\b(?:posted )?today\b|\b(?:last|past) 24 hours\b|\bnew today\b/, 1],
  [/\b(?:this|past|last) week\b|\b(?:last|past|within) 7 days\b/, 7],
  [/\b(?:this|past|last) month\b|\b(?:last|past|within) 30 days\b/, 30],
];

export interface RuleParse {
  filters: JobFilters;
  /** Words left after everything understood was removed. */
  keywords: string[];
}

/** Snap "last N days" to the windows the UI offers (1, 7, 30). */
const snapDays = (n: number) => (n <= 1 ? 1 : n <= 7 ? 7 : 30);

export function parseWithRules(query: string): RuleParse {
  const original = query.slice(0, 300);
  let rest = normaliseQuery(original);
  const filters: JobFilters = {};

  const cities = findCityInQuery(original);
  if (cities.length) filters.cities = cities;
  rest = rest.replace(CITY_RE, ' ');

  for (const [mode, re] of WORK_MODE_PATTERNS) {
    if (re.test(rest)) {
      filters.workMode = mode;
      rest = rest.replace(new RegExp(re.source, 'g'), ' ');
      break;
    }
  }
  for (const [type, re] of JOB_TYPE_PATTERNS) {
    if (re.test(rest)) {
      filters.jobType = type;
      rest = rest.replace(new RegExp(re.source, 'g'), ' ');
      break;
    }
  }

  for (const [re, days] of POSTED) {
    if (re.test(rest)) {
      filters.postedWithinDays = days;
      rest = rest.replace(new RegExp(re.source, 'g'), ' ');
      break;
    }
  }
  const lastN = rest.match(/\b(?:last|past|within)\s+(\d+)\s+days?\b/);
  if (lastN && filters.postedWithinDays === undefined) {
    filters.postedWithinDays = snapDays(Number(lastN[1]));
    rest = rest.replace(lastN[0], ' ');
  }

  const amount = takeAmount(rest);
  rest = amount.rest;
  const paidWord = /(?<!un)\b(?:paid|stipend|salary|salaried)\b/;
  if (amount.amount !== null) filters.stipendMin = amount.amount;
  if (paidWord.test(rest)) {
    if (filters.stipendMin === undefined) filters.stipendMin = 1;
    rest = rest.replace(new RegExp(paidWord.source, 'g'), ' ');
  }

  for (const [role, re] of ROLE_PATTERNS) {
    if (re.test(rest)) {
      filters.roleCategory = role;
      rest = rest.replace(new RegExp(re.source, 'g'), ' ');
      break;
    }
  }

  const keywords = [
    ...new Set(
      rest
        .replace(FILLER, ' ')
        .replace(/[^a-z0-9+#.\s-]/g, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
        .filter((w) => w.length > 1),
    ),
  ];
  if (keywords.length) filters.keywords = keywords;
  return { filters, keywords };
}
