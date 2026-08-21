# Rail Log

A personal map and journal of train and flight journeys across Europe. The app
follows the boundaries in [`docs/rail-log-architecture (1).md`](docs/rail-log-architecture%20(1).md):
regenerable timetable data ends at the trip index, while confirmed personal
journeys are copied into a durable log.

## Run locally

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The included demo journal
supports the example lookup `ICE 573` on `2026-07-14` and manual entries. Demo
entries live in the page session until a Postgres repository is connected.

## API

- `GET /api/lookup?number=ICE+573&date=2026-07-14`
- `GET|POST /api/legs`
- `POST /api/legs/manual`
- `GET /api/map`
- `GET /api/stats`

## Production data

Run [`db/migrations/001_initial.sql`](db/migrations/001_initial.sql) in Postgres
with PostGIS enabled, then replace the demo functions in
`src/lib/travel-log.ts` with database queries. The GTFS fetcher and DuckDB
transform remain separate batch jobs; they should never run inside a request.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run build
```
