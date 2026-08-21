import type {
  JourneyLeg,
  MapFeatureCollection,
  TravelMode,
  TravelStats,
} from "@/lib/domain";
import { findJourneys } from "@/lib/journey-repository";
import { calculateJourneyStats } from "@/lib/journey-stats";

export async function getLegs(mode?: TravelMode): Promise<JourneyLeg[]> {
  return findJourneys(mode);
}

export async function lookupTrips(number: string, date: string) {
  void number;
  void date;
  return [];
}

export function calculateStats(legs: JourneyLeg[]): TravelStats {
  return calculateJourneyStats(legs);
}

export function toFeatureCollection(legs: JourneyLeg[]): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: legs.map((leg) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: leg.geometry,
      },
      properties: {
        id: leg.id,
        mode: leg.mode,
        number: leg.number,
        operator: leg.operator,
        travelDate: leg.travelDate,
        origin: leg.origin.city,
        destination: leg.destination.city,
        distanceKm: leg.distanceKm,
      },
    })),
  };
}
