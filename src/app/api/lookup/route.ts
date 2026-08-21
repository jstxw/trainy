import { lookupTrips } from "@/lib/travel-log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get("number")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";

  if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "A train number and a date in YYYY-MM-DD format are required." },
      { status: 400 },
    );
  }

  const candidates = await lookupTrips(number, date);

  return Response.json({ candidates, demo: true });
}
