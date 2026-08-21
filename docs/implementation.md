# Rail Log implementation

The running application is the first vertical slice of the architecture in
`rail-log-architecture (1).md`.

## Boundaries

- `data/stations.json` is a generated, compact index of 52,241 suggestable
  European stations from the Trainline EU ODbL dataset. `GET /api/places/search`
  searches it without shipping the whole catalog to the browser.
- `data/airports.json` is the matching search index for 4,154 scheduled large,
  medium, and small airports worldwide, generated from the public-domain
  OurAirports dataset. There are no seeded journeys; the personal log starts
  empty.
- `src/lib/travel-log.ts` is the read boundary used by pages and route handlers.
  `src/lib/journey-repository.ts` switches between an empty server repository
  (with the browser journal as the source of truth) and Supabase based on server
  environment variables, without changing the UI contracts.
- `src/app/api` implements the documented lookup, confirmation, manual fallback,
  log, GeoJSON map, and statistics HTTP shapes.
- `db/migrations/001_initial.sql` is the Postgres/PostGIS schema for the trip-index
  seam and personal log.
- `src/components/journey-map.tsx` uses MapLibre GL JS for the WebGL basemap,
  rail lines, and place markers. Flights use deck.gl `ArcLayer` great-circle
  paths in a separate overlay, with popups, auto-fit, and resize handling.
- `scripts/sync-maplibre-worker.mjs` self-hosts MapLibre's module worker and
  shared module so GeoJSON rail layers also work in the production Next bundle.
- Without Supabase configuration, confirmed manual journeys are stored under
  `rail-log:journeys:v1` in the browser's local storage. With Supabase enabled,
  the database is authoritative and the same browser entry remains a backup.

## Next production step

For a private deployment, add access control before configuring the server-side
Supabase service role, then verify the first-load localStorage migration against
a non-production project. The next data milestone is an offline DuckDB transform
of the archived Swiss GTFS snapshot into rail trips, stops, and `shapes.txt`
geometry. It stays outside the web process, as described in the architecture
document.

Refresh both place indexes with `npm run sync:places`.
