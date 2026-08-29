import assert from "node:assert/strict";
import test from "node:test";
import { AIRLINES, searchAirlines } from "../src/lib/airlines.ts";

test("ships a worldwide airline list without duplicates", () => {
  assert.ok(AIRLINES.length >= 100);
  const names = AIRLINES.map((airline) => airline.name.toLocaleLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const airline of AIRLINES) {
    assert.match(airline.country, /^[A-Z]{2}$/);
    assert.match(airline.code, /^[A-Z0-9]{2}$/);
    assert.ok(airline.name.trim().length > 0);
  }
});

test("returns the full list for an empty query", () => {
  assert.equal(searchAirlines("").length, AIRLINES.length);
});

test("matches airlines by name fragment or IATA code", () => {
  assert.ok(searchAirlines("luft").map((airline) => airline.name).includes("Lufthansa"));
  assert.ok(searchAirlines("kl").map((airline) => airline.name).includes("KLM"));
  assert.ok(!searchAirlines("luft").map((airline) => airline.name).includes("KLM"));
});
