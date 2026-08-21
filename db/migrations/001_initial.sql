create extension if not exists postgis;
create extension if not exists pgcrypto;

-- Reference data: regenerated from archived GTFS feeds.
create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('station', 'airport')),
  name text not null,
  country char(2) not null,
  uic text,
  iata text,
  icao text,
  geom geography(Point, 4326) not null
);

create table if not exists feed_fetches (
  id bigint generated always as identity primary key,
  feed_id text not null,
  fetched_at timestamptz not null default now(),
  http_status integer,
  file_hash text,
  validator_error_count integer,
  archive_key text,
  error_message text
);

create table if not exists trip_index (
  id uuid primary key default gen_random_uuid(),
  feed_id text not null,
  train_number text not null,
  service_date date not null,
  operator text,
  origin_place_id uuid not null references places(id),
  destination_place_id uuid not null references places(id),
  geom geography(LineString, 4326),
  unique (feed_id, train_number, service_date)
);

create table if not exists trip_index_stops (
  trip_index_id uuid not null references trip_index(id) on delete cascade,
  place_id uuid not null references places(id),
  sequence integer not null,
  arrival time,
  departure time,
  primary key (trip_index_id, sequence)
);

-- Personal data: durable and never rebuilt from the trip index.
create table if not exists legs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('rail', 'air')),
  number text not null,
  travel_date date not null,
  operator text,
  origin_place_id uuid not null references places(id),
  destination_place_id uuid not null references places(id),
  distance_km numeric(10, 2),
  geom geography(LineString, 4326),
  source text not null check (source in ('lookup', 'manual')),
  created_at timestamptz not null default now()
);

create table if not exists leg_stops (
  leg_id uuid not null references legs(id) on delete cascade,
  place_id uuid not null references places(id),
  sequence integer not null,
  arrival time,
  departure time,
  boarded boolean not null default false,
  primary key (leg_id, sequence)
);

create index if not exists places_geom_gist_idx on places using gist (geom);
create index if not exists places_lower_name_idx on places (lower(name));
create index if not exists trip_index_lookup_idx on trip_index (upper(train_number), service_date);
create index if not exists legs_travel_date_idx on legs (travel_date desc);
create index if not exists legs_geom_gist_idx on legs using gist (geom);
