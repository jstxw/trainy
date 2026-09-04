import { test } from "node:test";
import assert from "node:assert/strict";
import { launchRedirectTarget } from "../src/lib/launch-redirect.ts";

test("signed-in visitors at the root go to the app", () => {
  assert.equal(launchRedirectTarget("/", true), "/app");
});

test("everyone else stays where they are", () => {
  assert.equal(launchRedirectTarget("/", false), null);
  assert.equal(launchRedirectTarget("/app", true), null);
  assert.equal(launchRedirectTarget("/login", true), null);
  assert.equal(launchRedirectTarget("/api/legs", true), null);
});
