import type { RoleCategory } from '@beep/shared';

/**
 * Keyword scoring. Weight 10 = phrase that names the role on its own, 6 = typical word, 3 = weak hint.
 * Every matching pattern adds its weight once, so "React Developer" (10 + 6) beats a lone "Designer" (6).
 * Only weight-10 patterns are searched in the description, at a tiny weight, because descriptions are noisy.
 */
type Rule = [pattern: string, weight: 10 | 6 | 3];

const KEYWORDS: Partial<Record<RoleCategory, Rule[]>> = {
  'Software Engineering': [
    [String.raw`\b(?:software|sde|swe)\b.{0,15}\b(?:engineer|developer|development)`, 10],
    [String.raw`\bsde[- ]?(?:i|1|intern)?\b|\bswe\b`, 10],
    [String.raw`\bfull[- ]?stack\b|\bback[- ]?end\b|\bfront[- ]?end\b|\bweb developer\b|\bmern\b`, 10],
    [String.raw`(?<![\w.])(?:react(?:\.?js)?|angular|vue(?:\.?js)?|node(?:\.?js)?|java|python|php|golang|ruby|rails|django|spring(?: boot)?|\.net|dotnet|asp\.net|c\+\+|c#|flutter|android|ios|mobile|laravel|javascript|typescript|kotlin|swift|salesforce|wordpress|unity|game|embedded c)\s+(?:developer|development|engineer|programmer|intern)`, 10],
    [String.raw`\b(?:app(?:lication)?|mobile|web)\s+(?:developer|development)\b|\bprogrammer\b`, 10],
    [String.raw`\bdeveloper\b`, 6],
    [String.raw`\bsoftware\b|\bsystems? engineer\b|\btechnology analyst\b|\bprogram analyst\b`, 6],
    [String.raw`\bit (?:intern|trainee|engineer)\b|\btechnical (?:intern|associate)\b`, 3],
  ],
  'Data / AI / ML': [
    [String.raw`\bdata scien|\bmachine learning\b|\bml\b|\bdeep learning\b|\bnlp\b|\bcomputer vision\b|\bartificial intelligence\b|\bgen(?:erative)? ?ai\b|\bllm\b`, 10],
    [String.raw`\bdata engineer|\bbig data\b|\banalytics engineer`, 10],
    [String.raw`\bai\b|\bdata (?:science|engineering)\b`, 6],
    [String.raw`\bdata\b`, 3],
  ],
  'QA / Testing': [
    [String.raw`\bqa\b|\bsdet\b|\bquality assurance\b|\btesters?\b|\btest engineer\b|\bsoftware testing\b|\bmanual testing\b|\bautomation testing\b|\btest automation\b`, 10],
    [String.raw`\btesting\b|\bquality analyst\b`, 6],
  ],
  'DevOps / Cloud': [
    [String.raw`\bdevops\b|\bdevsecops\b|\bsite reliability\b|\bsre\b|\bcloud (?:engineer|architect|intern|support)\b|\bplatform engineer\b|\binfrastructure engineer\b|\bsystem administrator\b|\bsysadmin\b`, 10],
    [String.raw`\b(?:aws|azure|gcp)\b|\bkubernetes\b|\bcloud\b`, 6],
  ],
  Cybersecurity: [
    [String.raw`\bcyber ?security\b|\binformation security\b|\binfosec\b|\bsecurity (?:analyst|engineer|intern|researcher)\b|\bsoc analyst\b|\bpenetration test|\bpentest|\bethical hack|\bvapt\b|\bthreat (?:analyst|hunter|intelligence)\b`, 10],
    [String.raw`\bsecurity\b`, 3],
  ],
  'UI / UX Design': [
    [String.raw`\bui\s*/?\s*ux\b|\bux\s*/?\s*ui\b|\bux (?:designer|researcher|intern|design)\b|\bui designer\b|\bproduct designer\b|\buser experience\b|\buser interface\b|\binteraction designer\b`, 10],
    [String.raw`\bgraphic design|\bvisual design|\bmotion graphic|\bdesigner\b|\bfigma\b`, 6],
  ],
  'Product Management': [
    [String.raw`\bproduct manage|\bassociate product\b|\bapm\b|\bproduct owner\b|\bproduct (?:intern|trainee)\b`, 10],
    [String.raw`\bproduct (?:analyst|operations)\b`, 6],
  ],
  'Business / Data Analyst': [
    [String.raw`\bdata analy(?:st|tics)\b|\bbusiness analy(?:st|tics)\b|\bbusiness intelligence\b|\bbi (?:analyst|developer|intern)\b|\bpower ?bi\b|\banalytics (?:intern|analyst|trainee|associate|executive)\b|\bmis (?:executive|analyst)\b|\bresearch analyst\b`, 10],
    [String.raw`\banalyst\b`, 3],
  ],
  'Sales / Business Development': [
    [String.raw`\bsales\b|\bbusiness development\b|\bbd[ea]\b|\bbdm\b|\btele ?sales\b|\binside sales\b|\blead generation\b|\baccount executive\b|\bpre[- ]?sales\b|\bfield executive\b`, 10],
    [String.raw`\brelationship (?:manager|executive)\b|\bclient acquisition\b|\bcold calling\b|\bgrowth\b`, 6],
  ],
  Marketing: [
    [String.raw`\bmarketing\b|\bseo\b|\bsocial media\b|\bperformance marketing\b|\bbrand (?:manager|executive|intern|associate)\b|\binfluencer\b|\bemail marketing\b`, 10],
    [String.raw`\bcommunity manager\b|\bgrowth marketing\b|\bbranding\b|\bcampaign\b`, 6],
  ],
  'Content / Writing': [
    [String.raw`\bcontent (?:writer|writing|creator|strategist|developer|associate|intern)\b|\bcopywrit|\btechnical writer\b|\bwriter\b|\beditor\b|\bjournalis|\bblogger\b|\bcreative writing\b|\bscriptwriter\b`, 10],
    [String.raw`\bcontent\b|\bvideo editor\b`, 6],
  ],
  'Finance / Accounting': [
    [String.raw`\baccountant\b|\baccounting\b|\baccounts (?:executive|assistant|payable|receivable|intern)\b|\bbookkeep|\bauditor?\b|\baudit (?:intern|associate|assistant|trainee)\b|\bfinanc(?:e|ial)\b|\binvestment bank|\bequity research\b|\btreasury\b|\bcredit analyst\b|\bfp&a\b|\btaxation\b|\bchartered accountant\b|\barticleship\b|\bgst\b`, 10],
    [String.raw`\bbanking\b|\bcredit\b|\binsurance\b`, 6],
  ],
  'HR / Recruiting': [
    [String.raw`\bhr\b|\bhuman resources?\b|\brecruiter\b|\brecruitment (?:executive|associate|coordinator|intern|specialist|consultant)\b|\btalent acquisition\b|\bhrbp\b|\bpeople (?:operations|partner|ops)\b|\bpayroll\b`, 10],
    [String.raw`\btalent\b|\bstaffing\b|\bonboarding\b`, 6],
  ],
  'Operations / Supply Chain': [
    [String.raw`\bsupply chain\b|\blogistics\b|\boperations?\b|\bprocurement\b|\bwarehouse\b|\binventory\b|\bscm\b|\bback office\b|\bprocess (?:associate|executive|analyst)\b|\bpurchase (?:executive|officer)\b|\bdata entry\b`, 10],
    [String.raw`\bcoordinator\b|\bvendor\b|\bfleet\b|\bdispatch\b`, 6],
  ],
  'Customer Support': [
    [String.raw`\bcustomer (?:support|service|success|care|experience|relations)\b|\btechnical support\b|\bsupport (?:executive|associate|engineer|specialist|representative|agent)\b|\bhelp ?desk\b|\bservice desk\b|\bcall cent(?:re|er)\b|\bbpo\b|\bvoice process\b|\bnon[- ]voice\b|\bchat process\b|\bclient service\b|\bcsr\b|\bcsa\b`, 10],
    [String.raw`\bsupport\b`, 3],
  ],
  'Core Engineering': [
    [String.raw`\bmechanical\b|\bcivil\b|\belectrical\b|\bchemical engineer|\bproduction engineer\b|\bmanufacturing\b|\bplc\b|\bscada\b|\bautocad\b|\bsite engineer\b|\bdesign engineer\b|\bmaintenance engineer\b|\binstrumentation\b|\bautomobile\b|\bautomotive\b|\bmechatronics\b|\bcnc\b|\bstructural\b|\bhvac\b|\bquality engineer\b`, 10],
    [String.raw`\bvlsi\b|\bembedded\b|\bfirmware\b|\brtl\b|\bhardware engineer\b|\belectronics\b|\bgraduate engineer trainee\b|\bdiploma\b`, 6],
  ],
  Consulting: [
    [String.raw`\bconsultant\b|\bconsulting\b|\badvisory\b|\bstrategy (?:analyst|associate|intern|consultant)\b|\bmanagement consult`, 10],
    [String.raw`\bfunctional\b|\bimplementation (?:consultant|executive)\b`, 3],
  ],
};

interface CompiledCategory {
  category: RoleCategory;
  title: Array<[RegExp, number]>;
  /** One alternation of the weight-10 patterns, for the description. */
  desc: RegExp;
}

const COMPILED: CompiledCategory[] = Object.entries(KEYWORDS).map(([category, rules]) => ({
  category: category as RoleCategory,
  title: rules.map(([p, w]) => [new RegExp(p, 'i'), w] as [RegExp, number]),
  desc: new RegExp(
    rules
      .filter(([, w]) => w === 10)
      .map(([p]) => `(?:${p})`)
      .join('|'),
    'gi',
  ),
}));

const DESC_CHARS = 1500;
const DESC_CAP = 3;

export interface RoleGuess {
  role: RoleCategory | null;
  confidence: number;
}

export function guessRole(title: string, description: string): RoleGuess {
  const desc = description.slice(0, DESC_CHARS);
  const scored = COMPILED.map((c) => {
    let t = 0;
    for (const [re, w] of c.title) if (re.test(title)) t += w;
    let d = 0;
    c.desc.lastIndex = 0;
    while (d < DESC_CAP && c.desc.exec(desc)) d++;
    return { category: c.category, title: t, total: t + d };
  }).sort((a, b) => b.total - a.total);

  const [top, second] = scored;
  if (!top || top.total === 0) return { role: null, confidence: 0 };
  const margin = top.total - (second?.total ?? 0);
  if (margin < 2) return { role: null, confidence: 0 };

  if (top.title >= 10 && margin >= 6) return { role: top.category, confidence: top.title >= 16 && margin >= 10 ? 0.95 : 0.9 };
  if (top.title >= 6 && margin >= 4) return { role: top.category, confidence: 0.7 };
  if (top.title >= 3) return { role: top.category, confidence: margin >= 3 ? 0.5 : 0.4 };
  return { role: top.category, confidence: top.total >= 2 && margin >= 2 ? 0.35 : 0.3 };
}
