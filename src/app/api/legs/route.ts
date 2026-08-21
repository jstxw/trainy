import type { TravelMode } from "@/lib/domain";
import { deleteJourney, getPersistenceMode } from "@/lib/journey-repository";
import { getLegs } from "@/lib/travel-log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (mode && mode !== "rail" && mode !== "air") {
    return Response.json({ error: "Mode must be rail or air." }, { status: 400 });
  }

  const legs = await getLegs(mode as TravelMode | undefined);
  return Response.json({ legs, storage: getPersistenceMode() });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Journey id is required." }, { status: 400 });

  await deleteJourney(id);
  return Response.json({ deleted: id, storage: getPersistenceMode() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tripIndexId?: string;
  } | null;

  if (!body?.tripIndexId) {
    return Response.json({ error: "tripIndexId is required." }, { status: 400 });
  }

  return Response.json(
    {
      error: "The timetable trip index is not connected yet. Add this journey manually.",
      tripIndexId: body.tripIndexId,
    },
    { status: 501 },
  );
}
