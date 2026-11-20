import { useEffect, type PointerEvent } from 'react';
import Lenis from 'lenis';
import { Hero } from '../components/landing/Hero.tsx';
import { Marquee } from '../components/landing/Marquee.tsx';
import { Pipeline } from '../components/landing/Pipeline.tsx';
import { SourcesSection } from '../components/landing/SourcesSection.tsx';
import { Tagging } from '../components/landing/Tagging.tsx';
import { Numbers } from '../components/landing/Numbers.tsx';
import { Cta, Footer } from '../components/landing/Footer.tsx';
import '../components/landing/landing.css';

/**
 * Cursor-following spotlight on `.spot` cards. One delegated listener, throttled to one write per frame,
 * so fast pointer moves never queue extra style recalculations.
 */
let spotFrame = 0;
let spotLast: { card: HTMLElement; x: number; y: number } | null = null;
function trackSpot(e: PointerEvent<HTMLDivElement>) {
  const card = (e.target as Element).closest<HTMLElement>('.spot');
  if (!card) return;
  const r = card.getBoundingClientRect();
  spotLast = { card, x: e.clientX - r.left, y: e.clientY - r.top };
  if (spotFrame) return;
  spotFrame = requestAnimationFrame(() => {
    spotFrame = 0;
    if (!spotLast) return;
    spotLast.card.style.setProperty('--mx', `${spotLast.x}px`);
    spotLast.card.style.setProperty('--my', `${spotLast.y}px`);
  });
}

/**
 * Inertial smooth scrolling for this page only. It makes wheel scrolling glide and settle instead of stepping,
 * and routes the nav's #section links through the same easing. Off under reduced motion; touch devices keep native scrolling.
 */
function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a || a.getAttribute('href') === '#') return;
      const target = document.querySelector(a.getAttribute('href')!);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -88, duration: 1.3, easing: (t) => 1 - Math.pow(1 - t, 4) });
    };
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('click', onClick);
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}

export function LandingPage() {
  useSmoothScroll();
  return (
    <div className="ld" onPointerMove={trackSpot}>
      <Hero />
      <Marquee />
      <Pipeline />
      <SourcesSection />
      <Tagging />
      <Numbers />
      <Cta />
      <Footer />
    </div>
  );
}
