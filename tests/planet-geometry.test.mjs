import assert from "node:assert/strict";
import test from "node:test";
import {
  biomeFor,
  greatCirclePoints,
  liftedArcPoints,
  lonLatToVector,
  valueNoise3,
  vectorToLonLat,
  viewCenterFor,
} from "../src/lib/planet-geometry.ts";

const close = (actual, expected, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} !== ${expected}`);

test("lonLatToVector puts points on the sphere and round-trips", () => {
  const [x, y, z] = lonLatToVector([13.4, 52.5], 2);
  close(Math.hypot(x, y, z), 2);

  const [lon, lat] = vectorToLonLat([x, y, z]);
  close(lon, 13.4);
  close(lat, 52.5);
});

test("the poles and the prime meridian map to fixed axes", () => {
  const [, northY] = lonLatToVector([0, 90], 1);
  close(northY, 1);
  const [x] = lonLatToVector([0, 0], 1);
  close(x, 1);
});

test("greatCirclePoints stays on the surface and hits both ends", () => {
  const points = greatCirclePoints([0, 0], [90, 0], 8, 1);
  assert.equal(points.length, 9);
  for (const point of points) close(Math.hypot(...point), 1);
  assert.deepEqual(points[0].map((v) => +v.toFixed(6)), [1, 0, 0]);
  const [lon] = vectorToLonLat(points[4]);
  close(lon, 45);
});

test("greatCirclePoints handles coincident endpoints", () => {
  const points = greatCirclePoints([10, 50], [10, 50], 4, 1);
  assert.equal(points.length, 5);
  for (const point of points) close(Math.hypot(...point), 1);
});

test("liftedArcPoints rises above the surface in the middle only", () => {
  const points = liftedArcPoints([0, 0], [60, 0], 10, 1, 0.2);
  close(Math.hypot(...points[0]), 1);
  close(Math.hypot(...points[10]), 1);
  const middle = Math.hypot(...points[5]);
  assert.ok(middle > 1.05 && middle <= 1.2, `middle radius ${middle}`);
});

test("liftedArcPoints scales the lift with the distance travelled", () => {
  const short = liftedArcPoints([0, 0], [5, 0], 10, 1, 0.2);
  const long = liftedArcPoints([0, 0], [120, 0], 10, 1, 0.2);
  assert.ok(Math.hypot(...short[5]) < Math.hypot(...long[5]));
});

test("biomeFor uses latitude bands and noise", () => {
  assert.equal(biomeFor(75, 0.5), "snow");
  assert.equal(biomeFor(-80, 0.1), "snow");
  assert.equal(biomeFor(25, 0.9), "desert");
  assert.equal(biomeFor(25, 0.2), "meadow");
  assert.equal(biomeFor(48, 0.9), "forest");
  assert.equal(biomeFor(48, 0.2), "meadow");
});

test("valueNoise3 is deterministic and bounded", () => {
  const a = valueNoise3(0.3, 1.7, -2.2);
  const b = valueNoise3(0.3, 1.7, -2.2);
  assert.equal(a, b);
  for (let i = 0; i < 200; i += 1) {
    const value = valueNoise3(i * 0.37, i * 0.11, -i * 0.23);
    assert.ok(value >= 0 && value <= 1, `noise out of range ${value}`);
  }
  assert.notEqual(valueNoise3(0, 0, 0), valueNoise3(0.5, 0.5, 0.5));
});

test("viewCenterFor averages journey endpoints and falls back to Europe", () => {
  const legs = [
    { id: "a", origin: { coordinates: [0, 0] }, destination: { coordinates: [90, 0] } },
    { id: "b", origin: { coordinates: [0, 0] }, destination: { coordinates: [-90, 0] } },
  ];
  const all = viewCenterFor(legs, null);
  const [lon, lat] = vectorToLonLat(all);
  close(lon, 0);
  close(lat, 0);

  const selected = viewCenterFor(legs, "a");
  close(vectorToLonLat(selected)[0], 45);

  const fallback = viewCenterFor([], null);
  close(vectorToLonLat(fallback)[0], 10, 1e-3);
  close(vectorToLonLat(fallback)[1], 50.2, 1e-3);
});

test("viewDistanceFor pulls in for tight journals and backs off for spread ones", async () => {
  const { viewDistanceFor } = await import("../src/lib/planet-geometry.ts");
  const tight = [
    { id: "a", origin: { coordinates: [13.4, 52.5] }, destination: { coordinates: [16.4, 48.2] } },
  ];
  const wide = [
    { id: "a", origin: { coordinates: [13.4, 52.5] }, destination: { coordinates: [-74, 40.7] } },
    { id: "b", origin: { coordinates: [139.7, 35.7] }, destination: { coordinates: [151.2, -33.9] } },
  ];
  const near = viewDistanceFor(tight, null);
  const far = viewDistanceFor(wide, null);
  assert.ok(near < far, `${near} should be less than ${far}`);
  assert.ok(near >= 3.2 && near <= 3.5, `near ${near}`);
  assert.ok(far >= 3.2 && far <= 3.5, `far ${far}`);
  assert.ok(viewDistanceFor([], null) >= 3);
  assert.ok(viewDistanceFor(wide, "a") < far);
  assert.ok(viewDistanceFor(tight, "a") < 2.5, "a short selected leg zooms in");
});
