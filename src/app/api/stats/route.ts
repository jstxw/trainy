import { calculateStats, getLegs } from "@/lib/travel-log";

export async function GET() {
  return Response.json(await getStats());
}

async function getStats() {
  return calculateStats(await getLegs());
}
