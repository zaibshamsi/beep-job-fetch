import { useLandingStats } from './data.ts';
import { buildReadingList, fmtNum, SKIPPED_SITES } from './format.ts';
import { ErrorNote, SectionHead, useReveal } from './parts.tsx';

function ReadingCard({ delay }: { delay?: number }) {
  const stats = useLandingStats();
  const r = useReveal<HTMLDivElement>(delay);
  const rows = stats.data ? buildReadingList(stats.data.sources) : [];
  return (
    <div ref={r.ref} className={`card spot ${r.cls}`} style={r.style}>
      <div className="ld-ch">
        <span className="tag ok">Reading</span>
        <h3>Fresher job boards and feeds</h3>
      </div>
      {stats.isPending ? (
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ld-sk ld-row-sk" />
          ))}
        </div>
      ) : stats.isError ? (
        <ErrorNote what="The list of sources" onRetry={() => void stats.refetch()} />
      ) : rows.length === 0 ? (
        <p className="mut">No source has jobs on the map yet.</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {rows.map((row) => (
            <li key={row.key} className="ld-row">
              <b>{row.name}</b>
              <span className="n">{fmtNum(row.count)}</span>
              <small>{row.detail}</small>
              <div className="ld-bar" aria-hidden="true">
                <i style={{ width: `${r.seen ? row.pct : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SkippedCard() {
  const r = useReveal<HTMLDivElement>(0.1);
  return (
    <div ref={r.ref} className={`card spot ${r.cls}`} style={r.style}>
      <div className="ld-ch">
        <span className="tag no">Skipped</span>
        <h3>Sites that ban scraping</h3>
      </div>
      <ul style={{ listStyle: 'none' }}>
        {SKIPPED_SITES.map((s) => (
          <li key={s.name} className="ld-row sk">
            <b>{s.name}</b>
            <span className="n">Skipped</span>
            <small>{s.reason}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SourcesSection() {
  return (
    <section className="ld-sec" id="sources">
      <SectionHead
        eyebrow="02 · Sources"
        text="BeepJobFetch reads a site only when its terms and robots.txt allow it, and writes each decision down with the clause it rests on."
      >
        Sources we read, <em className="serif g">sites we skip</em>
      </SectionHead>
      <div className="ld-two">
        <ReadingCard />
        <SkippedCard />
      </div>
    </section>
  );
}
