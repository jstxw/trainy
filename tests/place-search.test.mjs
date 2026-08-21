import assert from "node:assert/strict";
import test from "node:test";
import { rankPlaceRows } from "../src/lib/place-search.ts";

const row = (id, name, city, code, priority) =>
  [id, name, city, "DE", code, 13.4, 52.5, priority];

test("ranks real main stations above generic location records", () => {
  const generic = row("city", "Berlin", "Berlin", "city", 0);
  const main = row("hbf", "Berlin Hbf", "Berlin", "8011160", 150);
  const local = row("buch", "Berlin-Buch", "Berlin", "8003331", 100);

  assert.deepEqual(rankPlaceRows([generic, local, main], "Berlin"), [main, local, generic]);
});

test("keeps low-priority places searchable and honors exact codes", () => {
  const small = row("small", "Tiny Halt", "Tiny", "TNY", 0);
  const prominent = row("main", "Tny Central", "Tny", "999", 150);

  assert.deepEqual(rankPlaceRows([prominent, small], "TNY"), [small, prominent]);
  assert.deepEqual(rankPlaceRows([small], "Tiny Halt"), [small]);
});

test("ranks airport size and IATA metadata before fuzzy relevance", () => {
  const medium = row("medium", "Metro Airport", "Metro", "MTR", 150);
  const large = row("large", "Metro International", "Metro", "MTX", 250);

  assert.deepEqual(rankPlaceRows([medium, large], "Metro"), [large, medium]);
});
