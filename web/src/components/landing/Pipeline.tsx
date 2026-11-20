import { useEffect, useState } from 'react';
import { Download, Globe, Layers, ListChecks, MapPin, Sparkles, Split, type LucideIcon } from 'lucide-react';
import { useLandingStats } from './data.ts';
import { allowedSourceCount } from './format.ts';
import { useInView, useReducedMotion } from './hooks.ts';
import { SectionHead, useReveal } from './parts.tsx';

interface Node {
  icon: LucideIcon;
  name: string;
  sub: string;
}

/** The seven stages. The active node steps every 700 ms (a comet crosses the rail in 4.9 s); both stop under reduced motion. */
export function Pipeline() {
  const stats = useLandingStats();
  const reduced = useReducedMotion();
  const [boxRef, visible] = useInView<HTMLOListElement>(false, 0.3);
  const reveal = useReveal<HTMLDivElement>();
  const [active, setActive] = useState(-1);

  const allowed = stats.data ? allowedSourceCount(stats.data.sources) : null;
  const nodes: Node[] = [
    { icon: Globe, name: 'Sources', sub: allowed == null ? 'allowed only' : `${allowed} allowed` },
    { icon: Download, name: 'Fetch', sub: '06:00 IST' },
    { icon: Layers, name: 'Dedupe', sub: 'merge twins' },
    { icon: ListChecks, name: 'Rules', sub: 'free, instant' },
    { icon: Split, name: 'Jev', sub: 'role, type' },
    { icon: Sparkles, name: 'LLM', sub: 'only leftovers' },
    { icon: MapPin, name: 'Map', sub: 'by city' },
  ];

  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % nodes.length), 700);
    return () => window.clearInterval(id);
  }, [reduced, visible, nodes.length]);

  return (
    <section className="ld-sec" id="pipeline">
      <SectionHead
        eyebrow="01 · Pipeline"
        text="Each morning the worker reads every allowed source, keeps the posts meant for freshers and merges a job listed twice. Rules tag what they can; Jev and the LLM only see what’s left."
      >
        How a job <em className="serif g">reaches the map</em>
      </SectionHead>
      <div ref={reveal.ref} className={reveal.cls} style={reveal.style}>
        <ol ref={boxRef} className="ld-pipe" aria-label="Pipeline stages in order">
          <li className="ld-flow" aria-hidden="true" />
          {nodes.map((n, i) => (
            <li key={n.name} className={`ld-nd${i === active ? ' act' : ''}`}>
              <n.icon size={24} strokeWidth={1.75} aria-hidden="true" />
              <b>{n.name}</b>
              <span>{n.sub}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
