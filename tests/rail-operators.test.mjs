import assert from "node:assert/strict";
import test from "node:test";
import { RAIL_OPERATORS, searchRailOperators } from "../src/lib/rail-operators.ts";

test("ships a substantial European operator list without duplicates", () => {
  assert.ok(RAIL_OPERATORS.length >= 80);
  const names = RAIL_OPERATORS.map((operator) => operator.name.toLocaleLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const operator of RAIL_OPERATORS) {
    assert.match(operator.country, /^[A-Z]{2}$/);
    assert.ok(operator.name.trim().length > 0);
  }
});

test("returns the full list for an empty query", () => {
  assert.equal(searchRailOperators("").length, RAIL_OPERATORS.length);
});

test("matches operators by name fragment, case-insensitively", () => {
  const names = searchRailOperators("bahn").map((operator) => operator.name);
  assert.ok(names.includes("Deutsche Bahn"));
  assert.ok(names.includes("WESTbahn"));
  assert.ok(!names.includes("SNCF"));
});

test("matches operators by country code", () => {
  const names = searchRailOperators("CH").map((operator) => operator.name);
  assert.ok(names.includes("SBB CFF FFS"));
});
