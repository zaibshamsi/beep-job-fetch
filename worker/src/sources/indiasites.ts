import type { SourceAdapter } from '@beep/shared';
import { freshersvoice } from './indiasites/freshersvoice.ts';
import { unstop } from './indiasites/unstop.ts';

/**
 * India fresher / internship sites. Only sites whose robots.txt and terms permit our access are built;
 * every other candidate we reviewed is recorded with the reason in docs/SOURCE_REVIEW.md.
 */
const adapters: SourceAdapter[] = [unstop, freshersvoice];
export default adapters;
