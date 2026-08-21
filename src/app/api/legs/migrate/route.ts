import type { JourneyLeg } from "@/lib/domain";
import { isJourneyLeg } from "@/lib/journal-backup";
import {
  getPersistenceMode,
  importJourneys,
} from "@/lib/journey-repository";
import { getLegs } from "@/lib/travel-log";

type MigrationBody = {
  journeys?: JourneyLeg[];
  replaceExisting?: boolean;
  onlyIfEmpty?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as MigrationBody | null;
  if (
    !body ||
    !Array.isArray(body.journeys) ||
    body.journeys.length > 5000 ||
    !body.journeys.every(isJourneyLeg)
  ) {
    return Response.json(
      { error: "A valid journal of at most 5,000 journeys is required." },
      { status: 400 },
    );
  }

  if (getPersistenceMode() === "client") {
    return Response.json({ migrated: 0, legs: body.journeys, storage: "client" });
  }

  const migrated = await importJourneys(body.journeys, {
    replaceExisting: body.replaceExisting,
    onlyIfEmpty: body.onlyIfEmpty,
  });

  return Response.json({ migrated, legs: await getLegs(), storage: "database" });
}
