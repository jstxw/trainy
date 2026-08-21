# European travel log — architecture

A website that turns "ICE 573, 14 July" into a stop-by-stop journey record, and eventually into one map of everywhere you went.

---

## The shape of the system

There are two flows, and they only touch at one place.

**The ingestion flow** runs on a timer with no human involved. It downloads timetable data from Europe, keeps a copy, and reshapes it into something fast to query. It doesn't know or care that you exist.

**The query flow** runs when you type a train number. It looks up one trip in the reshaped data and copies the result into your personal log.

The trip index is the seam. Everything above it is regenerable reference data. Everything below it is yours and irreplaceable. Keeping that boundary clean is the single most important structural decision in the project.

```
  feed registry ──┐
  Mobility DB ────┼──> fetcher ──> raw archive ──> transform ──> trip index
  gtfs.de ────────┘    (nightly)    (S3/disk)      (DuckDB)     (Postgres)
                                                                     │
                                          "ICE 573, 14 Jul" ─────────┤
                                                                     v
                                                              personal log
                                                                     │
                                                                     v
                                                            API ──> website
```

---

## Layer by layer

### 1. Feed registry

**What it is:** a config file you write once. Not a service, not a database — a YAML or JSON list of the GTFS feeds you care about, each with a stable URL, a country, and a short id.

```yaml
feeds:
  - id: de-fv            # long-distance rail only, ~360KB
    country: DE
    url: <copy from gtfs.de/en/feeds/de_fv/>
  - id: ch-oev
    country: CH
    url: <copy from eu.data.public-transport.earth>
```

**Do not transcribe URLs from memory or from documentation, including this document.** Feed URLs rot and get restructured. Right-click the download link on the source page and copy the address. `eu.data.public-transport.earth` publishes both an original and a stable URL per feed, where the stable one 302-redirects to the original — use those so your config survives publishers moving things.

**Where the URLs come from:** `eu.data.public-transport.earth` is a curated table of stable links per country, and it exists because national access points are hard to find and frequently move. Cross-check against the Mobility Database catalog, and use country-specific converters like gtfs.de where the official feed is NeTEx-only.

**Watch the coverage window per feed.** Feeds differ wildly in how much time they describe. The free gtfs.de feeds cover only the next 7 days; their paid extended versions cover the whole timetable period, as do most official national feeds. This determines whether one download gives you the whole summer or whether you need a snapshot per travel week. Check before assuming — see the transform section.

**Start with rail-only feeds where they exist.** gtfs.de publishes German long-distance rail separately: ~360 KB, 4,900 trips, 1,300 stops, versus 239 MB and 667,000 stops for the full national feed. It sidesteps the entire bus-stop filtering problem and is small enough to open in a text editor.

**Why it's a file and not a table:** it changes maybe twice a year, and you want it in version control so you can see what changed when a feed breaks.

---

### 2. Fetcher

**What it does:** downloads each feed's zip, checks it isn't garbage, writes it to the archive under today's date, and records the outcome.

**Technology:** a Python script, ~100 lines. `httpx` for downloads. Run it from a systemd timer, a cron entry, or a scheduled GitHub Action (free, and it can write straight to object storage — no server needed at all for this layer).

**Validate before storing.** MobilityData publish an official GTFS validator (a Java jar). Run it and store the report next to the zip. Feeds break silently and regularly; you want to know it was already broken when you downloaded it, not discover it six months later while debugging a missing journey.

**Record every attempt** in a small `feed_fetches` table: feed id, timestamp, HTTP status, file hash, validator error count. When a feed goes dark you'll see a run of failures instead of a mystery.

---

### 3. Raw archive

**What it is:** the untouched zips, on disk or in object storage, keyed by feed and date.

```
archive/
  de-fv/2026-06-01.zip
  de-fv/2026-07-01.zip
  ch-oev/2026-06-01.zip
```

**Snapshot frequency depends on the feed's window.** European timetables change on a fixed calendar — the big annual change is mid-December, with a smaller one in June — so for full-period feeds, monthly is generous. For rolling-window feeds like the free gtfs.de ones, you need a snapshot within the window of any journey you want to resolve, which in practice means weekly or daily.

**Keep the raw zips, not just parsed rows.** If you later want platform numbers, fare classes, or operator branding, you reprocess from files you already have. The alternative is discovering that the feed rotated three months ago and the data is simply gone. Feeds are not archives; you are.

**Backfilling what already happened.** GTFS has no concept of history — a feed states what is scheduled during a stated window, not what ran. Two archives can recover past periods: the Mobility Database, which checks each feed daily at midnight UTC and adds a version whenever it detects a change; and Transitland, which keeps 100+ archived versions of feeds including the German long-distance and regional rail ones (`f-germany~long~distance~rail`, `f-germany~regional~rail`). Mobility Database launched February 2024, so per-feed history starts whenever that feed was added — check the feed's page before assuming your dates are recoverable.

**Technology:** local disk is fine to start. When you outgrow it, Cloudflare R2 is S3-compatible with no egress fees, which matters if you ever reprocess the whole archive from a machine outside the datacentre.

**Size expectation:** a national feed is 50–500 MB zipped; rail-only feeds are a fraction of that. Twenty feeds × twelve months is somewhere in the tens of gigabytes. Cheap either way.

---

### 4. Transform

This is where the shape of the data changes from "timetable" to "trips on dates."

**First, check what you actually have:**

```sql
SELECT min(start_date), max(end_date) FROM read_csv('de/calendar.txt');
```

That prints the feed's coverage window. Anything outside it cannot be resolved from this download, no matter what else you do.

**What it does, in order:**

1. Read the zip's `.txt` files (they're CSV despite the extension).
2. Filter to rail: GTFS `route_type` 2, plus the extended range 100–117 which covers high-speed, intercity, regional and so on. Note that `stops.txt` has no mode column — you reach it by joining `stops` → `stop_times` → `trips` → `routes`. This is why the filter lives here rather than being a simple column predicate.
3. **Expand the calendar.** `calendar.txt` stores service patterns — "runs Mon–Fri from 2026-06-15 to 2026-12-12." `calendar_dates.txt` stores exceptions — "except 3 October," "also 15 August." Expand both into one row per service id per concrete date.
4. Join `trips.txt` (which carries `trip_short_name`, your train number) to the expanded calendar, producing one row per train per date.
5. Join `stop_times.txt` for the ordered stop sequence with arrival and departure times.
6. Attach the `shapes.txt` polyline for route geometry.
7. Write the result to the trip index.

**Why step 3 is the whole trick.** Without expansion, answering "did ICE 573 run on 14 July?" means evaluating a rule at query time — parsing a date range, checking a weekday bitmask, applying exceptions. With expansion, it's an indexed lookup on a date column. You pay the cost once, in batch, instead of on every request.

**Scale to expect:** the full German feed has roughly 1.8 million trips and 667,000 stop points. After calendar expansion, `stop_times` across your feeds will be in the tens of millions of rows. This is why the tool choice matters.

**Watch out for recycled train numbers.** The same number can mean a different route in a different timetable period. Resolving a July journey against a February feed can produce a confident match to the wrong train — silently wrong data, worse than a miss. Always match on service date, never on number alone.

---

### 5. Trip index

**What it is:** the queryable result of the transform. One row per train per date, plus stops, plus geometry, plus a reconciled station table.

**It is disposable.** You can drop and rebuild it from the archive at any time. Treat it that way — it frees you to change the schema without fear.

**It holds the station reconciliation.** GTFS stop ids are feed-local, so the same Basel SBB appears with different ids in the Swiss and German feeds. The Trainline stations CSV carries UIC and per-operator id columns; use it to map feed-local ids onto one canonical station identity. Collapse platform-level stops to their `parent_station` first — some countries code every platform as a separate stop, which will inflate your station count wildly if you don't.

---

### 6. Personal log

**What it is:** your actual journeys. Tiny — a few hundred rows, ever.

**Store the resolved journey in full.** Not a foreign key into the trip index: the actual stops, times, geometry, and distance, copied at the moment you confirm the journey. This is deliberate denormalization and it is the right call. The trip index gets rebuilt; feeds disappear from the internet; your summer must survive both.

**Same tables for trains and flights.** A `places` table with a `kind` column (station, airport) and a `legs` table with a `mode` column (rail, air). Fork these and you'll write every downstream query twice forever.

---

### 7. API

Half a dozen endpoints:

- `GET /lookup?number=ICE+573&date=2026-07-14` — search the trip index, return candidates
- `POST /legs` — confirm a candidate, copy it into the log
- `POST /legs/manual` — the fallback for when lookup fails (it will, maybe 10–15% of the time)
- `GET /legs` — your log
- `GET /map` — all legs as a GeoJSON FeatureCollection
- `GET /stats` — counts, distance, countries, operators

**Technology:** FastAPI if the pipeline is Python, which keeps you in one language and lets the API and the transform share model code. Node/Hono is equally fine if you'd rather write the frontend and backend in TypeScript.

---

### 8. Frontend

A map, a stats panel, and a form with two fields.

The map is the deliverable — the "one graph" of everywhere you went. Journeys render as lines, stations as circles sized by visit count. Add a mode filter (rail / air / both) and a date scrubber and you have the whole product.

---

## The technologies

### Batch versus serving

Two databases sound like one too many until you notice they're doing opposite jobs under opposite constraints.

**Batch** runs offline with nobody waiting. It starts, chews through the archive for ten minutes, writes its output, exits. If it takes twelve minutes instead, nothing breaks. It touches every row of enormous tables but only a few columns at a time — counting, grouping, joining, expanding. Call these *column questions*: "how many distinct stations appear across all trips?"

**Serving** runs continuously because a request can arrive at any moment. It answers in milliseconds because someone is watching a spinner. It fetches a handful of specific records in full. Call these *row questions*: "what are the stops on trip 12345?"

The two profiles want opposite storage layouts. Column-oriented storage keeps each column contiguous on disk, so reading one column of forty million rows touches only that block — ideal for column questions, bad at reassembling a single row from four separate places. Row-oriented storage keeps each row whole, so fetching one record is a single seek — ideal for row questions, wasteful when you only wanted one field.

DuckDB is column-oriented. Postgres is row-oriented. That's the whole reason both are here, and the trip index is the handover point between them.

---

### DuckDB — the transform engine

**What it is:** an embedded analytical database. The comparison that actually helps: it's SQLite's shape with a data warehouse's engine.

*Embedded* means there is no server. It's a library — `pip install duckdb`, `import duckdb`, and you're querying. The database is one file, or purely in memory. Nothing to run, configure, secure, or keep alive.

*Analytical* means it's built for scanning and aggregating millions of rows, not fetching one row by id. Internally it's column-oriented: a table is stored as one contiguous block per column rather than row by row. When you `GROUP BY route_id` over forty million stop times, it reads only the `route_id` column and ignores the other fifteen. A row-oriented database has to read every row in full to get at one field.

**Why it's the right tool here specifically:**

It queries files directly, with no import step:

```sql
SELECT trip_id, stop_id, stop_sequence
FROM 'stop_times.txt'
WHERE trip_id = '12345';
```

That's a real query against a real GTFS file. No schema declaration, no `COPY`, no loading. It infers types from the CSV. It reads zips, Parquet, JSON, and files over HTTP or S3 the same way. Your whole transform is SQL over the archive.

It handles larger-than-memory workloads by spilling to disk, so a 500 MB feed expanding into tens of millions of rows works on a laptop.

Its execution is vectorized — it processes batches of ~2000 values at a time rather than row-by-row, which is roughly an order of magnitude faster for this kind of scan-and-aggregate work.

**What it is not:** a serving database. It's single-writer and embedded, with no concurrency story for a web app. It's a batch tool that runs, produces output, and exits. That's not a limitation you're working around — it's the correct division of labour.

*(Caveat worth knowing: for a personal site with read-only queries, you could serve directly from a DuckDB file and skip Postgres entirely. If you want the simplest possible v1, that's a legitimate shortcut.)*

---

### PostgreSQL + PostGIS — the serving database

**Postgres** is the ordinary relational database: row-oriented, heavily indexed, built for many concurrent connections doing small reads and writes. Exactly the opposite profile from DuckDB, which is exactly why you use both. DuckDB crunches, Postgres serves.

**PostGIS** is the extension that makes Postgres understand geography. Without it, a route polyline is just a text blob. With it, it's a first-class type you can compute on:

- `geometry` and `geography` column types — `geography` does its maths on the ellipsoid, which is what you want for real-world distance
- `ST_Length(route::geography)` — actual kilometres along your route, correct without fudge factors
- `ST_AsGeoJSON(route)` — hands geometry straight to the frontend in the format MapLibre consumes
- `ST_Intersects`, `ST_DWithin` — "which journeys pass within 5 km of here", backed by a GiST spatial index
- `ST_Collect` / `ST_Envelope` — the bounding box of your entire summer, for auto-zooming the map

**Getting one:** you already have a Supabase connector, and Supabase is hosted Postgres with PostGIS available as an extension. That's the shortest path — enable the extension and you're done. Self-hosting via the `postgis/postgis` Docker image works equally well.

**Why not just store lat and lon as two floats.** You can, and the database will happily keep them — it just won't understand them. It won't know the two numbers refer to one place, that two places are near each other, or that the earth is curved. Every geographic question becomes maths you write and maintain yourself.

That maths degrades badly. The haversine formula treats the earth as a sphere; it's an oblate spheroid, so you carry roughly half a percent of error. Point-to-line distance is genuinely unpleasant to derive. Coordinate system mismatches — WGS84 versus Web Mercator — are a classic source of results that are wrong without looking wrong. And none of it can be indexed, so "which of my 30,000 stations are near this one" means 30,000 calculations every single time you ask.

**Spatial indexes work differently from ordinary ones.** A normal B-tree index is a sorted copy of one column with pointers back to the rows, which is what turns a forty-million-row scan into about 25 comparisons. Coordinates break that, because two dimensions have no single useful sort order — sort by longitude and everything at that longitude is adjacent regardless of latitude.

So PostGIS uses an R-tree, exposed in Postgres as GiST. It wraps groups of geometries in bounding boxes, then wraps those boxes in larger boxes, recursively. A proximity query descends the tree and discards any box that doesn't overlap the search area, skipping most of the table without computing a single distance. Same payoff as an ordinary index, different structure, because the data has two dimensions instead of one.

**Indexes you'll actually want:**

```sql
create index on places using gist (geom);          -- proximity, bounding boxes
create index on places (lower(name));              -- autocomplete
-- the UNIQUE on trip_index is already the lookup index
```

Note the `lower(name)` one: an index on `name` will not help `WHERE lower(name) = 'milano centrale'`, because the index stores original values, not lowercased ones. Index the expression you actually query on.

Indexes cost disk space and slow every write, since each one has to be updated on insert. Index what you search by, not everything.

---

### GTFS — the data format

Not a technology so much as the thing everything else operates on. A GTFS feed is a zip of CSVs, served from a plain URL with no API and usually no authentication. The files that matter to you:

| File | What's in it | Why you care |
|---|---|---|
| `routes.txt` | route id, operator, `route_type` | Filtering to rail |
| `trips.txt` | trip id, `trip_short_name`, `service_id`, `shape_id` | `trip_short_name` is the train number — the key to your whole lookup |
| `stop_times.txt` | trip id, stop id, sequence, arrival, departure | The stop-by-stop journey. Much the largest file |
| `stops.txt` | stop id, name, lat/lon, `parent_station`, `location_type` | Coordinates, and the platform-vs-station hierarchy |
| `calendar.txt` | service patterns with weekday flags and date ranges | Which days a trip runs |
| `calendar_dates.txt` | per-date additions and removals | Holidays, engineering work |
| `shapes.txt` | ordered lat/lon points per shape id | Real route geometry for the map and for distance |
| `feed_info.txt` | feed publisher, version, validity dates | Sanity-checking coverage |

`shapes.txt` is optional in the spec and not every feed includes it. Where it's missing, fall back to connecting station coordinates and flag the leg as approximate.

---

### MapLibre GL JS — the map

An open-source library that renders vector tiles in the browser using WebGL. It's the community fork of Mapbox GL JS, created when Mapbox moved to a proprietary licence — same API, no account, no token, no per-view billing.

Two things go into a map:

**A basemap** — the roads, coastlines and labels underneath. OpenFreeMap serves these free with no API key and no request limits. Protomaps is the alternative if you'd rather self-host: the entire planet ships as a single `.pmtiles` file you can drop on any static host.

**Your data** — a GeoJSON source and a couple of layers. `ST_AsGeoJSON` output from PostGIS goes in directly:

```js
map.addSource('journeys', { type: 'geojson', data: '/api/map' });
map.addLayer({
  id: 'rail', type: 'line', source: 'journeys',
  filter: ['==', ['get', 'mode'], 'rail'],
  paint: { 'line-color': '#1D9E75', 'line-width': 2 }
});
```

Style rail and air differently and your mode filter is a one-line change to that `filter` expression.

**Pick a muted basemap.** Ask OpenFreeMap or Protomaps for a Positron-style style — desaturated grey, thin labels, designed as a backdrop for data overlay rather than as a map in its own right. This single choice does more for how the result looks than anything else on this page: your routes become the only saturated thing on screen instead of competing with road colours.

**Don't use Mapbox GL JS.** Same API, but it requires an account, a token, and has per-view billing. MapLibre is the fork created specifically to avoid that.

---

### deck.gl — arcs for the air legs

Rail legs stay flat on the ground as MapLibre line layers. Flights get deck.gl's `ArcLayer`, which draws a curve lifting off the surface between origin and destination — the look familiar from flight-network visualisations.

This isn't only decoration. Rail follows the terrain and air doesn't, so a flat line versus a lifted arc encodes a real distinction that needs no legend. It also solves the Mercator problem: a straight two-point line between distant airports is geometrically wrong, and the arc sidesteps it without you interpolating a great circle by hand.

**How it attaches.** deck.gl overlays onto an existing MapLibre map rather than replacing it — you keep your basemap, your rail layers, and your interaction handling, and deck.gl renders into the same WebGL context on top. The `MapboxOverlay` class is the interop layer and works with MapLibre despite the name.

```js
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer } from '@deck.gl/layers';

const overlay = new MapboxOverlay({
  layers: [
    new ArcLayer({
      id: 'flights',
      data: '/api/legs?mode=air',
      getSourcePosition: d => d.origin,      // [lon, lat]
      getTargetPosition: d => d.dest,
      getSourceColor: [184, 117, 3],
      getTargetColor: [184, 117, 3],
      getWidth: 1.5,
      getHeight: 0.4,                        // arc curvature
      greatCircle: true
    })
  ]
});

map.addControl(overlay);
```

**Two parameters worth tuning.** `getHeight` controls how far the arc lifts — at the scale of European flights, values well under the default read better; a high arc over a short hop looks absurd. And `greatCircle: true` makes the arc follow the actual shortest path over the earth rather than a plain curve, which is the correct geometry and removes any need for turf.

**Note the data shape.** deck.gl wants raw coordinate pairs, not GeoJSON — `getSourcePosition` returns `[lon, lat]`. So your `/api/legs?mode=air` endpoint should return plain JSON with origin and destination coordinates, while `/api/map` keeps returning GeoJSON for the MapLibre rail layers. Two endpoints with different shapes, feeding two rendering paths.

**Build the flat version first.** Get rail lines rendering in plain MapLibre, confirm the map works, then add the overlay. deck.gl is an extra dependency and an extra rendering model; adding it before the basics work makes debugging harder than it needs to be.

---

### Supporting cast

- **deck.gl** — `@deck.gl/mapbox` and `@deck.gl/layers` for the arc overlay
- **turf.js** — optional now that `ArcLayer` handles great circles; still useful for bounding boxes and ad-hoc distance checks
- **gtfs-kit** (Python) — convenience wrapper for GTFS if you'd rather not write raw SQL for parts of the transform
- **MobilityData GTFS validator** — the official Java validator, run in the fetcher
- **Trainline stations CSV** — pan-European station reference with UIC and per-operator ids; ODbL, so share-alike applies if you publish modifications
- **OurAirports CSV** — the airport reference table; public domain, IATA and ICAO codes, coordinates. Filter to `large_airport`/`medium_airport` with `scheduled_service` = yes, or you'll load 80,000 grass strips

---

## Schema sketch

```sql
-- reference data, regenerable
places (
  id, kind,            -- 'station' | 'airport'
  name, country,
  uic, iata, icao,     -- whichever applies
  geom geography(Point)
)

trip_index (
  id, feed_id, train_number, service_date,
  operator, origin_place_id, dest_place_id,
  geom geography(LineString),
  UNIQUE (feed_id, train_number, service_date)
)

trip_index_stops (
  trip_index_id, place_id, seq, arrival, departure
)

-- yours, irreplaceable, fully denormalized
legs (
  id, mode,            -- 'rail' | 'air'
  number,              -- 'ICE 573' | 'LH400'
  travel_date, operator,
  origin_place_id, dest_place_id,
  distance_km,
  geom geography(LineString),
  source,              -- 'lookup' | 'manual'
  created_at
)

leg_stops (
  leg_id, place_id, seq, arrival, departure, boarded bool
)
```

`boarded` on `leg_stops` is what lets you toggle between "stations I set foot in" and "stations I passed through" without storing the data twice.

---

## Build order

1. **Download one feed today and check its window.** Start with a rail-only feed if one exists for your main country. Run the `calendar.txt` date-range query. If it covers your travel dates, archive the zip immediately — the current timetable period ends mid-December and that coverage disappears with it. If it doesn't, pull snapshots from Transitland or the Mobility Database for the dates you need.
2. **Prove the lookup works.** In a DuckDB session, query `trips.txt` joined to `calendar.txt` for one of your actual train numbers. If `trip_short_name` comes back populated and in the format you expect, the architecture holds and the rest is assembly. If it's empty, you need to know that before building anything on top of it.
3. Transform properly — calendar expansion, stop times, shapes — still in a notebook. No web app yet.
4. Load into Postgres, add the `legs` table, enter your journeys.
5. Put a map on it — MapLibre, muted basemap, rail as flat lines. This is the moment the project becomes fun.
6. Add the deck.gl `ArcLayer` overlay for flights once the flat version renders correctly.
7. Only then build the lookup UI, add remaining countries, and wire up the nightly cron.

Steps 1–6 are a weekend. Step 7 is where the long tail lives.

---

## Fallback

If the GTFS route stalls — feeds don't cover your dates, `trip_short_name` isn't populated, encodings fight you — there is a much smaller version that still produces the map: load the Trainline and OurAirports CSVs into `places`, log legs as origin/destination pairs with straight-line geometry, and skip the pipeline entirely. It's an evening's work.

That version is a strict subset of this one. `places` is the same table, `legs` just has a null `geom`. You can start there and add the pipeline as an enrichment pass later without discarding anything.
