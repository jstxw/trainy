# Rail Log implementation

The running application is the first vertical slice of the architecture in
`rail-log-architecture (1).md`.

## Boundaries

- `src/lib/sample-data.ts` stands in for both the regenerated trip index and the
  durable personal log. It keeps the application useful without credentials and
  is deliberately labelled as demo data in the interface.
- `src/lib/travel-log.ts` is the read boundary used by pages and route handlers.
  Replace its sample implementation with a Postgres repository without changing
  the UI contracts.
- `src/app/api` implements the documented lookup, confirmation, manual fallback,
  log, GeoJSON map, and statistics HTTP shapes.
- `db/migrations/001_initial.sql` is the Postgres/PostGIS schema for the trip-index
  seam and personal log.
- `src/components/journey-map.tsx` renders rail as MapLibre line layers and air as
  deck.gl great-circle arcs over OpenFreeMap's muted Positron style.

## Next production step

Connect the repository to Postgres, run the migration, and make both confirmation
endpoints transactional. The ingestion archive and DuckDB transform stay outside
the web process, as described in the architecture document.
