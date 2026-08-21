# Travel log — what to fix next

Current state: Next.js 16 / React / TypeScript, MapLibre + deck.gl, place search over Trainline and OurAirports, six API routes, journeys in localStorage. Postgres/PostGIS scaffolded but not connected.

Ordered by consequence, not by effort. The first item is the only one that can lose you data.

---

## P0 — Do today

### 1. Your summer has no exit

Journeys exist in exactly one browser profile with no copy anywhere. localStorage is cleared by cache clears, by browser resets, by switching devices, and by Safari's automatic eviction of storage from sites you haven't visited in a while. There is no undo.

The architecture always assumed the trip index is regenerable and the personal log is not. Right now the irreplaceable half is the only part with no durability.

**Ship export first.** It is ~20 lines and removes the catastrophic case immediately, without waiting on the database.

```ts
function exportJournal() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    journeys: loadJourneys(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travel-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Import is the same in reverse: file input, `JSON.parse`, validate `version`, merge or replace. Include the `version` field now — future-you will change the shape and want to migrate old exports.

**Then export before every session** until Postgres is connected.

---

## P1 — This week

### 2. Connect Supabase

This is already scaffolded, and item 1 reframes it: it's not an architecture chore, it's the fix for your biggest risk.

Two tables, matching the doc's schema. `places` is reference data you load once from `places.csv`; `legs` is your log.

```sql
create extension if not exists postgis;

create table places (
  id          bigserial primary key,
  kind        text not null,          -- 'station' | 'airport'
  source      text not null,          -- 'trainline' | 'ourairports'
  source_id   text not null,
  name        text not null,
  country     text,
  uic         text,
  iata        text,
  icao        text,
  geom        geography(Point, 4326) not null,
  unique (source, source_id)
);

create table legs (
  id           bigserial primary key,
  mode         text not null,         -- 'rail' | 'air'
  travel_date  date not null,
  origin_id    bigint not null references places(id),
  dest_id      bigint not null references places(id),
  number       text,                  -- 'ICE 573' | 'LH400'
  operator     text,
  distance_km  numeric,
  geom         geography(LineString, 4326),
  source       text not null default 'manual',   -- 'manual' | 'lookup'
  note         text,
  created_at   timestamptz default now()
);

create index on places using gist (geom);
create index on places (lower(name));
create index on legs (travel_date);
```

Loading `places.csv` — it has lat/lon columns, so build the geometry on insert:

```sql
create temp table places_raw (
  kind text, source text, source_id text, name text,
  country text, uic text, iata text, icao text,
  lat double precision, lon double precision
);

\copy places_raw from 'places.csv' with (format csv, header true);

insert into places (kind, source, source_id, name, country, uic, iata, icao, geom)
select kind, source, source_id, name, country, uic, iata, icao,
       ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
from places_raw
on conflict (source, source_id) do nothing;
```

Note `ST_MakePoint(lon, lat)` — longitude first. Reversing these is the single most common PostGIS mistake and puts every European station in the Indian Ocean.

**Migration path from localStorage:** on first load after connecting, if localStorage has journeys and the database is empty, POST them up and keep the local copy as a backup rather than deleting it.

Keep `distance_km` computed server-side so it can't drift:

```sql
update legs set distance_km = round((ST_Distance(o.geom, d.geom) / 1000)::numeric, 1)
from places o, places d
where o.id = legs.origin_id and d.id = legs.dest_id and legs.distance_km is null;
```

---

### 3. Fix the station filter

52,000 stations is `is_suggestable='t'` with no further filtering, which means roughly 22,000 Swiss PostAuto bus stops are in your search index. Search "Bern" and you wade through bus shelters.

The discriminator is `uic IS NOT NULL` — UIC codes are only issued to railway stations, so Switzerland drops from 22,235 to 361 real ones.

**Don't hard-filter on it.** Some genuine small halts have no UIC code, and dropping them means you can't log a journey you actually took. Instead, rank:

```ts
// in the search index build
const score = (row) => {
  let s = 0;
  if (row.uic) s += 100;                 // real rail station
  if (row.is_main_station === 't') s += 50;
  return s;
};
```

Then sort by `score` before fuzzy relevance, or blend the two. Full coverage retained, noise pushed off the first page.

Same principle for airports: `large_airport` above `medium_airport`, and boost anything with an IATA code.

---

### 4. Dates

Nothing in the current stats references time — no date range, no season filter, no chronological ordering. The original goal was *everywhere I went this summer*, and the year-in-review view is the thing people actually open in December.

If `travel_date` isn't on the model yet, add it before logging fifty journeys and having to reconstruct dates from memory.

What it unlocks, all cheap once the column exists:

- Date range filter on the map (a slider over `min(travel_date)`–`max(travel_date)`)
- Journeys sorted chronologically in the list
- "First trip / last trip / busiest month" stats
- Animating the map in date order, which is the single most impressive thing you can build on this data

---

## P2 — Entry friction

You have a whole summer to log. If each journey takes a minute, you'll enter the memorable ones and quietly skip the routine ones — and the map ends up holed exactly where your everyday travel was. This is the difference between a complete record and an anecdotal one.

Cheapest wins, roughly in order of value per line of code:

**Reverse button.** One click on an existing journey creates the return leg with origin and destination swapped. Probably halves your total typing, since most trips are round trips.

**Sticky date.** Default the date field to the last entered journey's date rather than today. Travel clusters — you'll often enter three legs from one day in a row.

**Sticky origin.** Default the origin to the previous journey's destination. Multi-leg days become two fields instead of four.

**Recent places first.** Show your last ~10 used places above search results. After a week of logging, most entries become one click.

**Edit, not just add and remove.** You will typo a station on entry twelve, and delete-and-retype is a bad answer.

**Keyboard-only entry.** Tab through, arrow keys in the autocomplete, Enter to submit. If you can log a journey without touching the mouse, you'll log all of them.

---

## P3 — Data quality

### 5. The December deadline

Train-number lookup is scaffolded with no GTFS behind it. That's fine as a deferred feature, with one exception that expires.

GTFS feeds describe the current timetable period, not history. The current period runs to mid-December 2026. After that, your May–August journeys can't be resolved from a live download and you'd be pulling archived snapshots from Transitland or the Mobility Database instead.

**Download one national feed now and park the zip.** Five minutes, and it removes the deadline permanently — whether or not you touch GTFS for months.

Your range also straddles the mid-June timetable change, so:

- May 1 → mid-June is in the previous period — already expired, needs an archive fetch
- Mid-June → Aug 31 is in the current period — a live download still covers it

Two files per country, not eighteen. Check what you've actually got before assuming:

```bash
duckdb -c "SELECT min(start_date), max(end_date) FROM read_csv('de/calendar.txt');"
```

Prefer a full-period feed. The free gtfs.de feeds only cover 7 days forward and won't contain your summer at all.

### 6. Rail distance

Great-circle undercuts real rail distance by roughly 20%, worse through mountains. It only truly resolves with `shapes.txt` geometry from GTFS.

Interim: show both, clearly labelled. `1,240 km direct · ~1,490 km estimated`. Store the honest geodesic figure in `distance_km` and apply the factor at display time only — never bake a fudge into stored data.

---

## P4 — If the resume angle still matters

You mentioned this early on and it changes what "done" means.

**Deploy it.** A live URL is worth more than the next three features. Vercel plus Supabase is a git push. Nobody clones a repo to evaluate you.

**README with a screenshot at the top.** The map is the product; lead with a picture of it. Then a short section on the data pipeline — where the station data comes from, the filters and why they're needed, the batch-versus-serving split. The interesting engineering here is invisible in the UI, so say it out loud.

**Seed data or a demo mode.** An empty app tells a visitor nothing. Ship a sample journal that loads with one click so the map has something on it.

**Write down the scoping decision.** That you started with manual entry and endpoint-only geometry, and left GTFS route resolution as a documented phase two, is a stronger signal than a half-finished pipeline would be. Put it in the README as "design decisions" rather than leaving it to look like an omission.

---

## Suggested order

| When | Item |
|---|---|
| Today | Export/import JSON |
| Today | Download and archive one GTFS feed |
| This week | Supabase connected, places loaded, legs migrated |
| This week | `travel_date` on the model |
| This week | UIC ranking in search |
| Next | Reverse button, sticky date, sticky origin |
| Next | Deploy + README |
| Later | GTFS trip resolution, real route geometry |

Two things are genuinely time-sensitive: the export button, because localStorage can vanish tonight; and the feed archive, because the timetable period ends in December. Everything else can wait as long as you like.
