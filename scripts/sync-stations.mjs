import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://raw.githubusercontent.com/trainline-eu/stations/master/stations.csv";
const OUTPUT_PATH = path.join(process.cwd(), "data", "stations.json");

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
    } else if (character === ";" && !quoted) {
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
if (!response.ok) throw new Error(`Station download failed with ${response.status}`);

const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
const headers = parseRow(lines.shift());
const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const rows = lines.map((line) => parseRow(line));
const namesById = new Map(rows.map((row) => [row[column.id], row[column.name]]));

const stations = rows
  .filter((row) =>
    row[column.is_suggestable] === "t" &&
    row[column.is_airport] !== "t" &&
    row[column.same_as] === "" &&
    row[column.name] &&
    row[column.latitude] &&
    row[column.longitude],
  )
  .map((row) => {
    const parentName = namesById.get(row[column.parent_station_id]);
    return [
      row[column.id],
      row[column.name],
      parentName || row[column.name],
      row[column.country],
      row[column.uic] || row[column.id],
      Number(row[column.longitude]),
      Number(row[column.latitude]),
    ];
  })
  .sort((first, second) => first[1].localeCompare(second[1], "en"));

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(
  OUTPUT_PATH,
  JSON.stringify({
    source: "https://github.com/trainline-eu/stations",
    license: "ODbL-1.0",
    stations,
  }),
);

console.log(`Wrote ${stations.length.toLocaleString("en")} stations to ${OUTPUT_PATH}`);
