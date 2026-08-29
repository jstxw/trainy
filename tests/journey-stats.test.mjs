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
  assert.equal(stats.railDistanceKm, 300);
  assert.equal(stats.railStations, 6);
  assert.equal(stats.railOperators, 1);
});

test("calculates train duration from the first departure to last arrival", () => {
  const leg = journey("timed", "2026-06-01");
  leg.railDistanceKm = 132;
  leg.stops[0].departure = "08:15:00";
  leg.stops[1].arrival = "10:45:00";

  const stats = calculateJourneyStats([leg]);

  assert.equal(stats.railDistanceKm, 132);
  assert.equal(stats.railDurationMinutes, 150);
});

test("tracks generic operator, distance, and country stats across modes", () => {
  const train = journey("train", "2026-02-01");
  train.operator = "Deutsche Bahn";
  const flight = journey("flight", "2026-01-01", "air");
  flight.operator = "KLM";
  flight.distanceKm = 800;

  const stats = calculateJourneyStats([train, flight]);

  assert.equal(stats.operators, 2);
  assert.equal(stats.airDistanceKm, 800);
  assert.deepEqual(stats.visitedCountries, ["DE", "FR"]);
});

test("lists rail countries once each, ordered by first visit", () => {
  const french = journey("french", "2026-03-10");
  const german = journey("german", "2026-01-05");
  german.origin.country = "DE";
  german.destination.country = "DE";
  german.stops[0].place.country = "DE";
  german.stops[1].place.country = "DE";
  const flight = journey("flight", "2025-12-01", "air");

  const stats = calculateJourneyStats([french, german, flight]);

  assert.deepEqual(stats.railCountries, ["DE", "FR"]);
});

test("counts only boarded stops toward places and countries", () => {
  const leg = journey("with-calling-points", "2026-06-01");
  leg.stops = [
    ...leg.stops,
    {
      place: {
        id: "pass-through",
        kind: "station",
        name: "Pass Through",
        city: "Pass Through",
        country: "",
        code: "",
        coordinates: [10.5, 50.5],
      },
      sequence: 3,
      boarded: false,
    },
  ];

  const stats = calculateJourneyStats([leg]);

  assert.equal(stats.places, 2);
  assert.equal(stats.countries, 2);
});

test("returns empty time stats for an empty journal", () => {
  const stats = calculateJourneyStats([]);

  assert.equal(stats.firstTripDate, null);
  assert.equal(stats.lastTripDate, null);
  assert.equal(stats.busiestMonth, null);
});
