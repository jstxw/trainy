import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Place } from "@/lib/domain";

export const runtime = "nodejs";

type PlaceRow = [
  id: string,
  name: string,
  city: string,
  country: string,
  code: string,
  longitude: number,
  latitude: number,
];

type CatalogData = {
  source: string;
  license: string;
  stations?: PlaceRow[];
  airports?: PlaceRow[];
};

const catalogPromises: Partial<Record<Place["kind"], Promise<CatalogData>>> = {};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .trim();
}

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

  const normalizedQuery = normalize(query);
  const queryParts = normalizedQuery.split(/\s+/);
  const catalog = await loadCatalog(kind);
  const rows = kind === "station" ? catalog.stations ?? [] : catalog.airports ?? [];

  const places = rows
    .map((placeRow) => {
      const [, name, city, country, code] = placeRow;
      const normalizedName = normalize(name);
      const normalizedCity = normalize(city);
      const normalizedCode = normalize(code);
      const haystack = `${normalizedName} ${normalizedCity} ${country.toLowerCase()} ${normalizedCode}`;

      if (!queryParts.every((part) => haystack.includes(part))) return null;

      let score = 5;
      if (normalizedCode === normalizedQuery || normalizedName === normalizedQuery) score = 0;
      else if (normalizedName.startsWith(normalizedQuery)) score = 1;
      else if (normalizedCity === normalizedQuery) score = 2;
      else if (normalizedCity.startsWith(normalizedQuery)) score = 3;
      else if (normalizedName.includes(` ${normalizedQuery}`)) score = 4;

      return { placeRow, score };
    })
    .filter((match): match is { placeRow: PlaceRow; score: number } => match !== null)
    .sort((first, second) =>
      first.score - second.score ||
      first.placeRow[1].length - second.placeRow[1].length ||
      first.placeRow[1].localeCompare(second.placeRow[1], "en"),
    )
    .slice(0, 12)
    .map(({ placeRow }): Place => ({
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
