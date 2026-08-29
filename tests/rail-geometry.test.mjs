import assert from "node:assert/strict";
import test from "node:test";
import { decodePolyline, pathDistanceKm, routeStops } from "../src/lib/rail-geometry.ts";

test("decodes a precision-7 polyline into [longitude, latitude] pairs", () => {
  const decoded = decodePolyline("ozwyh^_b`_~Fo{ul@_xunA_upzA_yqwC", 7);

  assert.deepEqual(decoded, [
    [13.3694, 52.5251],
    [13.5, 52.6],
    [13.75, 52.75],
  ]);
});

test("returns an empty path for an empty polyline", () => {
  assert.deepEqual(decodePolyline("", 7), []);
});

const berlin = {
  id: "station-berlin",
  kind: "station",
  name: "Berlin Hbf",
  city: "Berlin",
  country: "DE",
  code: "BLS",
  coordinates: [13.3694, 52.5251],
};
const hamburg = {
  id: "station-hamburg",
  kind: "station",
  name: "Hamburg Hbf",
  city: "Hamburg",
  country: "DE",
  code: "AH",
  coordinates: [10.0069, 53.5528],
};

test("builds calling points from itinerary legs, marking only endpoints as boarded", () => {
  const stops = routeStops(berlin, hamburg, [
    {
      mode: "LONG_DISTANCE",
      to: { name: "Büchen", parentId: "de:büchen", lat: 53.4751, lon: 10.6236 },
      intermediateStops: [
        { name: "Wittenberge, Bahnhof", stopId: "de:witt:3", parentId: "de:witt", lat: 53.0045, lon: 11.7625 },
      ],
    },
    {
      mode: "REGIONAL_RAIL",
      to: { name: "Hamburg Hbf", parentId: "de:hh", lat: 53.5528, lon: 10.0069 },
      intermediateStops: [],
    },
  ]);

  assert.deepEqual(stops.map((stop) => [stop.place.name, stop.sequence, stop.boarded]), [
    ["Berlin Hbf", 1, true],
    ["Wittenberge, Bahnhof", 2, false],
    ["Büchen", 3, false],
    ["Hamburg Hbf", 4, true],
  ]);
  assert.deepEqual(stops[1].place, {
    id: "de:witt",
    kind: "station",
    name: "Wittenberge, Bahnhof",
    city: "Wittenberge",
    country: "DE",
    code: "",
    coordinates: [11.7625, 53.0045],
  });
});

test("stores scheduled local times on calling points", () => {
  const stops = routeStops(berlin, hamburg, [
    {
      mode: "LONG_DISTANCE",
      from: { name: "Berlin Hbf", tz: "Europe/Berlin" },
      to: { name: "Hamburg Hbf", parentId: "de:hh", lat: 53.5528, lon: 10.0069, tz: "Europe/Berlin" },
      scheduledStartTime: "2026-08-29T10:18:00Z",
      scheduledEndTime: "2026-08-29T12:39:00Z",
      intermediateStops: [
        {
          name: "Wittenberge, Bahnhof",
          parentId: "de:witt",
          lat: 53.0045,
          lon: 11.7625,
          tz: "Europe/Berlin",
          scheduledArrival: "2026-08-29T11:26:00Z",
          scheduledDeparture: "2026-08-29T11:27:00Z",
        },
      ],
    },
  ]);

  assert.equal(stops[0].departure, "12:18");
  assert.equal(stops[1].arrival, "13:26");
  assert.equal(stops[1].departure, "13:27");
  assert.equal(stops[2].arrival, "14:39");
});

test("skips malformed stops and leaves the country blank on cross-border routes", () => {
  const paris = { ...hamburg, id: "station-paris", name: "Paris Est", city: "Paris", country: "FR" };
  const stops = routeStops(berlin, paris, [
    {
      mode: "LONG_DISTANCE",
      to: { name: "Paris Est", lat: 48.8768, lon: 2.3592 },
      intermediateStops: [
        { name: "No coordinates here" },
        { name: "Karlsruhe Hbf", parentId: "de:ka", lat: 48.9938, lon: 8.4018 },
      ],
    },
  ]);

  assert.deepEqual(stops.map((stop) => stop.place.name), ["Berlin Hbf", "Karlsruhe Hbf", "Paris Est"]);
  assert.equal(stops[1].place.country, "");
});

test("measures distance along the full path, not point to point", () => {
  const path = [
    [13.3694, 52.5251],
    [13.5, 52.6],
    [13.75, 52.75],
  ];

  assert.equal(pathDistanceKm(path), 36);
  assert.equal(pathDistanceKm([]), 0);
  assert.equal(pathDistanceKm([[13.3694, 52.5251]]), 0);
});
