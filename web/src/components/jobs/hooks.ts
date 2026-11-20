import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Live media query match. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Loading indicator timing (DESIGN.md section 4): show only after `delay` ms of loading, and once
 * shown keep it at least `minVisible` ms so it never flickers.
 */
export function useDelayedFlag(active: boolean, delay = 200, minVisible = 400): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active && !shown) {
      const t = window.setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delay);
      return () => window.clearTimeout(t);
    }
    if (!active && shown) {
      const left = minVisible - (Date.now() - shownAt.current);
      if (left <= 0) {
        setShown(false);
        return;
      }
      const t = window.setTimeout(() => setShown(false), left);
      return () => window.clearTimeout(t);
    }
  }, [active, shown, delay, minVisible]);
  return shown;
}

/** Re-render every `ms` so relative times ("2 hours ago") stay true. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
