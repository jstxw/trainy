export const RAIL_DISTANCE_ESTIMATE_FACTOR = 1.2;

export function estimatedRailDistance(directDistanceKm: number) {
  return Math.round(directDistanceKm * RAIL_DISTANCE_ESTIMATE_FACTOR);
}

// Rough block time: ~830 km/h cruise plus 45 minutes for taxi, climb, and descent.
export function estimatedFlightMinutes(directDistanceKm: number) {
  if (directDistanceKm <= 0) return 0;
  return Math.round((directDistanceKm / 830) * 60 + 45);
}
