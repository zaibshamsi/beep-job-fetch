import { describe, expect, it } from 'vitest';
import { beaconScale, boxEquals, cityBox, clampBox, easeOutQuart, FULL, lerpBox, panBox, panelInset, pxToUnits, tweenAt, zoomBox } from './viewbox.ts';

describe('easeOutQuart', () => {
  it('starts at 0, ends at 1, is fastest at the start', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.1)).toBeGreaterThan(0.3);
    expect(easeOutQuart(2)).toBe(1);
    expect(easeOutQuart(-1)).toBe(0);
  });
});

describe('tweenAt', () => {
  const to: [number, number, number, number] = [100, 100, 150, 140];
  it('starts at the origin box and arrives exactly at the target', () => {
    expect(tweenAt(FULL, to, 0).box).toEqual(FULL);
    const end = tweenAt(FULL, to, 900);
    expect(end.done).toBe(true);
    expect(end.box).toEqual(to);
  });
  it('is most of the way there at half time', () => {
    const mid = tweenAt(FULL, to, 450);
    expect(mid.done).toBe(false);
    expect(mid.box[2]).toBeLessThan((FULL[2] + to[2]) / 2);
  });
  it('lerps all four numbers', () => {
    expect(lerpBox([0, 0, 10, 10], [10, 20, 20, 30], 0.5)).toEqual([5, 10, 15, 20]);
  });
});

describe('cityBox', () => {
  it('is the 150 x 140 window centred on the city without a size', () => {
    expect(cityBox(200, 300)).toEqual([125, 230, 150, 140]);
  });
  it('takes the container aspect, centred on the city', () => {
    const b = cityBox(200, 300, { w: 1000, h: 700 });
    expect(b[2] / b[3]).toBeCloseTo(1000 / 700);
    expect(b[0] + b[2] / 2).toBeCloseTo(200);
    expect(b[1] + b[3] / 2).toBeCloseTo(300);
    expect(b[2]).toBeGreaterThanOrEqual(150);
    expect(b[3]).toBeGreaterThanOrEqual(140 - 1e-9);
  });
  it('shifts the city right of a left inset', () => {
    const plain = cityBox(200, 300, { w: 600, h: 600 });
    const inset = cityBox(200, 300, { w: 600, h: 600 }, { left: 300, top: 0 });
    expect(inset[0]).toBeLessThan(plain[0]);
    // the city lands at the middle of the visible part: 300 + 150 px
    const scale = 600 / inset[2];
    expect((200 - inset[0]) * scale).toBeCloseTo(450);
  });
});

describe('panelInset', () => {
  it('covers nothing on a wide card, the left on a medium one, the top on a phone', () => {
    expect(panelInset(null)).toEqual({ left: 0, top: 0 });
    expect(panelInset({ w: 1000, h: 700 })).toEqual({ left: 0, top: 0 });
    expect(panelInset({ w: 700, h: 600 })).toEqual({ left: 330, top: 0 });
    expect(panelInset({ w: 358, h: 520 })).toEqual({ left: 0, top: 234 });
  });
  it('shifts the city down below a top inset', () => {
    const b = cityBox(200, 300, { w: 400, h: 600 }, { left: 0, top: 200 });
    const scale = 400 / b[2];
    expect((300 - b[1]) * scale).toBeCloseTo(400);
  });
});

describe('zoomBox', () => {
  it('zooms around the centre and keeps the aspect', () => {
    expect(zoomBox([0, 0, 400, 300], 0.5)).toEqual([100, 75, 200, 150]);
  });
  it('zooms around an anchor so it stays put', () => {
    expect(zoomBox([0, 0, 400, 300], 0.5, [100, 100])).toEqual([50, 50, 200, 150]);
  });
  it('stops at the minimum width and the full view', () => {
    expect(zoomBox([0, 0, 100, 100], 0.1)[2]).toBe(60);
    expect(zoomBox([0, 0, 600, 600], 3)[2]).toBe(FULL[2]);
  });
});

describe('beaconScale and panning', () => {
  it('is 1 at the full view and smaller zoomed in', () => {
    const size = { w: 1000, h: 800 };
    expect(beaconScale(FULL, size)).toBeCloseTo(1);
    expect(beaconScale([0, 0, 150, 140], size)).toBeLessThan(0.3);
    expect(beaconScale([0, 0, 325, 310], null)).toBeCloseTo(0.5);
  });
  it('keeps the centre inside the map', () => {
    const far = panBox(FULL, 5000, -5000);
    expect(far[0] + far[2] / 2).toBe(FULL[0] + FULL[2]);
    expect(far[1] + far[3] / 2).toBe(FULL[1]);
    expect(boxEquals(clampBox(FULL), FULL)).toBe(true);
  });
  it('maps a pixel back to design units', () => {
    expect(pxToUnits(FULL, { w: 650, h: 620 }, 0, 0)).toEqual([-30, -20]);
    const [x, y] = pxToUnits(FULL, { w: 1300, h: 620 }, 650, 310);
    expect(x).toBeCloseTo(295);
    expect(y).toBeCloseTo(290);
  });
});
