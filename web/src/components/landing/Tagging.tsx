import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sourceName } from '../jobs/sources.ts';
import { useDemoJob } from './data.ts';
import { taggingRows, TAG_BY_LABEL } from './format.ts';
import { useInView, useReducedMotion } from './hooks.ts';
import { ErrorNote, SectionHead, useReveal } from './parts.tsx';

const STEPS = [
  {
    title: '1. Rules read the plain facts',
    text: 'City names with their aliases, and patterns for stipend, experience and skills, fill every field the rules are sure of. They cost nothing.',
  },
  { title: '2. Jev picks the role and job type', text: 'Whatever the rules leave unsure, Jev settles: the role family and the kind of job.' },
  {
    title: '3. The LLM reads only what’s left',
    text: 'Only the fields still blank go to the LLM, so the costly step touches the fewest posts.',
  },
];

function DemoPost({ step, reduced }: { step: number; reduced: boolean }) {
  const demo = useDemoJob();
  const { job } = demo;
  if (demo.loading) {
    return (
      <div aria-hidden="true">
        <span className="ld-sk" style={{ height: 52, margin: 24 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="ld-sk ld-tr-sk" />
        ))}
      </div>
    );
  }
  if (demo.error) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorNote what="A sample post" onRetry={demo.refetch} />
      </div>
    );
  }
  if (demo.empty || !job) {
    return (
      <p className="mut" style={{ padding: 24 }}>
        No internship with a stipend and a city is on the map right now.
      </p>
    );
  }
  const via = job.sources[0] ? sourceName(job.sources[0].source, job.company) : null;
  const rows = taggingRows(job);
  return (
    <>
      <div className="ld-tch">
        <Link to={`/map?job=${job.id}`}>
          <b>{job.title}</b>
        </Link>
        <div className="mut">
          {job.company}
          {via ? ` · via ${via}` : ''}
        </div>
      </div>
      <ul className="ld-trs">
        {rows.map((row) => (
          <li key={row.key} className={`ld-tr${reduced || row.step <= step ? ' done' : ''}${row.step === step ? ' now' : ''}`}>
            <span className="k">{row.label}</span>
            <span className="v">
              <small>{row.raw ? `“${row.raw}”` : ''}</small>
              <b>{row.value}</b>
            </span>
            <em className={`ld-by ${row.by}`}>{TAG_BY_LABEL[row.by]}</em>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Tagging() {
  const reduced = useReducedMotion();
  const [wrapRef, visible] = useInView<HTMLDivElement>(false, 0.3);
  const steps = useReveal<HTMLDivElement>();
  const card = useReveal<HTMLDivElement>();
  const [step, setStep] = useState(0);
  const [tick, setTick] = useState(0); // bumps on every click so the progress bar restarts

  // Advance every 4 s while the block is on screen; reduced motion leaves the choice to the visitor.
  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), 4000);
    return () => window.clearTimeout(id);
  }, [step, tick, reduced, visible]);

  return (
    <section className="ld-sec" id="tagging">
      <div ref={wrapRef} className="ld-tagw" data-paused={!visible}>
        <div>
          <SectionHead eyebrow="03 · Tagging">
            Every job tagged by role, city <em className="serif g">and type</em>
          </SectionHead>
          <div ref={steps.ref} className={`ld-steps ${steps.cls}`} style={steps.style} role="group" aria-label="Tagging steps">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className={`ld-st${i === step ? ' on' : ''}`}
                aria-pressed={i === step}
                onClick={() => {
                  setStep(i);
                  setTick((t) => t + 1);
                }}
              >
                <b>{s.title}</b>
                <span className="d">{s.text}</span>
                {i === step && <span key={`${tick}-${step}`} className="ld-pb" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        <div ref={card.ref} className={`ld-tc ${card.cls}`} style={card.style}>
          <DemoPost step={step} reduced={reduced} />
        </div>
      </div>
    </section>
  );
}
