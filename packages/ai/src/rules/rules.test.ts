import { describe, expect, it } from 'vitest';
import type { JobPost } from '@beep/shared';
import { fresherCheck, ruleTag } from './index.ts';
import { post } from './fixtures.ts';

describe('fresherCheck', () => {
  const cases: Array<[string, Partial<JobPost>, 'yes' | 'no' | 'unknown', string?]> = [
    ['intern title', { title: 'Software Engineering Intern' }, 'yes', 'title:intern'],
    ['internship word', { title: 'Marketing Internship - 3 months' }, 'yes'],
    ['graduate engineer trainee', { title: 'Graduate Engineer Trainee (GET) - Mechanical' }, 'yes'],
    ['management trainee', { title: 'Management Trainee - Sales' }, 'yes'],
    ['trainee manager is not a manager', { title: 'Trainee Manager - Retail Operations' }, 'yes'],
    ['apprentice', { title: 'Apprentice Electrician' }, 'yes'],
    ['apprenticeship', { title: 'Apprenticeship Program 2025' }, 'yes'],
    ['freshers in title', { title: 'Freshers - Java Developer' }, 'yes'],
    ['entry level', { title: 'Entry Level Data Analyst' }, 'yes'],
    ['campus hiring', { title: 'Campus Hiring 2025 - Associate Engineer' }, 'yes'],
    ['off-campus drive', { title: 'Off-Campus Drive: Software Developer' }, 'yes'],
    ['mass hiring', { title: 'Mass Hiring - Customer Support Executive' }, 'yes'],
    ['walk-in drive', { title: 'Walk-in Drive for BPO Voice Process' }, 'yes'],
    ['batch of', { title: 'Software Developer - 2025 Batch' }, 'yes', 'title:batch'],
    ['recent graduate in description', { title: 'Associate Analyst', description: 'Open to recent graduates from any stream.' }, 'yes'],
    ['0-1 years', { title: 'Python Developer', description: 'Experience: 0-1 years in Python and Django.' }, 'yes', 'experience:0-1'],
    ['0 to 1 year', { title: 'Web Developer', description: 'Required experience 0 to 1 year.' }, 'yes'],
    ['0-2 years', { title: 'QA Engineer', description: 'We need 0-2 years of experience in testing.' }, 'yes'],
    ['no experience required', { title: 'Customer Support Executive', description: 'No experience required, training provided.' }, 'yes'],
    ['fresher in description', { title: 'Sales Executive', description: 'Freshers can apply. Great growth.' }, 'yes'],
    ['junior with 0-1 years', { title: 'Junior Accountant', description: '0-1 years experience with Tally.' }, 'yes'],
    ['junior without experience is unknown', { title: 'Junior Designer', description: 'Join our design team.' }, 'unknown'],
    ['employment type internship', { title: 'Backend Developer', employmentTypeRaw: 'Internship' }, 'yes'],
    ['source hint internship', { title: 'Content Writer', sourceHint: 'internship' }, 'yes', 'source-hint:internship'],
    ['source hint fresher', { title: 'Digital Marketing Executive', sourceHint: 'fresher' }, 'yes'],
    ['senior title', { title: 'Senior Software Engineer' }, 'no', 'title:senior'],
    ['sr. abbreviation', { title: 'Sr. Data Scientist' }, 'no'],
    ['lead', { title: 'Tech Lead - Backend' }, 'no'],
    ['principal', { title: 'Principal Engineer' }, 'no'],
    ['staff', { title: 'Staff Software Engineer' }, 'no'],
    ['architect', { title: 'Cloud Solutions Architect' }, 'no'],
    ['director', { title: 'Director of Engineering' }, 'no'],
    ['head of', { title: 'Head of Marketing' }, 'no'],
    ['vp', { title: 'VP Sales' }, 'no'],
    ['manager', { title: 'Product Manager' }, 'no', 'title:manager'],
    ['sde 2', { title: 'SDE-2 (Backend)' }, 'no'],
    ['lead generation is not a lead role', { title: 'Lead Generation Executive', description: 'Cold calling.' }, 'unknown'],
    ['3+ years', { title: 'Java Developer', description: 'Requirements: 3+ years of experience in Java.' }, 'no', 'experience:3+'],
    ['minimum 2 years', { title: 'React Developer', description: 'Minimum 2 years of experience with React.' }, 'no'],
    ['5-8 years', { title: 'DevOps Engineer', description: 'You have 5-8 years of experience.' }, 'no'],
    ['2-4 years', { title: 'Business Analyst', description: '2-4 years experience required.' }, 'no'],
    ['senior stakeholders boilerplate does not flip', { title: 'Graduate Trainee - Finance', description: 'You will work with senior stakeholders and senior management.' }, 'yes'],
    ['senior in description only stays unknown', { title: 'Operations Associate', description: 'Report to senior leadership and collaborate with senior stakeholders.' }, 'unknown'],
    ['trainee beats 3+ years in description', { title: 'Management Trainee', description: 'Our parent company has 25+ years of experience in retail.' }, 'yes'],
    ['intern beats source nothing', { title: 'Data Science Intern', employmentTypeRaw: 'FULL_TIME' }, 'yes'],
    ['senior beats source hint', { title: 'Senior Analyst', sourceHint: 'fresher' }, 'no'],
    ['company founded years ago is not experience', { title: 'Account Executive', description: 'We have been in business for 15 years and serve 500 clients.' }, 'unknown'],
    ['1-3 years is undecided', { title: 'Data Analyst', description: '1-3 years of experience with SQL.' }, 'unknown'],
    ['preferred years is ignored', { title: 'Support Engineer', description: '2+ years experience preferred but not required.' }, 'unknown'],
    ['postgraduate is not graduate', { title: 'Post-Graduate Teacher' }, 'unknown'],
    ['plain title no signal', { title: 'Software Engineer' }, 'unknown'],
  ];
  it.each(cases)('%s', (_n, over, verdict, reason) => {
    const r = fresherCheck(post(over));
    expect(r.verdict).toBe(verdict);
    if (reason) expect(r.reason).toContain(reason);
  });
});

describe('ruleTag: cities and work mode', () => {
  const cases: Array<[string, Partial<JobPost>, { cities?: string[]; mode?: string | null }]> = [
    ['locationRaw wins over title', { locationRaw: 'Pune, Maharashtra', title: 'Intern - Mumbai' }, { cities: ['Pune'] }],
    ['title used when location empty', { locationRaw: '', title: 'Sales Intern (Jaipur)' }, { cities: ['Jaipur'] }],
    ['description header fallback', { locationRaw: 'India', description: 'Location: Chennai. About us...' }, { cities: ['Chennai'] }],
    ['remote alone gives no city', { locationRaw: 'Remote', title: 'Intern', description: 'Work from home' }, { cities: [], mode: 'remote' }],
    ['pan india gives no city', { locationRaw: 'Pan India' }, { cities: [] }],
    ['multi city', { locationRaw: 'Bengaluru / Hyderabad / Pune' }, { cities: ['Bengaluru', 'Hyderabad', 'Pune'] }],
    ['wfh title', { title: 'Work From Home Customer Support', locationRaw: 'India' }, { mode: 'remote' }],
    ['hybrid in location', { locationRaw: 'Gurgaon (Hybrid)' }, { cities: ['Gurugram'], mode: 'hybrid' }],
    ['onsite in office', { title: 'Sales Executive', description: 'This is an on-site role. You must work from office in Noida.' }, { mode: 'onsite' }],
    ['remote word in prose is not trusted', { description: 'You will collaborate with remote teams across time zones.' }, { mode: null }],
    ['not remote negation', { description: 'This is not a remote position, work from office.' }, { mode: 'onsite' }],
    ['remote in description header', { description: 'This is a fully remote internship open to students.' }, { mode: 'remote' }],
  ];
  it.each(cases)('%s', (_n, over, want) => {
    const r = ruleTag(post(over));
    if (want.cities) expect(r.cities).toEqual(want.cities);
    if ('mode' in want) expect(r.workModeHint).toBe(want.mode);
  });
});

describe('ruleTag: job type', () => {
  const cases: Array<[string, Partial<JobPost>, string | null]> = [
    ['intern title', { title: 'Design Intern' }, 'internship'],
    ['internship etype', { title: 'Operations Executive', employmentTypeRaw: 'Internship' }, 'internship'],
    ['apprentice', { title: 'Graduate Apprentice' }, 'apprenticeship'],
    ['contract etype', { title: 'Content Writer', employmentTypeRaw: 'Contract' }, 'contract'],
    ['full time etype with underscore', { title: 'Software Engineer', employmentTypeRaw: 'FULL_TIME' }, 'full_time'],
    ['trainee is full time', { title: 'Graduate Engineer Trainee' }, 'full_time'],
    ['trainee on an internship board', { title: 'Management Trainee', sourceHint: 'internship' }, 'internship'],
    ['nothing says', { title: 'Sales Executive' }, null],
  ];
  it.each(cases)('%s', (_n, over, want) => {
    expect(ruleTag(post(over)).jobTypeHint).toBe(want);
  });
});

describe('ruleTag: role', () => {
  const cases: Array<[string, string, string, string | null, number]> = [
    ['qa engineer', 'QA Engineer', '', 'QA / Testing', 0.8],
    ['data analyst', 'Data Analyst', '', 'Business / Data Analyst', 0.8],
    ['react developer', 'React Developer', '', 'Software Engineering', 0.8],
    ['ui/ux designer', 'UI/UX Designer', '', 'UI / UX Design', 0.8],
    ['sales executive', 'Sales Executive', '', 'Sales / Business Development', 0.8],
    ['software engineer intern', 'Software Engineer Intern', '', 'Software Engineering', 0.8],
    ['data scientist', 'Data Scientist - Machine Learning', '', 'Data / AI / ML', 0.8],
    ['devops', 'DevOps Engineer', '', 'DevOps / Cloud', 0.8],
    ['digital marketing', 'Digital Marketing Executive', '', 'Marketing', 0.8],
    ['content writer', 'Content Writer Intern', '', 'Content / Writing', 0.8],
    ['accountant', 'Accounts Executive', '', 'Finance / Accounting', 0.8],
    ['hr recruiter', 'HR Recruiter', '', 'HR / Recruiting', 0.8],
    ['customer support', 'Customer Support Associate', '', 'Customer Support', 0.8],
    ['mechanical engineer', 'Mechanical Design Engineer Trainee', '', 'Core Engineering', 0.8],
    ['product manager intern', 'Associate Product Manager', '', 'Product Management', 0.8],
    ['security analyst', 'Cyber Security Analyst', '', 'Cybersecurity', 0.8],
    ['salesforce developer is software not sales', 'Salesforce Developer', '', 'Software Engineering', 0.8],
    ['tie is ambiguous', 'Sales and Marketing Executive', '', null, 0],
    ['bare intern has no role', 'Intern', '', null, 0],
    ['description only is low confidence', 'Associate', 'You will be a software developer writing backend services.', 'Software Engineering', 0.5],
  ];
  it.each(cases)('%s', (_n, title, description, role, minConf) => {
    const r = ruleTag(post({ title, description }));
    expect(r.roleHint).toBe(role);
    if (role) {
      if (minConf >= 0.8) expect(r.roleConfidence).toBeGreaterThanOrEqual(0.8);
      else expect(r.roleConfidence).toBeLessThan(0.8);
    } else {
      expect(r.roleConfidence).toBe(0);
    }
  });
});

describe('ruleTag: experience', () => {
  const cases: Array<[string, string, string, number | null, number | null]> = [
    ['0-1 years', 'Developer', 'Experience: 0-1 years', 0, 1],
    ['1 to 3 yrs', 'Developer', 'We need 1 to 3 yrs of experience', 1, 3],
    ['freshers', 'Freshers Wanted', '', 0, 0],
    ['2+ years', 'Developer', 'Requires 2+ years of experience', 2, null],
    ['none', 'Developer', 'Join our team', null, null],
    ['company age ignored', 'Developer', 'A 10 year old company with 500 employees', null, null],
  ];
  it.each(cases)('%s', (_n, title, description, min, max) => {
    const r = ruleTag(post({ title, description }));
    expect([r.experienceMinYears, r.experienceMaxYears]).toEqual([min, max]);
  });
});

describe('ruleTag: stipend and salary to monthly INR', () => {
  const cases: Array<[string, string | null, string, number | null, number | null]> = [
    ['rupee symbol per month', '₹10,000/month', '', 10000, 10000],
    ['rs with k range', 'Rs. 15k - 20k per month', '', 15000, 20000],
    ['bare range per month', '10000-15000 per month', '', 10000, 15000],
    ['inr lpa single', 'INR 3 LPA', '', 25000, 25000],
    ['lpa range', '3-5 LPA', '', 25000, 41667],
    ['lakh per annum', '4.5 lakh per annum', '', 37500, 37500],
    ['lakhs p.a. range with symbols', '₹ 3.5 - 4.5 Lacs P.A.', '', 29167, 37500],
    ['unpaid', 'Unpaid', '', null, null],
    ['competitive', 'Competitive', '', null, null],
    ['not disclosed', 'Not disclosed', '', null, null],
    ['usd ignored', '$50,000 per year', '', null, null],
    ['usd suffix ignored', '1500 USD per month', '', null, null],
    ['up to', 'Up to ₹25,000 per month', '', null, 25000],
    ['from', 'Starting at Rs 12,000 per month', '', 12000, null],
    ['indian grouping', '₹1,20,000 per annum', '', 10000, 10000],
    ['annual figure without period', 'CTC: 3,60,000', '', 30000, 30000],
    ['upper case K', '₹8K-12K/month', '', 8000, 12000],
    ['hourly ignored', '₹200 per hour', '', null, null],
    ['description stipend', null, 'Stipend: ₹ 8,000 - 12,000 per month. Duration 3 months.', 8000, 12000],
    ['description salary lpa', null, 'Salary: 3.6 LPA for freshers', 30000, 30000],
    ['description duration is not money', null, 'Duration: 6 months. 40 hours per week. Batch of 2025.', null, null],
    ['description unpaid leave does not hide pay', null, 'Stipend of Rs. 10000 per month. Unpaid leave is not allowed.', 10000, 10000],
    ['compensation beats description', '₹15,000/month', 'Stipend: ₹ 8,000 per month', 15000, 15000],
    ['unpaid internship in description', null, 'This is an unpaid internship with a certificate.', null, null],
  ];
  it.each(cases)('%s', (_n, comp, description, min, max) => {
    const r = ruleTag(post({ compensationRaw: comp, description }));
    expect([r.stipendMinMonthlyInr, r.stipendMaxMonthlyInr]).toEqual([min, max]);
  });
});

describe('ruleTag: skills', () => {
  const cases: Array<[string, string, string, string[]]> = [
    ['canonical casing', 'Developer', 'We use javascript, NODE.JS and sql daily.', ['JavaScript', 'Node.js', 'SQL']],
    ['java is not javascript', 'Developer', 'Strong in Java and JavaScript.', ['Java', 'JavaScript']],
    ['title skill first', 'Python Developer', 'Knowledge of SQL, Docker, Git.', ['Python', 'SQL', 'Docker', 'Git']],
    ['excel needs capital', 'Executive', 'You should excel at communication. Advanced Excel is needed.', ['Excel']],
    ['c plus plus and c sharp', 'Engineer', 'Experience in C++ and C#.', ['C++', 'C#']],
    ['dotnet', 'Developer', 'ASP.NET and .NET Core with MySQL.', ['ASP.NET', '.NET', 'MySQL']],
    ['aliases', 'Developer', 'ReactJS, NodeJS, Postgres.', ['React', 'Node.js', 'PostgreSQL']],
    ['power bi two words', 'Analyst', 'Dashboards in Power BI and Tableau.', ['Power BI', 'Tableau']],
    ['ruby spring words ignored', 'Executive', 'A ruby necklace and a spring sale.', []],
    ['no skills', 'Executive', 'Good communication and teamwork.', []],
  ];
  it.each(cases)('%s', (_n, title, description, want) => {
    expect(ruleTag(post({ title, description })).skills).toEqual(want);
  });

  it('caps at 8 skills', () => {
    const d = 'Python Java SQL Docker Git AWS Linux React Angular Django Flask Kafka Redis';
    expect(ruleTag(post({ description: d })).skills).toHaveLength(8);
  });
});

describe('ruleTag: whole posts', () => {
  it('tags an internshala-style post end to end', () => {
    const r = ruleTag(
      post({
        title: 'Python Development Internship',
        locationRaw: 'Work From Home',
        employmentTypeRaw: 'Internship',
        compensationRaw: '₹ 10,000 - 15,000 /month',
        description: 'Skills required: Python, Django, SQL. 3 months duration. 2025 batch freshers welcome.',
        sourceHint: 'internship',
      }),
    );
    expect(r).toMatchObject({
      cities: [],
      workModeHint: 'remote',
      jobTypeHint: 'internship',
      roleHint: 'Software Engineering',
      fresher: 'yes',
      stipendMinMonthlyInr: 10000,
      stipendMaxMonthlyInr: 15000,
    });
    expect(r.skills).toEqual(['Python', 'Django', 'SQL']);
  });

  it('tags a senior post as not fresher', () => {
    const r = ruleTag(post({ title: 'Senior DevOps Engineer', locationRaw: 'Bangalore', description: '6+ years of experience with AWS and Kubernetes.' }));
    expect(r).toMatchObject({ fresher: 'no', cities: ['Bengaluru'], roleHint: 'DevOps / Cloud', experienceMinYears: 6, experienceMaxYears: null });
  });
});
