import type { SourceAdapter } from '@beep/shared';
import { adzuna } from './aggregators/adzuna.ts';
import { careerjet } from './aggregators/careerjet.ts';
import { jobicy } from './aggregators/jobicy.ts';
import { jooble } from './aggregators/jooble.ts';
import { remoteok } from './aggregators/remoteok.ts';
import { remotive } from './aggregators/remotive.ts';
import { weworkremotely } from './aggregators/weworkremotely.ts';

/**
 * Keyed APIs (adzuna, jooble, careerjet) report unavailableReason() until their key is in .env.
 * Sources we reviewed and did not build are listed in aggregators/skipped.ts.
 */
const adapters: SourceAdapter[] = [adzuna, jooble, careerjet, remotive, remoteok, weworkremotely, jobicy];
export default adapters;
export { skippedSources } from './aggregators/skipped.ts';
