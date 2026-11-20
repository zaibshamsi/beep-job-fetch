import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// repo root = packages/shared/src -> ../../..
loadDotenv({ path: path.resolve(here, '../../../.env') });

const bool = (v: string | undefined, d: boolean) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(v.toLowerCase());

export const env = {
  db: {
    server: process.env.DB_SERVER ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_NAME ?? 'beepjobfetch',
    user: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
    encrypt: bool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERT, true),
  },
  jev: {
    apiKey: process.env.JEV_API_KEY ?? '',
    model: process.env.JEV_MODEL || 'jev-latest',
  },
  azure: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? '',
    apiKey: process.env.AZURE_OPENAI_API_KEY ?? '',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? '',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview',
  },
  sources: {
    adzunaAppId: process.env.ADZUNA_APP_ID ?? '',
    adzunaAppKey: process.env.ADZUNA_APP_KEY ?? '',
    joobleApiKey: process.env.JOOBLE_API_KEY ?? '',
    careerjetAffid: process.env.CAREERJET_AFFID ?? '',
  },
  app: {
    apiPort: Number(process.env.API_PORT ?? 4000),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    crawlerContact: process.env.CRAWLER_CONTACT ?? 'https://github.com/zaibshamsi/beep-job-fetch',
    adminToken: process.env.ADMIN_TOKEN ?? '',
  },
} as const;
