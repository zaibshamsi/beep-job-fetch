import { useLandingCities } from './data.ts';
import { fmtNum, marqueeItems } from './format.ts';

/** Real cities from /cities/summary, then Remote. The list is doubled so the -50% slide loops seamlessly. */
export function Marquee() {
  const q = useLandingCities();
  const items = q.data ? marqueeItems(q.data.cities, q.data.remote.count) : [];
  return (
    <div className="ld-mq" role="region" aria-label="Cities with fresher jobs">
      {q.isPending ? (
        <div className="ld-mq-sk" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="ld-sk" style={{ width: 130, height: 34 }} />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="ld-mqt">
          {[0, 1].map((copy) => (
            <div key={copy} style={{ display: 'flex', gap: 56 }} aria-hidden={copy === 1 ? 'true' : undefined}>
              {items.map((it) => (
                <div key={it.name}>
                  <b>{it.name}</b>
                  <span>{fmtNum(it.count)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
