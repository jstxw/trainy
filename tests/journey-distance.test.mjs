import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatedFlightMinutes,
  estimatedRailDistance,
  RAIL_DISTANCE_ESTIMATE_FACTOR,
} from "../src/lib/journey-distance.ts";

test("estimates flight block time from direct distance", () => {
  assert.equal(estimatedFlightMinutes(0), 0);
  assert.equal(estimatedFlightMinutes(830), 105);
  assert.equal(estimatedFlightMinutes(6461), 512);
});

test("keeps the rail estimate as a display-only 1.2x calculation", () => {
  assert.equal(RAIL_DISTANCE_ESTIMATE_FACTOR, 1.2);
  assert.equal(estimatedRailDistance(1240), 1488);
  assert.equal(estimatedRailDistance(0), 0);
});
