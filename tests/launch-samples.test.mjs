import { test } from "node:test";
import assert from "node:assert/strict";
import { LAUNCH_SAMPLE_LEGS, LAUNCH_STATS } from "../src/lib/launch-samples.ts";
import { isJourneyLeg } from "../src/lib/journal-backup.ts";

test("sample legs are valid journeys with unique ids", () => {
  assert.equal(LAUNCH_SAMPLE_LEGS.length, 8);
  assert.ok(LAUNCH_SAMPLE_LEGS.every(isJourneyLeg));
  assert.equal(new Set(LAUNCH_SAMPLE_LEGS.map((leg) => leg.id)).size, 8);
});

test("sample legs mix rail and air and stay inside Europe", () => {
  const modes = new Set(LAUNCH_SAMPLE_LEGS.map((leg) => leg.mode));
  assert.deepEqual([...modes].sort(), ["air", "rail"]);
  for (const leg of LAUNCH_SAMPLE_LEGS) {
    for (const [longitude, latitude] of leg.geometry) {
      assert.ok(longitude > -12 && longitude < 30, `${leg.id} longitude ${longitude}`);
      assert.ok(latitude > 35 && latitude < 62, `${leg.id} latitude ${latitude}`);
    }
  }
});

test("launch stats match the bundled catalogs", async () => {
  const { readFile } = await import("node:fs/promises");
  const stations = JSON.parse(await readFile(new URL("../data/stations.json", import.meta.url), "utf8")).stations;
  const airports = JSON.parse(await readFile(new URL("../data/airports.json", import.meta.url), "utf8")).airports;
  assert.equal(LAUNCH_STATS.stations, stations.length);
  assert.equal(LAUNCH_STATS.airports, airports.length);
  assert.equal(LAUNCH_STATS.countries, new Set(stations.map((row) => row[3])).size);
});
