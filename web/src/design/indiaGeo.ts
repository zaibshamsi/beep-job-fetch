/**
 * India outline for the SVG map views (landing stage, 2D map). Loads the project's boundary file
 * (public/geo/india-states.json, Government of India boundary) and projects it into the 650 x 620 viewBox used by the
 * design: `viewBox="-30 -20 650 620"`. Shared by the landing page and the 2D map so they agree to the pixel.
 */
import { useQuery } from '@tanstack/react-query';

/** The viewBox the design uses: the map is drawn in x 0..590, y 0..580 with breathing room around it. */
export const VIEWBOX = '-30 -20 650 620';
export const VIEWBOX_NUMBERS = [-30, -20, 650, 620] as const;

const W = 590;
const H = 580;

interface GeoFeature {
  properties: { name?: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}
interface GeoCollection {
  features: GeoFeature[];
}

// Equirectangular with cos(lat) correction, fitted to W x H. India's bounding box in degrees.
const LNG0 = 68.094;
const LNG1 = 97.395;
const LAT0 = 6.755;
const LAT1 = 37.077;
const KX = Math.cos(((LAT0 + LAT1) / 2) * (Math.PI / 180));
const SCALE = Math.min(W / ((LNG1 - LNG0) * KX), H / (LAT1 - LAT0));
const OFFX = (W - (LNG1 - LNG0) * KX * SCALE) / 2;
const OFFY = (H - (LAT1 - LAT0) * SCALE) / 2;

/** lat/lng to [x, y] in the viewBox space. */
export function project(lat: number, lng: number): [number, number] {
  return [OFFX + (lng - LNG0) * KX * SCALE, OFFY + (LAT1 - lat) * SCALE];
}

const ring = (r: number[][]) =>
  r
    .map(([lng, lat], i) => {
      const [x, y] = project(lat, lng);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('') + 'Z';

function featurePath(f: GeoFeature): string {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
  return polys.map((p) => p.map(ring).join('')).join('');
}

export interface IndiaShape {
  /** One path per state or union territory, for lines between states. */
  states: { name: string; d: string }[];
  /** All states joined in one path, for the filled landmass and the dotted texture. */
  all: string;
}

async function load(): Promise<IndiaShape> {
  const res = await fetch('/geo/india-states.json');
  if (!res.ok) throw new Error(`India boundary file failed to load (${res.status})`);
  const geo = (await res.json()) as GeoCollection;
  const states = geo.features.map((f) => ({ name: f.properties.name ?? '', d: featurePath(f) }));
  return { states, all: states.map((s) => s.d).join('') };
}

/** Cached for the session. `data` is undefined while loading. */
export function useIndiaShape() {
  return useQuery({ queryKey: ['indiaShape'], queryFn: load, staleTime: Infinity, gcTime: Infinity });
}
