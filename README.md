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
after a reload; each can also be deleted, exported, and restored from a
versioned JSON backup. Rail endpoints use
type-ahead search over 52,241 European stations from Trainline EU. Flight
endpoints search 4,154 scheduled airports worldwide from OurAirports.

## Optional Supabase persistence

The app remains fully usable with no database. To persist the personal journal
in Supabase, create a Supabase project, copy `.env.example` to `.env.local`, and
set the server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables.
Never put the service-role key in a `NEXT_PUBLIC_` variable.

Run the schema and reference-data import through `psql` from the repository
root. Use the direct or session-pooler Postgres connection string from the
Supabase dashboard as `DATABASE_URL`:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_initial.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/import-places.sql
```

The import loads [`data/places.csv`](data/places.csv) and builds PostGIS points
with longitude first. On the first database-backed load, a non-empty browser
journal is migrated only if the remote journal is empty; the browser copy is
kept as a backup. All app database access stays on the server through the
service-role client, and RLS blocks direct anonymous table access.

## API

- `GET /api/lookup?number=ICE+573&date=2026-07-14` (returns no matches until a
  timetable index is connected)
- `GET|POST /api/legs`
- `DELETE /api/legs?id=manual-…`
- `POST /api/legs/manual`
- `POST /api/legs/migrate`
- `GET /api/map`
- `GET /api/stats`
- `GET /api/places/search?kind=station&q=Berlin+Hbf`
- `GET /api/places/search?kind=airport&q=FRA`

## Production data

Run [`db/migrations/001_initial.sql`](db/migrations/001_initial.sql) in Postgres
with PostGIS enabled, then load [`data/places.csv`](data/places.csv) with
[`db/import-places.sql`](db/import-places.sql). The GTFS fetcher and DuckDB
transform remain separate batch jobs; they should never run inside a request.

Refresh both local place indexes with `npm run sync:places`.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run build
```
