export type PlaceSearchRow = [
  id: string,
  name: string,
  city: string,
  country: string,
  code: string,
  longitude: number,
  latitude: number,
  priority?: number,
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .trim();
}

export function rankPlaceRows(rows: PlaceSearchRow[], query: string, limit = 12) {
  const normalizedQuery = normalize(query);
  const queryParts = normalizedQuery.split(/\s+/);

  return rows
    .map((placeRow) => {
      const [, name, city, country, code, , , priority = 0] = placeRow;
      const normalizedName = normalize(name);
      const normalizedCity = normalize(city);
      const normalizedCode = normalize(code);
      const haystack = `${normalizedName} ${normalizedCity} ${country.toLowerCase()} ${normalizedCode}`;

      if (!queryParts.every((part) => haystack.includes(part))) return null;

      let relevance = 5;
      if (normalizedCode === normalizedQuery) relevance = 0;
      else if (normalizedName === normalizedQuery) relevance = 1;
      else if (normalizedName.startsWith(normalizedQuery)) relevance = 2;
      else if (normalizedCity === normalizedQuery) relevance = 3;
      else if (normalizedCity.startsWith(normalizedQuery)) relevance = 4;

      return { placeRow, priority, relevance };
    })
    .filter((match): match is {
      placeRow: PlaceSearchRow;
      priority: number;
      relevance: number;
    } => match !== null)
    .sort((first, second) =>
      // An exact station/airport code is an explicit selection and wins over
      // catalog prominence. For text searches, real/main stations and larger
      // scheduled airports rise above generic stops and smaller facilities.
      Number(first.relevance !== 0) - Number(second.relevance !== 0) ||
      second.priority - first.priority ||
      first.relevance - second.relevance ||
      first.placeRow[1].length - second.placeRow[1].length ||
      first.placeRow[1].localeCompare(second.placeRow[1], "en"),
    )
    .slice(0, limit)
    .map(({ placeRow }) => placeRow);
}
