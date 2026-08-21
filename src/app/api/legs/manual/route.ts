import type { JourneyLeg, Place, TravelMode } from "@/lib/domain";

type ManualLegBody = {
  mode?: TravelMode;
  number?: string;
  travelDate?: string;
  operator?: string;
  origin?: Place;
  destination?: Place;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ManualLegBody | null;

  if (
    !body ||
    (body.mode !== "rail" && body.mode !== "air") ||
    !body.number?.trim() ||
    !body.travelDate ||
    !isPlace(body.origin) ||
    !isPlace(body.destination)
  ) {
    return Response.json(
      { error: "Mode, number, date, origin and destination are required." },
      { status: 400 },
    );
  }

  const origin = body.origin;
  const destination = body.destination;

  if (origin.id === destination.id) {
    return Response.json({ error: "Choose two different known places." }, { status: 400 });
  }

  const leg: JourneyLeg = {
    id: `manual-${crypto.randomUUID()}`,
    mode: body.mode,
    number: body.number.trim().toUpperCase(),
    travelDate: body.travelDate,
    operator: body.operator?.trim() || "Unknown operator",
    origin,
    destination,
    distanceKm: distanceBetween(origin.coordinates, destination.coordinates),
    geometry: [origin.coordinates, destination.coordinates],
    source: "manual",
    createdAt: new Date().toISOString(),
    stops: [
      { place: origin, sequence: 1, boarded: true },
      { place: destination, sequence: 2, boarded: true },
    ],
  };

  return Response.json(
    {
      leg,
      storage: "client",
      note: "The browser stores this journey locally after confirmation.",
    },
    { status: 201 },
  );
}

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<Place>;
  return (
    typeof place.id === "string" &&
    typeof place.name === "string" &&
    typeof place.city === "string" &&
    typeof place.country === "string" &&
    (place.kind === "station" || place.kind === "airport") &&
    Array.isArray(place.coordinates) &&
    place.coordinates.length === 2 &&
    place.coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  );
}

function distanceBetween(
  [originLongitude, originLatitude]: [number, number],
  [destinationLongitude, destinationLatitude]: [number, number],
) {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const originLatitudeRadians = toRadians(originLatitude);
  const destinationLatitudeRadians = toRadians(destinationLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitudeRadians) *
      Math.cos(destinationLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}
