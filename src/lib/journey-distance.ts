export const RAIL_DISTANCE_ESTIMATE_FACTOR = 1.2;

export function estimatedRailDistance(directDistanceKm: number) {
  return Math.round(directDistanceKm * RAIL_DISTANCE_ESTIMATE_FACTOR);
}
