# Rail Log implementation

The running application is the first vertical slice of the architecture in
`rail-log-architecture (1).md`.

## Boundaries

- `data/stations.json` is a generated, compact index of 52,241 suggestable
  European stations from the Trainline EU ODbL dataset. `GET /api/places/search`
  searches it without shipping the whole catalog to the browser.
- `data/airports.json` is the matching search index for 3,283 scheduled medium
  and large airports worldwide, generated from the public-domain OurAirports
  dataset. There are no seeded journeys; the personal log starts empty.
- `src/lib/travel-log.ts` is the read boundary used by pages and route handlers.
  Replace its sample implementation with a Postgres repository without changing
  the UI contracts.
- `src/app/api` implements the documented lookup, confirmation, manual fallback,
  log, GeoJSON map, and statistics HTTP shapes.
- `db/migrations/001_initial.sql` is the Postgres/PostGIS schema for the trip-index
  seam and personal log.
- `src/components/journey-map.tsx` uses MapLibre GL JS for the WebGL basemap,
  rail lines, and place markers. Flights use deck.gl `ArcLayer` great-circle
  paths in a separate overlay, with popups, auto-fit, and resize handling.
- `scripts/sync-maplibre-worker.mjs` self-hosts MapLibre's module worker and
  shared module so GeoJSON rail layers also work in the production Next bundle.
- Until Postgres is connected, confirmed manual journeys are stored under
  `rail-log:journeys:v1` in the browser's local storage.

## Next production step

Connect the repository to Postgres, run the migration, and make both confirmation
endpoints transactional. The ingestion archive and DuckDB transform stay outside
the web process, as described in the architecture document.

Refresh both place indexes with `npm run sync:places`.
