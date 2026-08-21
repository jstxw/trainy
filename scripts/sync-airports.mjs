import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const OUTPUT_PATH = path.join(process.cwd(), "data", "airports.json");

function parseRow(line) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Airport download failed with ${response.status}`);

const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
const headers = parseRow(lines.shift());
const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const includedTypes = new Set(["large_airport", "medium_airport", "small_airport"]);
const typePriority = new Map([
  ["large_airport", 200],
  ["medium_airport", 100],
  ["small_airport", 0],
]);

const airports = lines
  .map((line) => parseRow(line))
  .filter((row) =>
    includedTypes.has(row[column.type]) &&
    row[column.scheduled_service] === "yes" &&
    row[column.name] &&
    row[column.latitude_deg] &&
    row[column.longitude_deg],
  )
  .map((row) => {
    const priority = (typePriority.get(row[column.type]) ?? 0) +
      (row[column.iata_code] ? 50 : 0);
    return [
      row[column.id],
      row[column.name],
      row[column.municipality] || row[column.name],
      row[column.iso_country],
      row[column.iata_code] || row[column.icao_code] || row[column.ident],
      Number(row[column.longitude_deg]),
      Number(row[column.latitude_deg]),
      priority,
    ];
  })
  .sort((first, second) => first[1].localeCompare(second[1], "en"));

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(
  OUTPUT_PATH,
  JSON.stringify({
    source: "https://ourairports.com/data/",
    license: "Public Domain",
    airports,
  }),
);

console.log(`Wrote ${airports.length.toLocaleString("en")} airports to ${OUTPUT_PATH}`);
