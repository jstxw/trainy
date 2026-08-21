import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatedRailDistance,
  RAIL_DISTANCE_ESTIMATE_FACTOR,
} from "../src/lib/journey-distance.ts";

test("keeps the rail estimate as a display-only 1.2x calculation", () => {
  assert.equal(RAIL_DISTANCE_ESTIMATE_FACTOR, 1.2);
  assert.equal(estimatedRailDistance(1240), 1488);
  assert.equal(estimatedRailDistance(0), 0);
});
