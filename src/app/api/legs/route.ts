import type { JourneyLeg, TravelMode } from "@/lib/domain";
import { sampleTripIndex } from "@/lib/sample-data";
import { getLegs } from "@/lib/travel-log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (mode && mode !== "rail" && mode !== "air") {
    return Response.json({ error: "Mode must be rail or air." }, { status: 400 });
  }

  const legs = await getLegs(mode as TravelMode | undefined);
  return Response.json({ legs, demo: true });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tripIndexId?: string;
  } | null;

  if (!body?.tripIndexId) {
    return Response.json({ error: "tripIndexId is required." }, { status: 400 });
  }

  const candidate = sampleTripIndex.find(
    (trip) => trip.tripIndexId === body.tripIndexId,
  );

  if (!candidate) {
    return Response.json({ error: "Trip candidate not found." }, { status: 404 });
  }

  const leg: JourneyLeg = {
    ...candidate,
    id: `demo-${candidate.tripIndexId}`,
    source: "lookup",
    createdAt: new Date().toISOString(),
  };

  return Response.json(
    {
      leg,
      demo: true,
      note: "Connect the Postgres repository to persist confirmed journeys.",
    },
    { status: 201 },
  );
}
