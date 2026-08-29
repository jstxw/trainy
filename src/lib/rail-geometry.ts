import type { Coordinate, LegStop, Place } from "@/lib/domain";

const TRANSITOUS_PLAN_URL = "https://api.transitous.org/api/v1/plan";
const REQUEST_TIMEOUT_MS = 8000;
// A routed itinerary may start from a nearby platform or sibling station;
// anything further than this from the logged places is the wrong route.
const MAX_ENDPOINT_DRIFT_KM = 5;

type TransitousStop = {
  name?: string;
  stopId?: string;
  parentId?: string;
  lat?: number;
  lon?: number;
  tz?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
};

type TransitousLeg = {
  mode?: string;
  from?: TransitousStop;
  to?: TransitousStop;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  intermediateStops?: TransitousStop[];
  legGeometry?: { points?: string; precision?: number };
};

type TransitousPlan = {
  itineraries?: Array<{ transfers?: number; legs?: TransitousLeg[] }>;
};

export type RailRoute = {
  geometry: Coordinate[];
  distanceKm: number;
  stops: LegStop[];
};

export function decodePolyline(points: string, precision = 7): Coordinate[] {
  const factor = 10 ** precision;
  const coordinates: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < points.length) {
    for (const axis of ["latitude", "longitude"] as const) {
      let result = 0;
      let shift = 0;
      let byte = 0x20;
      while (byte >= 0x20) {
        byte = points.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      }
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "latitude") latitude += delta;
      else longitude += delta;
    }
    coordinates.push([longitude / factor, latitude / factor]);
  }

  return coordinates;
}

export function pathDistanceKm(path: Coordinate[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += haversineKm(path[index - 1], path[index]);
  }
  return Math.round(total);
}

// Calling points come from the routed itinerary: pass-through stops of each rail
// leg, plus the transfer station between legs. Times are the scheduled local
// times of that itinerary — today's timetable, not the logged travel date.
export function routeStops(
  origin: Place,
  destination: Place,
  railLegs: TransitousLeg[],
): LegStop[] {
  const sharedCountry = origin.country === destination.country ? origin.country : "";
  const firstLeg = railLegs[0];
  const lastLeg = railLegs[railLegs.length - 1];
  const stops: LegStop[] = [{
    place: origin,
    sequence: 1,
    boarded: true,
    departure: localTime(firstLeg?.scheduledStartTime, firstLeg?.from?.tz),
  }];

  const addStop = (raw: TransitousStop | undefined) => {
    const place = stopPlace(raw, sharedCountry);
    if (!place) return;
    stops.push({
      place,
      sequence: stops.length + 1,
      boarded: false,
      arrival: localTime(raw?.scheduledArrival, raw?.tz),
      departure: localTime(raw?.scheduledDeparture, raw?.tz),
    });
  };

  railLegs.forEach((leg, index) => {
    for (const raw of leg.intermediateStops ?? []) addStop(raw);
    if (index < railLegs.length - 1) addStop(leg.to);
  });

  stops.push({
    place: destination,
    sequence: stops.length + 1,
    boarded: true,
    arrival: localTime(lastLeg?.scheduledEndTime, lastLeg?.to?.tz),
  });
  return stops;
}

function localTime(iso?: string, timeZone?: string): string | undefined {
  if (!iso || Number.isNaN(Date.parse(iso))) return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  } catch {
    return undefined;
  }
}

function stopPlace(raw: TransitousStop | undefined, country: string): Place | null {
  if (
    !raw ||
    typeof raw.name !== "string" ||
    raw.name.length === 0 ||
    !Number.isFinite(raw.lat) ||
    !Number.isFinite(raw.lon)
  ) {
    return null;
  }

  return {
    id: raw.parentId ?? raw.stopId ?? `stop:${raw.lon},${raw.lat}`,
    kind: "station",
    name: raw.name,
    city: raw.name.split(",")[0].trim(),
    country,
    code: "",
    coordinates: [raw.lon as number, raw.lat as number],
  };
}

export async function fetchRailGeometry(
  origin: Place,
  destination: Place,
): Promise<RailRoute | null> {
  try {
    const url = new URL(TRANSITOUS_PLAN_URL);
    url.searchParams.set("fromPlace", `${origin.coordinates[1]},${origin.coordinates[0]}`);
    url.searchParams.set("toPlace", `${destination.coordinates[1]},${destination.coordinates[0]}`);
    url.searchParams.set("transitModes", "RAIL");

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "trainy travel journal" },
    });
    if (!response.ok) return null;

    const plan = (await response.json()) as TransitousPlan;
    const itinerary = [...(plan.itineraries ?? [])]
      .sort((first, second) => (first.transfers ?? 0) - (second.transfers ?? 0))[0];
    const railLegs = (itinerary?.legs ?? []).filter((leg) => leg.mode !== "WALK");
    if (railLegs.length === 0) return null;

    const geometry: Coordinate[] = [];
    for (const leg of railLegs) {
      const points = leg.legGeometry?.points;
      if (!points) return null;
      geometry.push(...decodePolyline(points, leg.legGeometry?.precision ?? 7));
    }

    if (
      geometry.length < 2 ||
      haversineKm(geometry[0], origin.coordinates) > MAX_ENDPOINT_DRIFT_KM ||
      haversineKm(geometry[geometry.length - 1], destination.coordinates) > MAX_ENDPOINT_DRIFT_KM
    ) {
      return null;
    }

    return {
      geometry,
      distanceKm: pathDistanceKm(geometry),
      stops: routeStops(origin, destination, railLegs),
    };
  } catch {
    return null;
  }
}

function haversineKm(
  [originLongitude, originLatitude]: Coordinate,
  [destinationLongitude, destinationLatitude]: Coordinate,
) {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(originLatitude)) *
      Math.cos(toRadians(destinationLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
