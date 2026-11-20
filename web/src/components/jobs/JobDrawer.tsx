import { Briefcase, Building2, CalendarDays, Check, CircleCheck, Clock, ExternalLink, GraduationCap, IndianRupee, Link2, MapPin, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useJob } from '../../api/queries.ts';
import { JOB_TYPE_LABEL, WORK_MODE_LABEL } from '../../api/types.ts';
import type { JobDetail } from '../../api/types.ts';
import { colorOf, groupOf, hueOf } from '../../design/roleGroups.ts';
import { clipParagraphs, formatDateTime, formatExperience, formatRelative, formatStipend, STIPEND_NONE, toParagraphs } from './format.ts';
import { jobLocation } from './JobCard.tsx';
import { useDelayedFlag } from './hooks.ts';
import { needsAdzunaCredit, SOURCE_HOMEPAGES, sourceName } from './sources.ts';
import { asApiError, ErrorState } from './states.tsx';

interface Props {
  /** The job in the URL (?job=). null closes the drawer. */
  jobId: number | null;
  /** Phone: a full-screen sheet with a focus trap. Otherwise the drawer slides in over the right of the map card. */
  modal: boolean;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The job drawer: slides in from the right of the map card (transform .7s). It stays mounted so it can slide out;
 * while closed it is `inert`. Esc is handled by the page (job first, then family, then city).
 */
export function JobDrawer({ jobId, modal, onClose }: Props) {
  const open = jobId != null;
  // Keep showing the last job while the drawer slides out.
  const [shown, setShown] = useState<number | null>(jobId);
  useEffect(() => {
    if (jobId != null) setShown(jobId);
  }, [jobId]);

  const q = useJob(shown);
  const job = q.data && q.data.id === shown ? q.data : undefined;
  const ref = useRef<HTMLElement>(null);
    const titleId = useId();
  const showSkeleton = useDelayedFlag(open && q.isPending, 150);

  // Focus moves into the drawer when it opens (the dialog announces its title); the page returns it on close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) ref.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!modal || e.key !== 'Tab' || !ref.current) return;
    const list = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (list.length === 0) return;
    const firstEl = list[0]!;
    const lastEl = list[list.length - 1]!;
    const onStart = document.activeElement === firstEl || document.activeElement === ref.current;
    if (e.shiftKey && onStart) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  const color = colorOf(job?.roleCategory);
  const primary = job?.sources[0];
  const sourceLabel = primary && job ? sourceName(primary.source, job.company) : '';

  return (
    <aside
      ref={ref}
      className={`mp-drawer glass${open ? ' is-on' : ''}${modal ? ' mp-drawer--sheet' : ''}`}
      role="dialog"
      aria-modal={modal && open ? true : undefined}
      aria-labelledby={titleId}
      aria-hidden={!open || undefined}
      inert={!open}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="mp-drawer__head" style={{ '--c': color } as CSSProperties}>
        <button type="button" className="mp-x" aria-label="Close job details" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        {job ? (
          <>
            <span className="mg lg" style={{ '--h': hueOf(job.company) } as CSSProperties} aria-hidden="true">
              {job.company.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="eb">
              {groupOf(job.roleCategory)} · via {sourceLabel}
            </span>
            <h2 id={titleId} className="serif">
              {job.title}
            </h2>
            <p>{job.company}</p>
          </>
        ) : (
          <>
            <span className="mg lg mp-skel" aria-hidden="true" />
            <h2 id={titleId} className="visually-hidden">
              {q.isError ? 'Job details' : 'Loading job details'}
            </h2>
            <span className="mp-skel" style={{ width: '80%', height: 30, marginTop: 24 }} aria-hidden="true" />
            <span className="mp-skel" style={{ width: '45%', height: 14, marginTop: 10 }} aria-hidden="true" />
          </>
        )}
      </div>

      {job ? (
        <DrawerBody job={job} />
      ) : q.isError ? (
        <div className="mp-drawer__body">
          <ErrorState error={q.error} onRetry={asApiError(q.error)?.status === 404 ? undefined : () => q.refetch()} />
        </div>
      ) : (
        <div className="mp-drawer__body" aria-busy="true">
          {showSkeleton && <DrawerSkeleton />}
        </div>
      )}

      {job && primary && <DrawerActions job={job} applyUrl={primary.applyUrl} sourceLabel={sourceLabel} />}
    </aside>
  );
}

function DrawerBody({ job }: { job: JobDetail }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [job.id]);
  const paras = useMemo(() => toParagraphs(job.description || job.snippet || ''), [job.description, job.snippet]);
  const clip = useMemo(() => clipParagraphs(paras, 1200), [paras]);
  const shown = expanded ? paras : clip.paras;
  const stipend = formatStipend(job.stipendMinMonthlyInr, job.stipendMaxMonthlyInr);
  const experience = formatExperience(job.experienceMinYears, job.experienceMaxYears);
  const posted = job.postedAt ?? job.firstSeenAt;
  const location = job.cities.length ? job.cities.join(', ') : job.workMode === 'remote' ? 'Remote' : jobLocation(job);
  const ai = !job.needsReview && !!job.taggedBy && Object.values(job.taggedBy).some((by) => by === 'jev' || by === 'llm');
  const others = job.sources.slice(1);

  return (
    <div className="mp-drawer__body">
      {job.status === 'expired' && (
        <p className="mp-notice" role="note">
          <TriangleAlert size={16} aria-hidden="true" />
          This job is no longer listed at the source.
        </p>
      )}

      <ul className="mp-facts" aria-label="Job facts">
        <Fact icon={<MapPin size={16} />} label="Location">
          {location}
        </Fact>
        <Fact icon={<Briefcase size={16} />} label="Job type">
          {job.jobType ? JOB_TYPE_LABEL[job.jobType] : 'Type not stated'}
        </Fact>
        <Fact icon={<Building2 size={16} />} label="Work mode">
          {job.workMode ? WORK_MODE_LABEL[job.workMode] : 'Mode not stated'}
        </Fact>
        <Fact icon={<IndianRupee size={16} />} label="Stipend or salary" muted={!stipend}>
          {stipend ?? STIPEND_NONE}
        </Fact>
        <Fact icon={<GraduationCap size={16} />} label="Experience" muted={!experience}>
          {experience ?? 'Fresher'}
        </Fact>
        <Fact icon={<CalendarDays size={16} />} label="Posted">
          <time dateTime={posted} title={formatDateTime(posted)}>
            Posted {formatRelative(posted)}
          </time>
        </Fact>
      </ul>

      <p className={`mp-ai${ai ? ' is-ok' : ''}`}>
        {ai ? <CircleCheck size={16} aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />}
        {ai ? 'Tags confirmed by AI' : 'Tags not yet confirmed by AI'}
      </p>

      {shown.length > 0 && (
        <>
          <h3 className="mp-h4">About the role</h3>
          <div className="mp-desc">
            {shown.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {clip.clipped && (
            <button type="button" className="mp-textbtn" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}

      {job.skills.length > 0 && (
        <>
          <h3 className="mp-h4">Skills</h3>
          <ul className="mp-skills">
            {job.skills.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <h3 className="mp-h4">Also listed on</h3>
          <ul className="mp-also">
            {others.map((s) => (
              <li key={`${s.source}:${s.applyUrl}`}>
                <a href={s.applyUrl} target="_blank" rel="noopener noreferrer">
                  {sourceName(s.source, job.company)}
                  <ExternalLink size={13} aria-hidden="true" />
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Fact({ icon, label, muted, children }: { icon: ReactNode; label: string; muted?: boolean; children: ReactNode }) {
  return (
    <li className={muted ? 'is-muted' : undefined}>
      <span className="mp-facts__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="visually-hidden">{label}: </span>
      <span>{children}</span>
    </li>
  );
}

function DrawerActions({ job, applyUrl, sourceLabel }: { job: JobDetail; applyUrl: string; sourceLabel: string }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  useEffect(() => {
    setCopied(null);
  }, [job.id]);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const url = `${window.location.origin}/map?job=${job.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };
  const adzuna = job.sources.some((s) => needsAdzunaCredit(s.source));

  return (
    <div className="mp-drawer__foot">
      <a className="btn btn--primary" href={applyUrl} target="_blank" rel="noopener noreferrer">
        Apply on {sourceLabel}
        <ExternalLink size={16} aria-hidden="true" />
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
      <button type="button" className="btn btn--secondary" onClick={copy}>
        {copied === 'ok' ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
        {copied === 'ok' ? 'Copied' : 'Copy link'}
      </button>
      {adzuna && (
        <a className="mp-credit" href={SOURCE_HOMEPAGES.adzuna} target="_blank" rel="noopener noreferrer">
          Jobs by Adzuna
        </a>
      )}
      <span className="visually-hidden" role="status">
        {copied === 'ok' ? 'Link copied to the clipboard' : copied === 'fail' ? 'Could not copy the link. Copy it from the address bar.' : ''}
      </span>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="mp-drawer__skeleton" aria-hidden="true">
      <div className="mp-facts mp-facts--skel">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="mp-skel" style={{ height: 40, borderRadius: 12 }} />
        ))}
      </div>
      <span className="mp-skel" style={{ width: '40%', height: 12, marginTop: 24 }} />
      <span className="mp-skel" style={{ width: '95%' }} />
      <span className="mp-skel" style={{ width: '90%' }} />
      <span className="mp-skel" style={{ width: '70%' }} />
    </div>
  );
}
