/**
 * Contract between the map (web/src/map/**) and the page that hosts it (pages/MapPage.tsx).
 * The map owns the WebGL scene; the page owns panels, the list and the job detail card.
 */
import type { CitySummary, JobListItem } from '../api/types.ts';

/** Screen position (px, relative to the viewport) a detail card should grow from. */
export interface ScreenOrigin {
  x: number;
  y: number;
}

export interface JobMapProps {
  /** City columns to draw (from GET /cities/summary with the current filters). */
  cities: CitySummary[];
  /** Remote-eligible posts are drawn as a separate "Remote" island off the west coast. */
  remoteCount: number;
  /** City in focus (?focus=). null = all-India bird's-eye view. */
  focusCity: string | null;
  /** Jobs to pin when a city (or Remote) is in focus. Ignored when focusCity is null. */
  focusJobs: JobListItem[];
  /** Selected job id (?job=), highlighted on the map when visible. */
  selectedJobId: number | null;
  /** Click on a city column (or the Remote island: city = 'Remote'). */
  onFocusCity: (city: string | null) => void;
  /** Click on a job pin. origin = where on screen the pin was, so the card can animate from there. */
  onSelectJob: (jobId: number, origin: ScreenOrigin) => void;
  /** Left inset in px covered by the side panel, so fly-to centres in the visible part of the map. */
  insetLeft?: number;
}
