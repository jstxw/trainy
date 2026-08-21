import assert from "node:assert/strict";
import test from "node:test";
import {
  createJournalBackup,
  isJourneyLeg,
  mergeJourneys,
  parseJournalBackup,
} from "../src/lib/journal-backup.ts";

function journey(id = "journey-1") {
  const origin = {
    id: "station-a",
    kind: "station",
    name: "Amsterdam Centraal",
    city: "Amsterdam",
    country: "NL",
    code: "8400058",
    coordinates: [4.9003, 52.3789],
  };
  const destination = {
    id: "station-b",
    kind: "station",
    name: "Berlin Hbf",
    city: "Berlin",
    country: "DE",
    code: "8011160",
    coordinates: [13.3694, 52.5251],
  };

  return {
    id,
    mode: "rail",
    number: "IC 147",
    travelDate: "2026-08-21",
    operator: "NS International",
    origin,
    destination,
    distanceKm: 656,
    geometry: [origin.coordinates, destination.coordinates],
    source: "manual",
    createdAt: "2026-08-21T10:00:00.000Z",
    stops: [
      { place: origin, sequence: 1, boarded: true },
      { place: destination, sequence: 2, boarded: true },
    ],
  };
}

test("creates and parses a versioned journal backup", () => {
  const backup = createJournalBackup([journey()]);
  const parsed = parseJournalBackup(JSON.stringify(backup));

  assert.equal(parsed.version, 1);
  assert.equal(parsed.journeys.length, 1);
  assert.equal(parsed.journeys[0].number, "IC 147");
});

test("rejects backups with malformed journeys or unknown versions", () => {
  assert.throws(
    () => parseJournalBackup(JSON.stringify({ version: 2, exportedAt: "now", journeys: [] })),
    /version 1 backup/,
  );
  assert.equal(isJourneyLeg({ ...journey(), geometry: [["east", 52]] }), false);
});

test("merges by id without overwriting the current browser copy", () => {
  const current = { ...journey("shared"), operator: "Current operator" };
  const incoming = { ...journey("shared"), operator: "Backup operator" };
  const merged = mergeJourneys([current], [incoming, journey("new")]);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.id === "shared")?.operator, "Current operator");
});
