import type { JourneyLeg, TravelMode } from "@/lib/domain";
import { demoPlaces } from "@/lib/sample-data";

type ManualLegBody = {
  mode?: TravelMode;
  number?: string;
  travelDate?: string;
  operator?: string;
  originId?: string;
  destinationId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ManualLegBody | null;

  if (
    !body ||
    (body.mode !== "rail" && body.mode !== "air") ||
    !body.number?.trim() ||
    !body.travelDate ||
    !body.originId ||
    !body.destinationId
  ) {
    return Response.json(
      { error: "Mode, number, date, origin and destination are required." },
      { status: 400 },
    );
  }

  const origin = demoPlaces.find((place) => place.id === body.originId);
  const destination = demoPlaces.find((place) => place.id === body.destinationId);

  if (!origin || !destination || origin.id === destination.id) {
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
    distanceKm: 0,
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
      demo: true,
      note: "Distance is calculated by PostGIS when the database is connected.",
    },
    { status: 201 },
  );
}
