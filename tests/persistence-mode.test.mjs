import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePersistenceMode } from "../src/lib/persistence-mode.ts";

test("database only when Supabase is configured and a user is signed in", () => {
  assert.equal(resolvePersistenceMode(true, true), "database");
  assert.equal(resolvePersistenceMode(true, false), "client");
  assert.equal(resolvePersistenceMode(false, true), "client");
  assert.equal(resolvePersistenceMode(false, false), "client");
});
