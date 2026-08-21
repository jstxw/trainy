import type {
  JourneyLeg,
  MapFeatureCollection,
  TravelMode,
  TravelStats,
} from "@/lib/domain";

export async function getLegs(mode?: TravelMode): Promise<JourneyLeg[]> {
  void mode;
  return [];
}

export async function lookupTrips(number: string, date: string) {
  void number;
  void date;
  return [];
}

export function calculateStats(legs: JourneyLeg[]): TravelStats {
  const countries = new Set<string>();
  const places = new Set<string>();

  for (const leg of legs) {
    for (const stop of leg.stops) {
      countries.add(stop.place.country);
      places.add(stop.place.id);
    }
  }

  return {
    journeys: legs.length,
    distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    countries: countries.size,
    places: places.size,
    railJourneys: legs.filter((leg) => leg.mode === "rail").length,
    airJourneys: legs.filter((leg) => leg.mode === "air").length,
  };
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
