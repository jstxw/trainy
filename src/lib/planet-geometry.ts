import type { Coordinate } from "@/lib/domain";

// Pure math for the low-poly planet view. Everything here is framework-free so it
// can be unit tested without WebGL; the three.js scene in planet-globe.tsx
// consumes these vectors directly.

export type Vector = [x: number, y: number, z: number];
export type Biome = "snow" | "desert" | "forest" | "meadow";

const EUROPE: Coordinate = [10, 50.2];
const DEG = Math.PI / 180;

// Y is up. Longitude 0 faces +X and longitude increases towards -Z so the
// planet spins the same way as Earth when orbited from outside.
export function lonLatToVector([lon, lat]: Coordinate, radius = 1): Vector {
  const phi = lat * DEG;
  const theta = lon * DEG;
  const flat = Math.cos(phi) * radius;
  return [flat * Math.cos(theta), Math.sin(phi) * radius, -flat * Math.sin(theta)];
}

export function vectorToLonLat([x, y, z]: Vector): Coordinate {
  const radius = Math.hypot(x, y, z) || 1;
  const lat = Math.asin(Math.min(1, Math.max(-1, y / radius))) / DEG;
  const lon = Math.atan2(-z, x) / DEG;
  return [lon, lat];
}

function normalize([x, y, z]: Vector): Vector {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function slerp(a: Vector, b: Vector, t: number): Vector {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return a;
  const sinOmega = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

export function greatCirclePoints(
  from: Coordinate,
  to: Coordinate,
  segments: number,
  radius = 1,
): Vector[] {
  const a = normalize(lonLatToVector(from));
  const b = normalize(lonLatToVector(to));
  const points: Vector[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const [x, y, z] = slerp(a, b, i / segments);
    points.push([x * radius, y * radius, z * radius]);
  }
  return points;
}

// Flights arc above the surface. The lift grows with the central angle so a hop
// across a border stays low while an intercontinental flight climbs visibly.
export function liftedArcPoints(
  from: Coordinate,
  to: Coordinate,
  segments: number,
  radius = 1,
  maxLift = 0.2,
): Vector[] {
  const a = normalize(lonLatToVector(from));
  const b = normalize(lonLatToVector(to));
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(dot);
  const lift = maxLift * Math.min(1, angle / Math.PI + 0.15);
  const points: Vector[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const [x, y, z] = slerp(a, b, t);
    const scale = radius * (1 + lift * Math.sin(Math.PI * t));
    points.push([x * scale, y * scale, z * scale]);
  }
  return points;
}

export function biomeFor(latitude: number, noise: number): Biome {
  const absLat = Math.abs(latitude);
  if (absLat >= 64) return "snow";
  if (absLat >= 14 && absLat <= 36 && noise > 0.55) return "desert";
  return noise > 0.5 ? "forest" : "meadow";
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647 ^ 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// Cheap value noise in [0, 1]; frequency is chosen by the caller by scaling inputs.
export function valueNoise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);

  const c000 = hash3(x0, y0, z0);
  const c100 = hash3(x0 + 1, y0, z0);
  const c010 = hash3(x0, y0 + 1, z0);
  const c110 = hash3(x0 + 1, y0 + 1, z0);
  const c001 = hash3(x0, y0, z0 + 1);
  const c101 = hash3(x0 + 1, y0, z0 + 1);
  const c011 = hash3(x0, y0 + 1, z0 + 1);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1);

  const x00 = mix(c000, c100, tx);
  const x10 = mix(c010, c110, tx);
  const x01 = mix(c001, c101, tx);
  const x11 = mix(c011, c111, tx);
  const y0v = mix(x00, x10, ty);
  const y1v = mix(x01, x11, ty);
  return Math.min(1, Math.max(0, mix(y0v, y1v, tz)));
}

type EndpointLeg = {
  id: string;
  origin: { coordinates: Coordinate };
  destination: { coordinates: Coordinate };
};

// Direction the camera should face: the mean of the relevant endpoints, or Europe
// when the journal is empty. Returned as a unit vector.
export function viewCenterFor(legs: EndpointLeg[], selectedLegId: string | null): Vector {
  const selected = legs.find((leg) => leg.id === selectedLegId);
  const relevant = selected ? [selected] : legs;
  if (relevant.length === 0) return normalize(lonLatToVector(EUROPE));

  const sum: Vector = [0, 0, 0];
  for (const leg of relevant) {
    for (const coordinate of [leg.origin.coordinates, leg.destination.coordinates]) {
      const [x, y, z] = lonLatToVector(coordinate);
      sum[0] += x;
      sum[1] += y;
      sum[2] += z;
    }
  }
  if (Math.hypot(...sum) < 1e-6) return normalize(lonLatToVector(EUROPE));
  return normalize(sum);
}

// Camera distance: the whole planet stays in frame for the journal overview, and
// selecting a leg zooms in as far as that leg's own spread allows.
export function viewDistanceFor(
  legs: EndpointLeg[],
  selectedLegId: string | null,
  selectedMinDistance = 2.2,
  overviewMinDistance = 3.3,
  maxDistance = 3.5,
): number {
  const selected = legs.find((leg) => leg.id === selectedLegId);
  const relevant = selected ? [selected] : legs;
  if (relevant.length === 0) return 3.4;
  const minDistance = selected ? selectedMinDistance : overviewMinDistance;

  const [cx, cy, cz] = viewCenterFor(legs, selectedLegId);
  let spread = 0;
  for (const leg of relevant) {
    for (const coordinate of [leg.origin.coordinates, leg.destination.coordinates]) {
      const [x, y, z] = normalize(lonLatToVector(coordinate));
      const angle = Math.acos(Math.min(1, Math.max(-1, x * cx + y * cy + z * cz)));
      spread = Math.max(spread, angle);
    }
  }
  // Half a hemisphere of spread already needs the full pull-back.
  const t = Math.min(1, spread / (Math.PI / 2));
  return minDistance + (maxDistance - minDistance) * Math.sqrt(t);
}
