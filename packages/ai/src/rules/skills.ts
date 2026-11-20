/** Curated skill list matched with word boundaries. Canonical casing is what we store and show. */
const SKILLS = [
  // languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Golang', 'Kotlin', 'Swift', 'PHP', 'Ruby', 'Rust', 'Scala', 'Dart', 'SQL', 'HTML', 'CSS', 'Bash', 'MATLAB',
  // frameworks and libraries
  'React', 'React Native', 'Angular', 'Vue.js', 'Next.js', 'Node.js', 'Express.js', 'Redux', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Hibernate', '.NET', 'ASP.NET', 'Laravel', 'Flutter', 'Bootstrap', 'Tailwind CSS', 'jQuery', 'GraphQL', 'REST API',
  'Pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Keras', 'OpenCV', 'LangChain',
  // data, cloud, devops
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'Elasticsearch', 'Kafka', 'Spark', 'Hadoop', 'Hive', 'Airflow', 'Snowflake', 'Tableau', 'Power BI', 'Looker', 'Excel', 'Google Sheets',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'CI/CD', 'Linux', 'Git', 'GitHub', 'Jira', 'Postman', 'Selenium', 'Cypress', 'JUnit', 'Appium',
  'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'Data Structures', 'Algorithms',
  // security
  'Wireshark', 'Burp Suite', 'Nmap', 'Metasploit', 'Splunk', 'SIEM',
  // design, marketing, content
  'Figma', 'Adobe XD', 'Photoshop', 'Illustrator', 'Canva', 'After Effects', 'Premiere Pro', 'SEO', 'Google Analytics', 'Google Ads', 'Meta Ads', 'Mailchimp', 'HubSpot', 'WordPress', 'Shopify', 'SEMrush', 'Hootsuite',
  // business tools
  'PowerPoint', 'Salesforce', 'Zoho', 'SAP', 'Tally', 'QuickBooks', 'CRM', 'AutoCAD', 'SolidWorks', 'Notion',
];

/** Common English words too: only count them when written with the canonical capital letter. */
const CASE_SENSITIVE = new Set(['React', 'Excel', 'Swift', 'Rust', 'Ruby', 'Spark', 'Tally', 'Dart', 'Scala', 'Hive', 'Azure', 'Oracle', 'Notion', 'Git', 'Algorithms']);

const ALIASES: Record<string, string> = {
  'rest apis': 'REST API',
  'restful api': 'REST API',
  'restful apis': 'REST API',
  reactjs: 'React',
  'react.js': 'React',
  nodejs: 'Node.js',
  'node js': 'Node.js',
  vuejs: 'Vue.js',
  nextjs: 'Next.js',
  postgres: 'PostgreSQL',
  'ms excel': 'Excel',
  sklearn: 'scikit-learn',
  html5: 'HTML',
  css3: 'CSS',
};
const canonical = new Map<string, string>([...SKILLS.map((s) => [s.toLowerCase(), s] as const), ...Object.entries(ALIASES)]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s+');

const NAMES = [...canonical.keys()].sort((a, b) => b.length - a.length);
const skillRe = new RegExp(`(?<![\\w.+#])(${NAMES.map(escape).join('|')})(?![\\w+#])`, 'gi');

const MAX_SKILLS = 8;

/** Up to 8 skills; title mentions first, then by frequency, then by first appearance. */
export function extractSkills(title: string, description: string): string[] {
  const found = new Map<string, { score: number; first: number }>();
  const visit = (text: string, bonus: number, offset: number) => {
    skillRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = skillRe.exec(text))) {
      const name = canonical.get(m[1]!.toLowerCase().replace(/\s+/g, ' '));
      if (!name || (CASE_SENSITIVE.has(name) && m[1]!.toLowerCase() === name.toLowerCase() && m[1] !== name)) continue;
      const cur = found.get(name);
      if (cur) cur.score += 1 + bonus;
      else found.set(name, { score: 1 + bonus, first: offset + m.index });
    }
  };
  visit(title, 100, 0);
  visit(description, 0, title.length + 1);
  return [...found.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].first - b[1].first)
    .slice(0, MAX_SKILLS)
    .map(([name]) => name);
}
