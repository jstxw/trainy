import type { Coordinate, JourneyLeg } from "@/lib/domain";

export type RailPathStyle = "straight" | "actual";

// Routed track when the leg carries geometry, otherwise the direct chord. Shared
// by the flat map and the planet view so both agree on what "Tracks" means.
export function railCoordinates(leg: JourneyLeg, pathStyle: RailPathStyle): Coordinate[] {
  if (pathStyle === "straight") {
    return [leg.origin.coordinates, leg.destination.coordinates];
  }

  const coordinates = (Array.isArray(leg.geometry) ? leg.geometry : []).filter(
    (coordinate): coordinate is Coordinate =>
      Array.isArray(coordinate) &&
      coordinate.length === 2 &&
      coordinate.every((value) => Number.isFinite(value)),
  );

  return coordinates.length >= 2
    ? coordinates
    : [leg.origin.coordinates, leg.destination.coordinates];
}
