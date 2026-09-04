import type { JourneyLeg, Place, TravelMode } from "@/lib/domain";
import { getPersistenceMode, saveJourney } from "@/lib/journey-repository";
import { fetchRailGeometry } from "@/lib/rail-geometry";

type ManualLegBody = {
  id?: string;
  createdAt?: string;
  mode?: TravelMode;
  number?: string;
  travelDate?: string;
  operator?: string;
  origin?: Place;
  destination?: Place;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ManualLegBody | null;
  return persistManualLeg(body, false);
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as ManualLegBody | null;
  return persistManualLeg(body, true);
}

async function persistManualLeg(body: ManualLegBody | null, editing: boolean) {
  if (
    !body ||
    (editing && !body.id?.trim()) ||
    (body.mode !== "rail" && body.mode !== "air") ||
    !body.number?.trim() ||
    !isDate(body.travelDate) ||
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

  const railRoute = body.mode === "rail" ? await fetchRailGeometry(origin, destination) : null;

  const leg: JourneyLeg = {
    id: editing ? body.id!.trim() : `manual-${crypto.randomUUID()}`,
    mode: body.mode,
    number: body.number.trim().toUpperCase(),
    travelDate: body.travelDate,
    operator: body.operator?.trim() || "Unknown operator",
    origin,
    destination,
    distanceKm: distanceBetween(origin.coordinates, destination.coordinates),
    railDistanceKm: railRoute?.distanceKm,
    geometry: railRoute?.geometry ?? [origin.coordinates, destination.coordinates],
    source: "manual",
    createdAt: editing && isTimestamp(body.createdAt) ? body.createdAt : new Date().toISOString(),
    stops: railRoute?.stops ?? [
      { place: origin, sequence: 1, boarded: true },
      { place: destination, sequence: 2, boarded: true },
    ],
  };

  await saveJourney(leg);
  const storage = await getPersistenceMode();

  return Response.json(
    {
      leg,
      storage,
      note: storage === "database"
        ? "Saved to Supabase and retained as a browser backup."
        : "The browser stores this journey locally after confirmation.",
    },
    { status: editing ? 200 : 201 },
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<Place>;
  return (
    typeof place.id === "string" && place.id.length > 0 &&
    typeof place.name === "string" && place.name.length > 0 &&
    typeof place.city === "string" && place.city.length > 0 &&
    typeof place.country === "string" && /^[A-Z]{2}$/.test(place.country) &&
    (place.kind === "station" || place.kind === "airport") &&
    Array.isArray(place.coordinates) &&
    place.coordinates.length === 2 &&
    place.coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    Math.abs(place.coordinates[0]) <= 180 &&
    Math.abs(place.coordinates[1]) <= 90
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
