import { memo } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { JOB_TYPE_LABEL } from '../../api/types.ts';
import type { JobListItem } from '../../api/types.ts';
import { hueOf } from '../../design/roleGroups.ts';
import { formatDateTime, formatRelative, formatStipend, STIPEND_NONE } from './format.ts';
import { sourceName } from './sources.ts';

export function jobLocation(job: Pick<JobListItem, 'cities' | 'workMode' | 'locationRaw'>): string {
  if (job.cities.length > 0) {
    const shown = job.cities.slice(0, 2).join(', ');
    return job.cities.length > 2 ? `${shown} +${job.cities.length - 2}` : shown;
  }
  if (job.workMode === 'remote') return 'Remote';
  return job.locationRaw?.trim() || 'Location not stated';
}

/** Cursor-following spotlight (DESIGN.md .spot): set --mx / --my on the card under the pointer. */
export function spotlight(e: PointerEvent<HTMLElement>) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.spot');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

interface Props {
  job: JobListItem;
  selected: boolean;
  /** Current query string; the card's link keeps it and sets job=<id>. */
  search: string;
  now: number;
  /** Position in the list, for the staggered entrance of the first cards. */
  index: number;
  onOpen: (id: number, el: HTMLElement) => void;
}

/** One job in the list, as in the mock: avatar tile, title, company, "city · type · pay", New badge, time, source. */
export const JobCard = memo(function JobCard({ job, selected, search, now, index, onOpen }: Props) {
  const params = new URLSearchParams(search);
  params.set('job', String(job.id));
  const stipend = formatStipend(job.stipendMinMonthlyInr, job.stipendMaxMonthlyInr);
  const when = job.postedAt ?? job.firstSeenAt;
  const primary = job.sources[0]?.source;

  return (
    <Link
      to={{ search: `?${params}` }}
      className={`mp-job spot${selected ? ' is-on' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      aria-current={selected ? 'true' : undefined}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => onOpen(job.id, e.currentTarget)}
    >
      <span className="mg" style={{ '--h': hueOf(job.company) } as CSSProperties} aria-hidden="true">
        {job.company.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="mp-job__body">
        <h3 className="mp-job__title">{job.title}</h3>
        <span className="mp-job__co">{job.company}</span>
        <span className="mp-job__mt">
          {jobLocation(job)}
          {job.jobType && <> · {JOB_TYPE_LABEL[job.jobType]}</>} · {stipend ?? STIPEND_NONE}
        </span>
        <span className="mp-job__foot">
          {job.isNew && (
            <em className="new" title="First seen in the last 24 hours">
              New
            </em>
          )}
          <time dateTime={when} title={formatDateTime(when)}>
            {formatRelative(when, now)}
          </time>
          {primary && <span className="mp-job__via">via {sourceName(primary, job.company)}</span>}
        </span>
      </span>
    </Link>
  );
});
