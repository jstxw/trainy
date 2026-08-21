import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Place } from "@/lib/domain";
import { rankPlaceRows, type PlaceSearchRow } from "@/lib/place-search";

export const runtime = "nodejs";

type CatalogData = {
  source: string;
  license: string;
  stations?: PlaceSearchRow[];
  airports?: PlaceSearchRow[];
};

const catalogPromises: Partial<Record<Place["kind"], Promise<CatalogData>>> = {};

function loadCatalog(kind: Place["kind"]) {
  catalogPromises[kind] ??= readFile(
    path.join(process.cwd(), "data", `${kind === "station" ? "stations" : "airports"}.json`),
    "utf8",
  ).then((contents) => JSON.parse(contents) as CatalogData);

  return catalogPromises[kind];
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const kind: Place["kind"] = searchParams.get("kind") === "airport" ? "airport" : "station";

  if (query.length < 2) return Response.json({ places: [] });

  const catalog = await loadCatalog(kind);
  const rows = kind === "station" ? catalog.stations ?? [] : catalog.airports ?? [];

  const places = rankPlaceRows(rows, query).map((placeRow): Place => ({
      id: `${kind === "station" ? "trainline" : "ourairports"}-${placeRow[0]}`,
      kind,
      name: placeRow[1],
      city: placeRow[2],
      country: placeRow[3],
      code: placeRow[4],
      coordinates: [placeRow[5], placeRow[6]],
    }));

  return Response.json(
    { places, source: catalog.source, license: catalog.license },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
