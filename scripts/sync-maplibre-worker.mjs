import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = `${root}/node_modules/maplibre-gl/dist`;
const destination = `${root}/public/maplibre`;

await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(`${source}/maplibre-gl-worker.mjs`, `${destination}/maplibre-gl-worker.mjs`),
  copyFile(`${source}/maplibre-gl-shared.mjs`, `${destination}/maplibre-gl-shared.mjs`),
]);

console.log("Synced the MapLibre worker and its shared module.");
