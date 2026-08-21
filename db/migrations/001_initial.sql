begin;

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- Reference data. IDs deliberately match the browser catalogs
-- (for example trainline-10493 and ourairports-2212).
create table if not exists places (
  id text primary key,
  kind text not null check (kind in ('station', 'airport')),
  source text not null check (source in ('trainline', 'ourairports')),
  source_id text not null,
  name text not null,
  city text not null,
  country char(2) not null,
  uic text,
  iata text,
  icao text,
  geom geography(Point, 4326) not null,
  unique (source, source_id)
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
  origin_place_id text not null references places(id),
  destination_place_id text not null references places(id),
  geom geography(LineString, 4326),
  unique (feed_id, train_number, service_date)
);

create table if not exists trip_index_stops (
  trip_index_id uuid not null references trip_index(id) on delete cascade,
  place_id text not null references places(id),
  sequence integer not null,
  arrival time,
  departure time,
  primary key (trip_index_id, sequence)
);

-- Personal data: durable and never rebuilt from the trip index.
create table if not exists legs (
  id text primary key,
  mode text not null check (mode in ('rail', 'air')),
  number text not null,
  travel_date date not null,
  operator text,
  origin_place_id text not null references places(id),
  destination_place_id text not null references places(id),
  distance_km numeric(10, 1) not null,
  geom geography(LineString, 4326) not null,
  source text not null check (source in ('lookup', 'manual')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists leg_stops (
  leg_id text not null references legs(id) on delete cascade,
  place_id text not null references places(id),
  sequence integer not null,
  arrival time,
  departure time,
  boarded boolean not null default false,
  primary key (leg_id, sequence)
);

-- These tables are accessed only through server-side service-role calls. RLS
-- prevents accidental browser access if an anon key is added elsewhere later.
alter table places enable row level security;
alter table feed_fetches enable row level security;
alter table trip_index enable row level security;
alter table trip_index_stops enable row level security;
alter table legs enable row level security;
alter table leg_stops enable row level security;

create index if not exists places_geom_gist_idx on places using gist (geom);
create index if not exists places_lower_name_idx on places (lower(name));
create index if not exists trip_index_lookup_idx on trip_index (upper(train_number), service_date);
create index if not exists legs_travel_date_idx on legs (travel_date desc);
create index if not exists legs_geom_gist_idx on legs using gist (geom);

create or replace function rail_log_place_json(place_row places)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', place_row.id,
    'kind', place_row.kind,
    'name', place_row.name,
    'city', place_row.city,
    'country', place_row.country,
    'code', coalesce(place_row.uic, place_row.iata, place_row.icao, ''),
    'coordinates', jsonb_build_array(
      ST_X(place_row.geom::geometry),
      ST_Y(place_row.geom::geometry)
    )
  );
$$;

create or replace function rail_log_upsert_place(place_payload jsonb)
returns text
language plpgsql
set search_path = public
as $$
declare
  place_id text := place_payload->>'id';
  place_kind text := place_payload->>'kind';
  place_code text := coalesce(place_payload->>'code', '');
  place_source text;
  place_source_id text;
begin
  if place_id is null or place_kind not in ('station', 'airport') then
    raise exception 'Invalid place payload';
  end if;

  place_source := case
    when place_id like 'trainline-%' then 'trainline'
    when place_id like 'ourairports-%' then 'ourairports'
    else case when place_kind = 'station' then 'trainline' else 'ourairports' end
  end;
  place_source_id := regexp_replace(place_id, '^[^-]+-', '');

  insert into places (
    id, kind, source, source_id, name, city, country,
    uic, iata, icao, geom
  ) values (
    place_id,
    place_kind,
    place_source,
    place_source_id,
    place_payload->>'name',
    coalesce(nullif(place_payload->>'city', ''), place_payload->>'name'),
    place_payload->>'country',
    case when place_kind = 'station' and place_code ~ '^[0-9]+$' then place_code end,
    case when place_kind = 'airport' and length(place_code) = 3 then place_code end,
    case when place_kind = 'airport' and length(place_code) = 4 then place_code end,
    ST_SetSRID(
      ST_MakePoint(
        (place_payload->'coordinates'->>0)::double precision,
        (place_payload->'coordinates'->>1)::double precision
      ),
      4326
    )::geography
  )
  on conflict (id) do update set
    name = excluded.name,
    city = excluded.city,
    country = excluded.country,
    uic = coalesce(excluded.uic, places.uic),
    iata = coalesce(excluded.iata, places.iata),
    icao = coalesce(excluded.icao, places.icao),
    geom = excluded.geom;

  return place_id;
end;
$$;

create or replace function save_journey(journey jsonb)
returns text
language plpgsql
set search_path = public
as $$
declare
  origin_id text;
  destination_id text;
  stop_payload jsonb;
  stop_place_id text;
  route_geometry geometry(LineString, 4326);
  direct_distance numeric(10, 1);
begin
  if journey->>'id' is null or journey->>'mode' not in ('rail', 'air') then
    raise exception 'Invalid journey payload';
  end if;

  origin_id := rail_log_upsert_place(journey->'origin');
  destination_id := rail_log_upsert_place(journey->'destination');

  if jsonb_typeof(journey->'geometry') = 'array' and jsonb_array_length(journey->'geometry') >= 2 then
    select ST_SetSRID(
      ST_MakeLine(
        array_agg(
          ST_MakePoint(
            (coordinate->>0)::double precision,
            (coordinate->>1)::double precision
          ) order by position
        )
      ),
      4326
    )
    into route_geometry
    from jsonb_array_elements(journey->'geometry') with ordinality as points(coordinate, position);
  else
    select ST_SetSRID(ST_MakeLine(origin.geom::geometry, destination.geom::geometry), 4326)
    into route_geometry
    from places origin, places destination
    where origin.id = origin_id and destination.id = destination_id;
  end if;

  select round((ST_Distance(origin.geom, destination.geom) / 1000)::numeric, 1)
  into direct_distance
  from places origin, places destination
  where origin.id = origin_id and destination.id = destination_id;

  insert into legs (
    id, mode, number, travel_date, operator, origin_place_id,
    destination_place_id, distance_km, geom, source, created_at
  ) values (
    journey->>'id',
    journey->>'mode',
    journey->>'number',
    (journey->>'travelDate')::date,
    nullif(journey->>'operator', ''),
    origin_id,
    destination_id,
    direct_distance,
    route_geometry::geography,
    journey->>'source',
    coalesce((journey->>'createdAt')::timestamptz, now())
  )
  on conflict (id) do update set
    mode = excluded.mode,
    number = excluded.number,
    travel_date = excluded.travel_date,
    operator = excluded.operator,
    origin_place_id = excluded.origin_place_id,
    destination_place_id = excluded.destination_place_id,
    distance_km = excluded.distance_km,
    geom = excluded.geom,
    source = excluded.source;

  delete from leg_stops where leg_id = journey->>'id';

  if jsonb_typeof(journey->'stops') = 'array' and jsonb_array_length(journey->'stops') > 0 then
    for stop_payload in select value from jsonb_array_elements(journey->'stops') loop
      stop_place_id := rail_log_upsert_place(stop_payload->'place');
      insert into leg_stops (
        leg_id, place_id, sequence, arrival, departure, boarded
      ) values (
        journey->>'id',
        stop_place_id,
        (stop_payload->>'sequence')::integer,
        nullif(stop_payload->>'arrival', '')::time,
        nullif(stop_payload->>'departure', '')::time,
        coalesce((stop_payload->>'boarded')::boolean, false)
      );
    end loop;
  else
    insert into leg_stops (leg_id, place_id, sequence, boarded) values
      (journey->>'id', origin_id, 1, true),
      (journey->>'id', destination_id, 2, true);
  end if;

  return journey->>'id';
end;
$$;

create or replace function import_journeys(
  journeys jsonb,
  replace_existing boolean default false,
  only_if_empty boolean default false
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  journey_payload jsonb;
  imported integer := 0;
begin
  if jsonb_typeof(journeys) <> 'array' then
    raise exception 'Journeys must be a JSON array';
  end if;
  if only_if_empty and exists (select 1 from legs limit 1) then
    return 0;
  end if;
  if replace_existing then
    delete from legs;
  end if;

  for journey_payload in select value from jsonb_array_elements(journeys) loop
    perform save_journey(journey_payload);
    imported := imported + 1;
  end loop;
  return imported;
end;
$$;

create or replace function get_journeys(requested_mode text default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', leg.id,
        'mode', leg.mode,
        'number', leg.number,
        'travelDate', leg.travel_date,
        'operator', coalesce(leg.operator, 'Unknown operator'),
        'origin', rail_log_place_json(origin),
        'destination', rail_log_place_json(destination),
        'distanceKm', leg.distance_km,
        'geometry', (ST_AsGeoJSON(leg.geom::geometry)::jsonb)->'coordinates',
        'source', leg.source,
        'createdAt', leg.created_at,
        'stops', coalesce(
          (
            select jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'place', rail_log_place_json(stop_place),
                  'sequence', stop.sequence,
                  'arrival', stop.arrival,
                  'departure', stop.departure,
                  'boarded', stop.boarded
                )
              ) order by stop.sequence
            )
            from leg_stops stop
            join places stop_place on stop_place.id = stop.place_id
            where stop.leg_id = leg.id
          ),
          '[]'::jsonb
        )
      ) order by leg.travel_date desc, leg.created_at desc
    ),
    '[]'::jsonb
  )
  from legs leg
  join places origin on origin.id = leg.origin_place_id
  join places destination on destination.id = leg.destination_place_id
  where requested_mode is null or leg.mode = requested_mode;
$$;

revoke execute on function rail_log_upsert_place(jsonb) from public, anon, authenticated;
revoke execute on function save_journey(jsonb) from public, anon, authenticated;
revoke execute on function import_journeys(jsonb, boolean, boolean) from public, anon, authenticated;
revoke execute on function get_journeys(text) from public, anon, authenticated;
grant execute on function rail_log_upsert_place(jsonb) to service_role;
grant execute on function save_journey(jsonb) to service_role;
grant execute on function import_journeys(jsonb, boolean, boolean) to service_role;
grant execute on function get_journeys(text) to service_role;

commit;
