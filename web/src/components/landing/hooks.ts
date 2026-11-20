import { useEffect, useRef, useState, type RefObject } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the visitor asked for reduced motion. Updates live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Observes an element. `once`: becomes true at first sight and stays true (reveals, counters, bars).
 * Otherwise it follows visibility (to pause timers when the block is off screen).
 */
export function useInView<T extends Element>(once = true, threshold = 0.15): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            if (once) io.disconnect();
          } else if (!once) setSeen(false);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);
  return [ref, seen];
}

/** Eased count from 0 to `target` once `active` is true; the final value at once under reduced motion. */
export function useCountUp(target: number | null | undefined, active: boolean, ms = 1600): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null || !active) return;
    if (reduced || target === 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const frame = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduced, ms]);
  return value;
}
