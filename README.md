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

Open [http://localhost:3000](http://localhost:3000). The journal starts empty.
Journeys added through the form are saved in the current browser and restored
after a reload; each can also be deleted from the journal. Rail endpoints use
type-ahead search over 52,241 European stations from Trainline EU. Flight
endpoints search 3,283 scheduled medium and large airports worldwide from
OurAirports.

## API

- `GET /api/lookup?number=ICE+573&date=2026-07-14` (returns no matches until a
  timetable index is connected)
- `GET|POST /api/legs`
- `POST /api/legs/manual`
- `GET /api/map`
- `GET /api/stats`
- `GET /api/places/search?kind=station&q=Berlin+Hbf`
- `GET /api/places/search?kind=airport&q=FRA`

## Production data

Run [`db/migrations/001_initial.sql`](db/migrations/001_initial.sql) in Postgres
with PostGIS enabled, then replace the empty repository functions in
`src/lib/travel-log.ts` with database queries. The GTFS fetcher and DuckDB
transform remain separate batch jobs; they should never run inside a request.

Refresh both local place indexes with `npm run sync:places`.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run build
```
