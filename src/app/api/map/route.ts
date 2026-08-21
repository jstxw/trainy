import { getLegs, toFeatureCollection } from "@/lib/travel-log";

export async function GET() {
  return Response.json(toFeatureCollection(await getLegs()));
}
