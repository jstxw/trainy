import assert from "node:assert/strict";
import test from "node:test";
import { calculateJourneyStats } from "../src/lib/journey-stats.ts";

function journey(id, travelDate, mode = "rail") {
  const origin = {
    id: `${id}-origin`,
    kind: mode === "rail" ? "station" : "airport",
    name: "Origin",
    city: "Origin",
    country: "DE",
    code: "ORG",
    coordinates: [10, 50],
  };
  const destination = {
    id: `${id}-destination`,
    kind: mode === "rail" ? "station" : "airport",
    name: "Destination",
    city: "Destination",
    country: "FR",
    code: "DST",
    coordinates: [11, 51],
  };

  return {
    id,
    mode,
    number: id,
    travelDate,
    operator: "Operator",
    origin,
    destination,
    distanceKm: 100,
    geometry: [origin.coordinates, destination.coordinates],
    source: "manual",
    createdAt: `${travelDate}T12:00:00.000Z`,
    stops: [
      { place: origin, sequence: 1, boarded: true },
      { place: destination, sequence: 2, boarded: true },
    ],
  };
}

test("calculates first, last, and busiest travel periods", () => {
  const stats = calculateJourneyStats([
    journey("late", "2026-08-21", "air"),
    journey("first", "2026-05-03"),
    journey("july-1", "2026-07-02"),
    journey("july-2", "2026-07-19"),
  ]);

  assert.equal(stats.firstTripDate, "2026-05-03");
  assert.equal(stats.lastTripDate, "2026-08-21");
  assert.deepEqual(stats.busiestMonth, { month: "2026-07", journeys: 2 });
  assert.equal(stats.railJourneys, 3);
  assert.equal(stats.airJourneys, 1);
  assert.equal(stats.distanceKm, 400);
});

test("returns empty time stats for an empty journal", () => {
  const stats = calculateJourneyStats([]);

  assert.equal(stats.firstTripDate, null);
  assert.equal(stats.lastTripDate, null);
  assert.equal(stats.busiestMonth, null);
});
